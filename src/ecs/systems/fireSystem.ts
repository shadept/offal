/**
 * Fire System — processes fire spread, damage, and suppression each turn.
 *
 * Reads physics rules from data registry. No hardcoded knowledge of
 * specific materials — behaviour emerges from flammability values and
 * surface states.
 *
 * Architecture: logic only. Pushes visual events to the queue.
 * Never renders directly.
 */
import { query, hasComponent, addComponent } from 'bitecs';
import { Position, Health, Dead, Door, Body, PartMaterial, AttachedTo } from '../components';
import { getRegistry } from '../../data/loader';
import { applyDamage } from '../damage';
import { getPartsOf, getMaterialId, getPartData } from '../body';
import type { TileMap } from '../../map/TileMap';
import type { TilePhysicsMap } from './tilePhysics';
import type { EntityPhysicsMap } from './entityPhysics';
import type { VisualEventQueue } from '../../visual/EventQueue';
import type { PhysicsRuleData } from '../../types';

/** Cardinal adjacency offsets */
const ADJ = [
  { dx: -1, dy: 0 },
  { dx: 1, dy: 0 },
  { dx: 0, dy: -1 },
  { dx: 0, dy: 1 },
];

/** How many turns a body part burns after ignition (refreshed while on fire tile) */
const PART_FIRE_DURATION = 3;
/** Damage per burning part per turn when smoldering (away from fire tile) */
const PART_BURN_DAMAGE = 1;

/**
 * Run fire system for one turn.
 * - Burning tiles damage entities standing on them.
 * - Fire spreads to adjacent tiles if material flammability exceeds threshold.
 * - Wet tiles suppress fire.
 * - Oil fluid on a tile lowers the spread threshold (intensifies fire).
 */
