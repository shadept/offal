/**
 * Gas System — processes gas diffusion, dissipation, and gas-entity
 * interactions each turn.
 *
 * Gases diffuse in all 8 directions (including diagonals), spread quickly,
 * and dissipate over time. Unlike liquids which pool in place, gases
 * actively move and thin out — think smoke drifting vs water pooling.
 *
 * Toxic gases damage organic entities. Handled here rather than in the
 * fire system because toxicity is a gas property, not a fire property.
 *
 * Architecture: logic only. Pushes visual events to the queue.
 */
import { query, hasComponent, addComponent } from 'bitecs';
import { Position, Health, Dead } from '../components';
import { getRegistry } from '../../data/loader';
import type { TileMap } from '../../map/TileMap';
import type { TilePhysicsMap } from './tilePhysics';
import type { VisualEventQueue } from '../../visual/EventQueue';

/** 8-directional adjacency (cardinal + diagonal) */
const ADJ8 = [
  { dx: -1, dy: 0 },
  { dx: 1, dy: 0 },
  { dx: 0, dy: -1 },
  { dx: 0, dy: 1 },
  { dx: -1, dy: -1 },
  { dx: 1, dy: -1 },
  { dx: -1, dy: 1 },
  { dx: 1, dy: 1 },
];

/** Minimum concentration to be considered present */
const MIN_CONCENTRATION = 0.01;

/** Default diffusion rate if not specified on material */
const DEFAULT_DIFFUSION_RATE = 0.2;

/** Default dissipation rate if not specified on material */
const DEFAULT_DISSIPATION_RATE = 0.03;

/**
 * Run gas system for one turn.
 * - Gases diffuse toward neighbors with lower concentration (8-dir).
 * - Gases dissipate (fade) over time.
 * - Toxic gases damage organic entities standing in them.
 * - When a tile gains new gas, push a gas_spread visual event.
 */
export function processGasSystem(
  tileMap: TileMap,
  physics: TilePhysicsMap,
  world: object,
  entitySpeciesMap: Map<number, string>,
  eventQueue: VisualEventQueue,
): void {
  const registry = getRegistry();

  // Snapshot current gas state to avoid mutation during iteration
  const gasSnapshot: { x: number; y: number; gasId: string; concentration: number }[] = [];

  for (let y = 0; y < physics.height; y++) {
    for (let x = 0; x < physics.width; x++) {
      const state = physics.get(x, y)!;
      for (const [gasId, conc] of state.gases) {
        if (conc > MIN_CONCENTRATION) {
          gasSnapshot.push({ x, y, gasId, concentration: conc });
        }
      }
    }
  }

  // Track tiles that gain gas this turn (for visual events)
  const newGasTiles = new Set<string>();

  // Process diffusion
  for (const { x, y, gasId, concentration } of gasSnapshot) {
    const material = registry.materials.get(gasId);
    const diffusionRate = material?.diffusionRate ?? DEFAULT_DIFFUSION_RATE;

    // Only diffuse if concentration is meaningful
    if (concentration < 0.05) continue;

    // Find passable neighbors (gases don't pass through walls)
    const neighbors: { x: number; y: number }[] = [];
    for (const { dx, dy } of ADJ8) {
      const nx = x + dx;
      const ny = y + dy;
      if (!physics.inBounds(nx, ny)) continue;
      if (tileMap.blocksMovement(nx, ny)) continue;
      neighbors.push({ x: nx, y: ny });
    }

    if (neighbors.length === 0) continue;

    // Diffuse toward lower-concentration neighbors
    const amountPerNeighbor = (concentration * diffusionRate) / neighbors.length;

    for (const n of neighbors) {
      const neighborConc = physics.getGas(n.x, n.y, gasId);
      // Only flow from higher to lower concentration
      if (neighborConc >= concentration) continue;

      const transfer = Math.min(amountPerNeighbor, (concentration - neighborConc) * 0.5);
      if (transfer < MIN_CONCENTRATION) continue;

      const hadGas = physics.getGas(n.x, n.y, gasId) > MIN_CONCENTRATION;
      physics.addGas(n.x, n.y, gasId, transfer);

      // Reduce source
      const sourceState = physics.get(x, y)!;
      const newConc = (sourceState.gases.get(gasId) ?? 0) - transfer;
      if (newConc <= MIN_CONCENTRATION) {
        sourceState.gases.delete(gasId);
      } else {
        sourceState.gases.set(gasId, newConc);
      }

      // Track new gas tiles for visual events
      if (!hadGas) {
        newGasTiles.add(`${n.x},${n.y},${gasId}`);
      }
    }
  }

  // Dissipation
  for (let y = 0; y < physics.height; y++) {
    for (let x = 0; x < physics.width; x++) {
      const state = physics.get(x, y)!;
      const toDelete: string[] = [];
      for (const [gasId, conc] of state.gases) {
        const material = registry.materials.get(gasId);
        const dissipationRate = material?.dissipationRate ?? DEFAULT_DISSIPATION_RATE;
        const newConc = conc - dissipationRate;
        if (newConc <= MIN_CONCENTRATION) {
          toDelete.push(gasId);
        } else {
          state.gases.set(gasId, newConc);
        }
      }
      for (const id of toDelete) {
        state.gases.delete(id);
      }
    }
  }

  // Toxic gas damage to organic entities
  const { gasRules } = registry.physicsRules;
  if (gasRules) {
    const livingEntities = query(world, [Position, Health]);
    for (const eid of livingEntities) {
      if (hasComponent(world, eid, Dead)) continue;
      const ex = Position.x[eid];
      const ey = Position.y[eid];
      const state = physics.get(ex, ey);
      if (!state) continue;

      // Check each gas on this tile for toxic tag
      for (const [gasId, conc] of state.gases) {
        if (conc < gasRules.toxicThreshold) continue;
        const material = registry.materials.get(gasId);
        if (!material?.tags?.includes('toxic')) continue;

        // Only damage organic entities
        const speciesId = entitySpeciesMap.get(eid);
        const species = speciesId ? registry.species.get(speciesId) : null;
        if (!species?.spawnTags?.includes('organic')) continue;

        Health.hp[eid] -= gasRules.toxicDamagePerTurn;
        eventQueue.push({
          type: 'hit_flash',
          entityId: eid,
          data: { damage: gasRules.toxicDamagePerTurn, source: 'toxic_gas' },
        });

        if (Health.hp[eid] <= 0) {
          addComponent(world, eid, Dead);
          eventQueue.push({
            type: 'death',
            entityId: eid,
            data: { cause: 'toxic_gas' },
          });
        }
        break; // one toxic gas hit per entity per turn
      }
    }
  }

  // Push visual events for new gas tiles
  for (const key of newGasTiles) {
    const [xs, ys, gasId] = key.split(',');
    const x = parseInt(xs, 10);
    const y = parseInt(ys, 10);
    const material = registry.materials.get(gasId);
    eventQueue.push({
      type: 'gas_spread',
      entityId: -1,
      data: { x, y, gasId, color: material?.color ?? '#888888' },
    });
  }
}
