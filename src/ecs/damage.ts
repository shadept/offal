/**
 * Unified damage pipeline — ALL damage to entities goes through applyDamage().
 *
 * Branches on whether the target has a Body component:
 * - Body entities: select a part via weighted random, damage that part, recalc aggregates
 * - Floor parts (PartIdentity, no Body): direct HP damage
 * - Other entities (doors, objects): direct HP damage (original behavior)
 */
import { hasComponent, addComponent } from 'bitecs';
import {
  Health, Body, CachedCapacity, PartIdentity, AttachedTo, Dead, Position,
} from './components';
import {
  getPartsOf, getPartData, recalcBodyHp, recalcCapacities,
  detachPart, updateSpeedFromCapacity, getSpeciesId, getSlotName,
} from './body';
import { getRegistry } from '../data/loader';
import { gameLog } from '../ui/gameLog';
import type { DamageType } from '../types';
import type { VisualEventQueue } from '../visual/EventQueue';

/** Resolve an entity ID to a display name. Set by GameScene at init. */
let nameResolver: (eid: number) => string = (eid) => `entity ${eid}`;
let turnCounter: () => number = () => 0;

export function setDamageLogContext(
  resolver: (eid: number) => string,
  getTurn: () => number,
): void {
  nameResolver = resolver;
  turnCounter = getTurn;
}

export interface DamageOpts {
  source: string;
  attackerEid?: number;
  damageType?: DamageType;
}

export interface DamageResult {
  killed: boolean;
  targetPartEid: number; // -1 if no part targeted
  severed: boolean;
}

/**
 * Apply damage to an entity. Routes through part targeting for body entities.
 */
export function applyDamage(
  target: number,
  damage: number,
  opts: DamageOpts,
  world: object,
  eventQueue: VisualEventQueue,
): DamageResult {
  // Guard: entity may have been removed between turns (stale AI target ref)
  if (!hasComponent(world, target, Health) || hasComponent(world, target, Dead)) {
    return { killed: false, targetPartEid: -1, severed: false };
  }

  // ── Body entity: per-part targeting ──
  if (hasComponent(world, target, Body)) {
    return applyDamageToBody(target, damage, opts, world, eventQueue);
  }

  // ── Floor part entity ──
  if (hasComponent(world, target, PartIdentity)) {
    return applyDamageToFloorPart(target, damage, opts, world, eventQueue);
  }

  // ── Simple entity (door, object) ──
  return applyDamageSimple(target, damage, opts, world, eventQueue);
}

// ═══════════════════════════════════════════════════════════
// BODY DAMAGE
// ═══════════════════════════════════════════════════════════

function applyDamageToBody(
  bodyEid: number,
  damage: number,
  opts: DamageOpts,
  world: object,
  eventQueue: VisualEventQueue,
): DamageResult {
  const partEid = selectTargetPart(bodyEid, opts.damageType, world);
  if (partEid < 0) {
    // No reachable parts (e.g., all dead or all internal vs blunt attack) — miss
    return { killed: false, targetPartEid: -1, severed: false };
  }

  const partDef = getPartData(partEid);
  const partName = partDef?.name ?? 'body part';

  Health.hp[partEid] = Math.max(0, Health.hp[partEid] - damage);

  eventQueue.push({
    type: 'part_hit',
    entityId: bodyEid,
    data: {
      partEid,
      partName,
      damage,
      attackerEid: opts.attackerEid ?? -1,
    },
  });

  const turn = turnCounter();
  const targetName = nameResolver(bodyEid);
  const isEnv = opts.source === 'fire' || opts.source === 'toxic_gas';
  const category = isEnv ? 'environment' as const : 'combat' as const;
  if (isEnv) {
    const src = opts.source === 'fire' ? 'Fire' : 'Toxic gas';
    gameLog.push(turn, category,
      `${src} burns ${targetName}'s ${partName} for ${damage}`);
  } else {
    const attackerName = opts.attackerEid != null && opts.attackerEid >= 0
      ? nameResolver(opts.attackerEid) : opts.source;
    gameLog.push(turn, category,
      `${attackerName} hits ${targetName}'s ${partName} for ${damage}`);
  }

  let severed = false;

  // Check part death
  if (Health.hp[partEid] <= 0) {
    if (partDef?.depth === 'external') {
      // Sever: detach and drop to floor
      const x = Position.x[bodyEid];
      const y = Position.y[bodyEid];
      detachPart(world, partEid, bodyEid, x, y);
      severed = true;

      eventQueue.push({
        type: 'part_severed',
        entityId: bodyEid,
        data: { partEid, partName, x, y },
      });

      gameLog.push(turn, 'combat', `${targetName}'s ${partName} is severed!`);
    } else {
      // Internal organ: stays attached but deactivated
      eventQueue.push({
        type: 'part_deactivated',
        entityId: bodyEid,
        data: { partEid, partName },
      });

      gameLog.push(turn, 'combat', `${targetName}'s ${partName} is destroyed`);
    }
  }

  // Recalculate body aggregates (detachPart already does this for severed,
  // but we need it for non-severed damage and deactivation too)
  if (!severed) {
    recalcBodyHp(bodyEid);
    recalcCapacities(bodyEid);
    updateSpeedFromCapacity(bodyEid);
  }

  // Check if creature dies from required part loss
  const killed = checkCreatureDeath(bodyEid, world, eventQueue);

  return { killed, targetPartEid: partEid, severed };
}