export function processFireSystem(
  tileMap: TileMap,
  physics: TilePhysicsMap,
  world: object,
  entityPhysics: EntityPhysicsMap,
  eventQueue: VisualEventQueue,
): void {
  const registry = getRegistry();
  const fireRule = registry.physicsRules.rules.find(
    (r: PhysicsRuleData) => r.trigger === 'on_fire'
  );
  if (!fireRule || !fireRule.propagatesTo) return;

  const { fluidFireInteractions } = registry.physicsRules;
  const damagePerTurn = fireRule.damagePerTurn ?? 3;
  const baseThreshold = fireRule.propagatesTo.threshold;
  const spreadDelay = fireRule.propagatesTo.delay;

  // Collect currently burning tiles (snapshot to avoid mutation during iteration)
  const burningTiles: { x: number; y: number }[] = [];
  for (let y = 0; y < physics.height; y++) {
    for (let x = 0; x < physics.width; x++) {
      if (physics.hasSurfaceState(x, y, 'on_fire')) {
        burningTiles.push({ x, y });
      }
    }
  }

  // Gas explosion tracking — collect explosions first, process after
  const { gasRules } = registry.physicsRules;
  const explosions: { x: number; y: number }[] = [];

  // Process each burning tile
  const newFires: { x: number; y: number }[] = [];

  for (const { x, y } of burningTiles) {
    const state = physics.get(x, y)!;

    // Check if fire is consumed by a suppressor state
    let suppressed = false;
    for (const consumedBy of fireRule.consumedBy) {
      if (state.surfaceStates.has(consumedBy)) {
        suppressed = true;
        break;
      }
    }

    // Check if a suppressor fluid is present
    for (const suppressor of fluidFireInteractions.suppressors) {
      const conc = state.fluids.get(suppressor) ?? 0;
      if (conc > 0.1) {
        suppressed = true;
        // Consume the fluid
        const remaining = conc - 0.3;
        if (remaining <= 0) {
          state.fluids.delete(suppressor);
        } else {
          state.fluids.set(suppressor, remaining);
        }
        // Add wet state
        state.surfaceStates.add('wet');
        break;
      }
    }

    if (suppressed) {
      state.surfaceStates.delete('on_fire');
      state.temperature = Math.max(0, state.temperature - 50);
      continue;
    }

    // Raise temperature
    state.temperature = Math.min(500, state.temperature + 50);

    // Emit smoke gas (burning things produce smoke)
    const smokeConc = state.gases.get('smoke') ?? 0;
    if (smokeConc < 0.8) {
      state.gases.set('smoke', Math.min(1, smokeConc + 0.15));
    }

    // Check for flammable gas — fire + flammable gas = explosion
    if (gasRules) {
      for (const [gasId, conc] of state.gases) {
        if (conc < gasRules.flammableExplosionThreshold) continue;
        const gasMat = registry.materials.get(gasId);
        if (!gasMat?.tags?.includes('flammable')) continue;
        explosions.push({ x, y });
        break;
      }
    }

    // Damage entities on this tile
    damageEntitiesOnTile(x, y, damagePerTurn, world, entityPhysics, eventQueue);

    // Damage door entities on this tile (doors burn down)
    damageDoorOnTile(x, y, damagePerTurn, tileMap, world, eventQueue);

    // Decrement fire delay
    if (state.fireDelay > 0) {
      state.fireDelay--;
      continue; // Don't spread yet
    }

    // Spread fire to adjacent tiles
    for (const { dx, dy } of ADJ) {
      const nx = x + dx;
      const ny = y + dy;
      if (!physics.inBounds(nx, ny)) continue;

      const neighborState = physics.get(nx, ny)!;
      // Skip if already burning
      if (neighborState.surfaceStates.has('on_fire')) continue;

      // Get material flammability for the neighbor tile
      const tileData = registry.tilesByIndex.get(tileMap.get(nx, ny));
      const materialId = tileData?.material ?? null;
      const material = materialId ? registry.materials.get(materialId) : null;
      const flammability = material?.flammability ?? 0;

      // Check if intensifier fluid lowers the threshold
      let threshold = baseThreshold;
      for (const intensifier of fluidFireInteractions.intensifiers) {
        const conc = neighborState.fluids.get(intensifier) ?? 0;
        if (conc > 0.05) {
          threshold *= fluidFireInteractions.intensifierThresholdMultiplier;
          break;
        }
      }

      if (flammability > threshold) {
        newFires.push({ x: nx, y: ny });
      }
    }
  }

  // Ignite new fires
  for (const { x, y } of newFires) {
    const state = physics.get(x, y)!;
    if (state.surfaceStates.has('on_fire')) continue; // May have been added by another neighbor

    state.surfaceStates.add('on_fire');
    state.fireDelay = spreadDelay;
    state.temperature = Math.min(500, state.temperature + 100);

    // Consume intensifier fluid if present
    const { fluidFireInteractions: ffi } = registry.physicsRules;
    for (const intensifier of ffi.intensifiers) {
      const conc = state.fluids.get(intensifier) ?? 0;
      if (conc > 0) {
        const remaining = conc - 0.2;
        if (remaining <= 0) {
          state.fluids.delete(intensifier);
        } else {
          state.fluids.set(intensifier, remaining);
        }
      }
    }

    // Push visual event
    eventQueue.push({
      type: 'fire_spread',
      entityId: -1,
      data: { x, y },
    });
  }

  // Process gas explosions
  if (gasRules) {
    const exploded = new Set<string>();
    for (const { x, y } of explosions) {
      const key = `${x},${y}`;
      if (exploded.has(key)) continue;
      exploded.add(key);

      const radius = gasRules.explosionRadius;
      const damage = gasRules.explosionDamage;

      // Clear flammable gas and damage entities in radius
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (!physics.inBounds(nx, ny)) continue;
          // Manhattan distance check for diamond-shaped blast
          if (Math.abs(dx) + Math.abs(dy) > radius) continue;

          const nState = physics.get(nx, ny)!;

          // Consume flammable gas
          const toDelete: string[] = [];
          for (const [gasId, conc] of nState.gases) {
            const gasMat = registry.materials.get(gasId);
            if (gasMat?.tags?.includes('flammable')) {
              toDelete.push(gasId);
            }
          }
          for (const id of toDelete) nState.gases.delete(id);

          // Ignite tiles in radius
          if (!nState.surfaceStates.has('on_fire')) {
            const tileData = registry.tilesByIndex.get(tileMap.get(nx, ny));
            const matId = tileData?.material ?? null;
            const mat = matId ? registry.materials.get(matId) : null;
            if ((mat?.flammability ?? 0) > 0.1) {
              nState.surfaceStates.add('on_fire');
              nState.fireDelay = 0;
              nState.temperature = Math.min(500, nState.temperature + 200);
              eventQueue.push({
                type: 'fire_spread',
                entityId: -1,
                data: { x: nx, y: ny },
              });
            }
          }

          // Damage entities in blast
          damageEntitiesOnTile(nx, ny, damage, world, entityPhysics, eventQueue);
          damageDoorOnTile(nx, ny, damage, tileMap, world, eventQueue);
        }
      }

      // Add smoke where the explosion was
      const centerState = physics.get(x, y);
      if (centerState) {
        centerState.gases.set('smoke', Math.min(1, (centerState.gases.get('smoke') ?? 0) + 0.6));
      }

      // Push explosion visual event
      eventQueue.push({
        type: 'explosion',
        entityId: -1,
        data: { x, y, radius },
      });
    }
  }

  // Per-part burning: smoldering damage, body-internal fire spread, wet suppression
  processPartBurning(world, physics, entityPhysics, eventQueue);
}

