/**
 * Fluid System — processes fluid spread, evaporation, and entity
 * contamination each turn.
 *
 * Fluids spread to adjacent walkable tiles based on viscosity.
 * Evaporation reduces concentration over time.
 * Entities standing on fluid tiles gain contamination surface states.
 * Fluid-fire interactions are handled by the fire system.
 *
 * Architecture: logic only. Pushes visual events to the queue.
 */
import { query, hasComponent } from 'bitecs';
import { Position, Health, Dead } from '../components';
import { getRegistry } from '../../data/loader';
import type { TileMap } from '../../map/TileMap';
import type { TilePhysicsMap } from './tilePhysics';
import type { EntityPhysicsMap } from './entityPhysics';
import type { VisualEventQueue } from '../../visual/EventQueue';

/** Cardinal adjacency offsets */
const ADJ = [
  { dx: -1, dy: 0 },
  { dx: 1, dy: 0 },
  { dx: 0, dy: -1 },
  { dx: 0, dy: 1 },
];

/** Minimum concentration to be considered present */
const MIN_CONCENTRATION = 0.01;

/** How much fluid spreads to neighbors per turn (base, modified by viscosity).
 *  Kept low so liquids mostly pool in place (think puddle, not flood). */
const BASE_SPREAD_RATE = 0.04;

/** Map fluid tags to entity surface state names */
const FLUID_TAG_TO_STATE: Record<string, string> = {
  suppresses_fire: 'wet',
  intensifies_fire: 'oily',
};

/** Minimum fluid concentration to contaminate an entity */
const CONTAMINATION_THRESHOLD = 0.15;

/**
 * Run fluid system for one turn.
 * - Fluids spread to adjacent walkable tiles (rate from viscosity).
 * - Fluids evaporate over time.
 * - Entities on fluid tiles gain contamination surface states.
 * - When a tile gains new fluid, push a fluid_spread visual event.
 */
export function processFluidSystem(
  tileMap: TileMap,
  physics: TilePhysicsMap,
  world: object,
  entityPhysics: EntityPhysicsMap,
  eventQueue: VisualEventQueue,
): void {
  const registry = getRegistry();

  // Snapshot current fluid state to avoid mutation during iteration
  const fluidSnapshot: { x: number; y: number; fluidId: string; concentration: number }[] = [];

  for (let y = 0; y < physics.height; y++) {
    for (let x = 0; x < physics.width; x++) {
      const state = physics.get(x, y)!;
      for (const [fluidId, conc] of state.fluids) {
        if (conc > MIN_CONCENTRATION) {
          fluidSnapshot.push({ x, y, fluidId, concentration: conc });
        }
      }
    }
  }

  // Track tiles that gain fluid this turn (for visual events)
  const newFluidTiles = new Set<string>();

  // Process spreading
  for (const { x, y, fluidId, concentration } of fluidSnapshot) {
    const material = registry.materials.get(fluidId);
    const viscosity = material?.viscosity ?? 0.5;

    // Higher viscosity = slower spread
    const spreadRate = BASE_SPREAD_RATE * (1 - viscosity * 0.8);

    // Only spread if concentration is high enough
    if (concentration < 0.1) continue;

    // Find walkable neighbors
    const neighbors: { x: number; y: number }[] = [];
    for (const { dx, dy } of ADJ) {
      const nx = x + dx;
      const ny = y + dy;
      if (!tileMap.inBounds(nx, ny)) continue;
      if (tileMap.blocksMovement(nx, ny)) continue;
      neighbors.push({ x: nx, y: ny });
    }

    if (neighbors.length === 0) continue;

    // Spread evenly to neighbors that have less concentration
    const amountPerNeighbor = (concentration * spreadRate) / neighbors.length;

    for (const n of neighbors) {
      const neighborConc = physics.getFluid(n.x, n.y, fluidId);
      // Only flow downhill (from higher to lower concentration)
      if (neighborConc >= concentration) continue;

      const transfer = Math.min(amountPerNeighbor, concentration - neighborConc);
      if (transfer < MIN_CONCENTRATION) continue;

      const hadFluid = physics.getFluid(n.x, n.y, fluidId) > MIN_CONCENTRATION;
      physics.addFluid(n.x, n.y, fluidId, transfer);

      // Reduce source
      const sourceState = physics.get(x, y)!;
      const newConc = (sourceState.fluids.get(fluidId) ?? 0) - transfer;
      if (newConc <= MIN_CONCENTRATION) {
        sourceState.fluids.delete(fluidId);
      } else {
        sourceState.fluids.set(fluidId, newConc);
      }

      // Track new fluid tiles for visual events
      if (!hadFluid) {
        const key = `${n.x},${n.y},${fluidId}`;
        newFluidTiles.add(key);
      }
    }
  }

  // Evaporation
  for (let y = 0; y < physics.height; y++) {
    for (let x = 0; x < physics.width; x++) {
      const state = physics.get(x, y)!;
      const toDelete: string[] = [];
      for (const [fluidId, conc] of state.fluids) {
        const material = registry.materials.get(fluidId);
        const evapRate = material?.evaporationRate ?? 0.01;
        const newConc = conc - evapRate;
        if (newConc <= MIN_CONCENTRATION) {
          toDelete.push(fluidId);
        } else {
          state.fluids.set(fluidId, newConc);
        }
      }
      for (const id of toDelete) {
        state.fluids.delete(id);
      }

      // Remove wet state if no suppressor fluids present
      if (state.surfaceStates.has('wet')) {
        let hasWater = false;
        const { fluidFireInteractions } = registry.physicsRules;
        for (const suppressor of fluidFireInteractions.suppressors) {
          if ((state.fluids.get(suppressor) ?? 0) > MIN_CONCENTRATION) {
            hasWater = true;
            break;
          }
        }
        if (!hasWater) {
          state.surfaceStates.delete('wet');
        }
      }

      // Apply wet state if water-type fluid is present
      const { fluidFireInteractions } = registry.physicsRules;
      for (const suppressor of fluidFireInteractions.suppressors) {
        if ((state.fluids.get(suppressor) ?? 0) > 0.1) {
          state.surfaceStates.add('wet');
          break;
        }
      }
    }
  }

  // Transfer fluid contamination to entities on contact.
  // Standing on fluid resets the duration; walking away lets it degrade naturally.
  const livingEntities = query(world, [Position, Health]);
  for (const eid of livingEntities) {
    if (hasComponent(world, eid, Dead)) continue;
    const ex = Position.x[eid];
    const ey = Position.y[eid];
    const state = physics.get(ex, ey);
    if (!state) continue;

    for (const [fluidId, conc] of state.fluids) {
      if (conc < CONTAMINATION_THRESHOLD) continue;
      const material = registry.materials.get(fluidId);
      if (!material?.tags) continue;
      const duration = material.contaminationDuration ?? 0;
      if (duration <= 0) continue;
      for (const tag of material.tags) {
        const surfaceState = FLUID_TAG_TO_STATE[tag];
        if (surfaceState) {
          entityPhysics.set(eid, surfaceState, duration);
        }
      }
    }
  }

  // Push visual events for new fluid tiles
  for (const key of newFluidTiles) {
    const [xs, ys, fluidId] = key.split(',');
    const x = parseInt(xs, 10);
    const y = parseInt(ys, 10);
    const material = registry.materials.get(fluidId);
    eventQueue.push({
      type: 'fluid_spread',
      entityId: -1,
      data: { x, y, fluidId, color: material?.color ?? '#4488cc' },
    });
  }
}