/**
 * Select a target part via weighted random, filtered by damage type depth rules.
 */
function selectTargetPart(
  bodyEid: number,
  damageType: DamageType | undefined,
  world: object,
): number {
  const parts = getPartsOf(bodyEid);
  if (parts.length === 0) return -1;

  // Filter by depth based on damage type
  const externalOnly = damageType === 'blunt' || damageType === 'cut';

  // Build weighted list of valid targets
  let totalWeight = 0;
  const candidates: { eid: number; weight: number }[] = [];

  for (const pEid of parts) {
    // Skip dead/deactivated parts
    if (Health.hp[pEid] <= 0) continue;
    // Skip if not attached (shouldn't happen, but defensive)
    if (!hasComponent(world, pEid, AttachedTo)) continue;

    const partDef = getPartData(pEid);
    if (!partDef) continue;

    // Depth filter
    if (externalOnly && partDef.depth !== 'external') continue;

    const w = partDef.hitWeight;
    candidates.push({ eid: pEid, weight: w });
    totalWeight += w;
  }

  if (candidates.length === 0 || totalWeight === 0) return -1;

  // Weighted random selection
  let roll = Math.random() * totalWeight;
  for (const c of candidates) {
    roll -= c.weight;
    if (roll <= 0) return c.eid;
  }
  return candidates[candidates.length - 1].eid;
}

// ═══════════════════════════════════════════════════════════
// CREATURE DEATH CHECK
// ═══════════════════════════════════════════════════════════

/**
 * Check if a creature should die based on required parts.
 * Returns true if death was triggered.
 */
export function checkCreatureDeath(
  bodyEid: number,
  world: object,
  eventQueue: VisualEventQueue,
): boolean {
  if (hasComponent(world, bodyEid, Dead)) return true;

  // Check capacity-based death
  if (CachedCapacity.circulation[bodyEid] === 0 ||
      CachedCapacity.structuralIntegrity[bodyEid] === 0) {
    addComponent(world, bodyEid, Dead);
    eventQueue.push({ type: 'death', entityId: bodyEid, data: { cause: 'body_failure' } });
    gameLog.push(turnCounter(), 'death', `${nameResolver(bodyEid)} dies from body failure`);
    return true;
  }

  // Check required parts from species data
  const registry = getRegistry();
  const speciesId = getSpeciesId(Body.speciesIdx[bodyEid]);
  const species = speciesId ? registry.species.get(speciesId) : undefined;
  if (!species?.requiredParts) return false;

  const parts = getPartsOf(bodyEid);
  for (const reqSlotId of species.requiredParts) {
    // Find if any functional attached part occupies this required slot
    const hasRequired = parts.some((pEid: number) => {
      if (!hasComponent(world, pEid, AttachedTo)) return false;
      if (Health.hp[pEid] <= 0) return false;
      const slotName = getSlotName(AttachedTo.slotId[pEid]);
      return slotName === reqSlotId;
    });

    if (!hasRequired) {
      addComponent(world, bodyEid, Dead);
      eventQueue.push({
        type: 'death',
        entityId: bodyEid,
        data: { cause: 'required_part_lost', part: reqSlotId },
      });
      gameLog.push(turnCounter(), 'death', `${nameResolver(bodyEid)} dies — lost ${reqSlotId}`);
      return true;
    }
  }

  return false;
}

// ═══════════════════════════════════════════════════════════
// SIMPLE DAMAGE (non-body entities)
// ═══════════════════════════════════════════════════════════

function applyDamageToFloorPart(
  partEid: number,
  damage: number,
  opts: DamageOpts,
  world: object,
  eventQueue: VisualEventQueue,
): DamageResult {
  Health.hp[partEid] = Math.max(0, Health.hp[partEid] - damage);
  eventQueue.push({
    type: 'hit_flash',
    entityId: partEid,
    data: { damage, source: opts.source },
  });

  if (Health.hp[partEid] <= 0) {
    addComponent(world, partEid, Dead);
    eventQueue.push({
      type: 'part_destroyed',
      entityId: partEid,
      data: { partName: getPartData(partEid)?.name ?? 'remains' },
    });
    return { killed: true, targetPartEid: -1, severed: false };
  }
  return { killed: false, targetPartEid: -1, severed: false };
}

function applyDamageSimple(
  target: number,
  damage: number,
  opts: DamageOpts,
  world: object,
  eventQueue: VisualEventQueue,
): DamageResult {
  Health.hp[target] = Math.max(0, Health.hp[target] - damage);
  eventQueue.push({
    type: 'hit_flash',
    entityId: target,
    data: { damage, source: opts.source, attackerId: opts.attackerEid },
  });

  const turn = turnCounter();
  const src = opts.source;
  if (src === 'fire') {
    gameLog.push(turn, 'environment', `${nameResolver(target)} burns for ${damage} damage`);
  } else if (src === 'toxic_gas') {
    gameLog.push(turn, 'environment', `${nameResolver(target)} chokes on toxic gas for ${damage} damage`);
  }

  if (Health.hp[target] <= 0) {
    addComponent(world, target, Dead);
    eventQueue.push({
      type: 'death',
      entityId: target,
      data: { cause: opts.source },
    });
    gameLog.push(turn, 'death', `${nameResolver(target)} is destroyed`);
    return { killed: true, targetPartEid: -1, severed: false };
  }
  return { killed: false, targetPartEid: -1, severed: false };
}