/**
 * Damage all living entities standing on a tile.
 * Body entities: only flammable parts are targeted; fireproof creatures take no damage.
 * Non-body entities: direct damage as before.
 */
function damageEntitiesOnTile(
  x: number,
  y: number,
  damage: number,
  world: object,
  entityPhysics: EntityPhysicsMap,
  eventQueue: VisualEventQueue,
): void {
  const registry = getRegistry();
  const entities = query(world, [Position, Health]);
  for (const eid of entities) {
    if (hasComponent(world, eid, Dead) && !hasComponent(world, eid, Body)) continue;
    if (Position.x[eid] !== x || Position.y[eid] !== y) continue;
    if (hasComponent(world, eid, Door)) continue;

    // Body entities — material-aware per-part targeting
    if (hasComponent(world, eid, Body)) {
      const parts = getPartsOf(eid);

      // Collect flammable external parts and ignite them
      const flammableParts: { eid: number; weight: number }[] = [];
      for (const pEid of parts) {
        if (Health.hp[pEid] <= 0) continue;
        if (!hasComponent(world, pEid, AttachedTo)) continue;
        const partDef = getPartData(pEid);
        if (partDef?.depth !== 'external') continue;

        const matId = getMaterialId(PartMaterial.materialId[pEid]);
        const mat = matId ? registry.materials.get(matId) : null;
        if ((mat?.flammability ?? 0) <= 0) continue;

        // Ignite this part (wet parts resist)
        if (!entityPhysics.has(pEid, 'wet')) {
          entityPhysics.set(pEid, 'on_fire', PART_FIRE_DURATION);
        }

        flammableParts.push({ eid: pEid, weight: partDef?.hitWeight ?? 1 });
      }

      if (flammableParts.length === 0) continue; // fireproof creature

      // Weighted random selection among flammable parts
      let totalWeight = 0;
      for (const c of flammableParts) totalWeight += c.weight;
      let targetPart = flammableParts[0].eid;
      let roll = Math.random() * totalWeight;
      for (const c of flammableParts) {
        roll -= c.weight;
        if (roll <= 0) { targetPart = c.eid; break; }
      }

      applyDamage(eid, damage, {
        source: 'fire', damageType: 'energy', targetPartEid: targetPart,
      }, world, eventQueue);
      continue;
    }

    // Non-body entities: direct damage
    applyDamage(eid, damage, { source: 'fire', damageType: 'energy' }, world, eventQueue);
  }
}

/**
 * Per-part burning — runs once per turn for ALL body entities.
 * - Smoldering damage to each burning part (only when not on a fire tile,
 *   since tile fire already dealt damage via damageEntitiesOnTile).
 * - Fire spreads from burning parts to other flammable parts on the same body.
 * - Wet parts have fire suppressed.
 */
function processPartBurning(
  world: object,
  physics: TilePhysicsMap,
  entityPhysics: EntityPhysicsMap,
  eventQueue: VisualEventQueue,
): void {
  const registry = getRegistry();
  const entities = query(world, [Position, Health, Body]);

  for (const eid of entities) {
    // Corpses (Dead + Body) can still burn; skip other dead entities
    if (hasComponent(world, eid, Dead) && !hasComponent(world, eid, Body)) continue;

    const onFireTile = physics.hasSurfaceState(Position.x[eid], Position.y[eid], 'on_fire');

    const parts = getPartsOf(eid);
    const burningParts: number[] = [];
    const flammableNotBurning: number[] = [];

    for (const pEid of parts) {
      if (Health.hp[pEid] <= 0) continue;
      if (!hasComponent(world, pEid, AttachedTo)) continue;

      if (entityPhysics.has(pEid, 'on_fire')) {
        // Wet suppresses fire on this part
        if (entityPhysics.has(pEid, 'wet')) {
          entityPhysics.remove(pEid, 'on_fire');
          eventQueue.push({
            type: 'part_fire_suppressed',
            entityId: eid,
            data: { partEid: pEid, partName: getPartData(pEid)?.name ?? 'part' },
          });
          continue;
        }
        burningParts.push(pEid);
      } else {
        // Candidate for fire spread — must be external, flammable, not wet
        const partDef = getPartData(pEid);
        if (partDef?.depth !== 'external') continue;
        if (entityPhysics.has(pEid, 'wet')) continue;

        const matId = getMaterialId(PartMaterial.materialId[pEid]);
        const mat = matId ? registry.materials.get(matId) : null;
        if ((mat?.flammability ?? 0) > 0) {
          flammableNotBurning.push(pEid);
        }
      }
    }

    if (burningParts.length === 0) continue;

    // Smoldering damage — only when NOT on a fire tile (tile fire already dealt damage)
    if (!onFireTile) {
      for (const pEid of burningParts) {
        applyDamage(eid, PART_BURN_DAMAGE, {
          source: 'fire', damageType: 'energy', targetPartEid: pEid,
        }, world, eventQueue);
      }
    }

    // Fire spread: one flammable part may ignite per turn (chance = flammability)
    if (flammableNotBurning.length > 0) {
      const targetPart = flammableNotBurning[
        Math.floor(Math.random() * flammableNotBurning.length)
      ];
      const matId = getMaterialId(PartMaterial.materialId[targetPart]);
      const mat = matId ? registry.materials.get(matId) : null;
      if (Math.random() < (mat?.flammability ?? 0)) {
        entityPhysics.set(targetPart, 'on_fire', PART_FIRE_DURATION);
        eventQueue.push({
          type: 'part_ignite',
          entityId: eid,
          data: { partEid: targetPart, partName: getPartData(targetPart)?.name ?? 'part' },
        });
      }
    }
  }
}

/** Damage door entities on a burning tile. When a door burns down, clear its overlay. */
function damageDoorOnTile(
  x: number, y: number,
  damage: number,
  tileMap: TileMap,
  world: object,
  eventQueue: VisualEventQueue,
): void {
  const doors = query(world, [Position, Door, Health]);
  for (const eid of doors) {
    if (hasComponent(world, eid, Dead)) continue;
    if (Position.x[eid] !== x || Position.y[eid] !== y) continue;

    Health.hp[eid] -= damage;
    eventQueue.push({
      type: 'hit_flash',
      entityId: eid,
      data: { damage, source: 'fire' },
    });

    if (Health.hp[eid] <= 0) {
      addComponent(world, eid, Dead);
      // Clear overlay — the door is gone, tile becomes passable
      const idx = tileMap.idx(x, y);
      tileMap.entityBlocksMovement[idx] = 0;
      tileMap.entityBlocksLight[idx] = 0;
      eventQueue.push({
        type: 'death',
        entityId: eid,
        data: { cause: 'fire' },
      });
    }
  }
}
