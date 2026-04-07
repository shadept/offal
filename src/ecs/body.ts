/**
 * Body system — Part Lookup Index, index maps, spawn/attach/detach/recalc.
 *
 * Every creature with a body plan has part entities linked via the
 * Part Lookup Index. Index maps translate string IDs to numeric indices
 * for use in SoA components (same pattern as factions.ts).
 */
import { addEntity, addComponent, removeComponent, hasComponent } from 'bitecs';
import { getRegistry } from '../data/loader';
import {
  Health, Position, Renderable, Dead, HeldBy, FOV,
  PartIdentity, PartMaterial, AttachedTo, Body, Turn,
} from './components';
import { removeItemFromOwner } from './inventory';
import type { DataRegistry, PartData, SpeciesData, CapacityType, PartRole } from '../types';

// ═══════════════════════════════════════════════════════════
// PART TYPE ENUM
// ═══════════════════════════════════════════════════════════

export const PartType = {
  ARM: 0,
  LEG: 1,
  HEAD: 2,
  ORGAN: 3,
  SENSOR: 4,
  MOUTH: 5,
  SEGMENT: 6,
  ROTOR: 7,
  TORSO: 8,
} as const;

// ═══════════════════════════════════════════════════════════
// DEGRADATION CURVES — per part type, controls how HP% maps to capacity contribution
// ═══════════════════════════════════════════════════════════

interface DegradationCurve {
  mode: 'threshold' | 'linear';
  threshold: number; // HP ratio below which degradation kicks in
}

const DEGRADATION_BY_TYPE: Record<number, DegradationCurve> = {
  [PartType.HEAD]:    { mode: 'linear',    threshold: 0.5 },
  [PartType.TORSO]:   { mode: 'threshold', threshold: 0.2 },
  [PartType.ARM]:     { mode: 'threshold', threshold: 0.3 },
  [PartType.LEG]:     { mode: 'threshold', threshold: 0.3 },
  [PartType.ORGAN]:   { mode: 'threshold', threshold: 0.0 },
  [PartType.SENSOR]:  { mode: 'linear',    threshold: 0.5 },
  [PartType.MOUTH]:   { mode: 'threshold', threshold: 0.2 },
  [PartType.SEGMENT]: { mode: 'threshold', threshold: 0.2 },
  [PartType.ROTOR]:   { mode: 'linear',    threshold: 0.3 },
};

/**
 * Compute a part's capacity contribution (0.0 to 1.0) based on its HP and degradation curve.
 * - threshold mode: 1.0 above threshold, 0.5 below (impaired), 0.0 at zero HP
 * - linear mode: 1.0 above threshold, scales linearly to 0.0 below
 */
export function getPartContribution(partEid: number): number {
  const hp = Health.hp[partEid];
  if (hp <= 0) return 0;
  const maxHp = Health.maxHp[partEid];
  if (maxHp <= 0) return 0;
  const ratio = hp / maxHp;
  const typeId = PartIdentity.typeId[partEid];
  const curve = DEGRADATION_BY_TYPE[typeId];
  if (!curve) return 1;

  if (curve.mode === 'threshold') {
    return ratio >= curve.threshold ? 1.0 : 0.5;
  } else {
    // linear: 1.0 above threshold, scales to 0.0 at zero
    if (ratio >= curve.threshold) return 1.0;
    return curve.threshold > 0 ? ratio / curve.threshold : 1.0;
  }
}

const ROLE_TO_PART_TYPE: Record<string, number> = {
  arm: PartType.ARM,
  leg: PartType.LEG,
  head: PartType.HEAD,
  organ: PartType.ORGAN,
  sensor: PartType.SENSOR,
  mouth: PartType.MOUTH,
  segment: PartType.SEGMENT,
  rotor: PartType.ROTOR,
  torso: PartType.TORSO,
};

// ═══════════════════════════════════════════════════════════
// INDEX MAPS (string ↔ numeric)
// ═══════════════════════════════════════════════════════════

const partDefToIndex = new Map<string, number>();
const indexToPartDef = new Map<number, string>();

const speciesStrToIndex = new Map<string, number>();
const indexToSpeciesStr = new Map<number, string>();

const materialToIndex = new Map<string, number>();
const indexToMaterial = new Map<number, string>();

const slotNameToIndex = new Map<string, number>();
const indexToSlotName = new Map<number, string>();

let initialized = false;

/** Initialize all body system index maps. Call after loadData(). */
export function initBodyIndices(registry: DataRegistry): void {
  // Part definitions
  let idx = 0;
  for (const [id] of registry.parts) {
    partDefToIndex.set(id, idx);
    indexToPartDef.set(idx, id);
    idx++;
  }

  // Species
  idx = 0;
  for (const [id] of registry.species) {
    speciesStrToIndex.set(id, idx);
    indexToSpeciesStr.set(idx, id);
    idx++;
  }

  // Materials
  idx = 0;
  for (const [id] of registry.materials) {
    materialToIndex.set(id, idx);
    indexToMaterial.set(idx, id);
    idx++;
  }

  // Slot names — collect from all species body plans
  idx = 0;
  for (const [, species] of registry.species) {
    if (!species.parts) continue;
    for (const slot of species.parts) {
      if (!slotNameToIndex.has(slot.id)) {
        slotNameToIndex.set(slot.id, idx);
        indexToSlotName.set(idx, slot.id);
        idx++;
      }
    }
  }

  initialized = true;
}

export function getPartDefIndex(partDefId: string): number {
  return partDefToIndex.get(partDefId) ?? 65535;
}
export function getPartDefId(index: number): string | undefined {
  return indexToPartDef.get(index);
}
export function getSpeciesIndex(speciesId: string): number {
  return speciesStrToIndex.get(speciesId) ?? 65535;
}
export function getSpeciesId(index: number): string | undefined {
  return indexToSpeciesStr.get(index);
}
export function getMaterialIndex(materialId: string): number {
  return materialToIndex.get(materialId) ?? 255;
}
export function getMaterialId(index: number): string | undefined {
  return indexToMaterial.get(index);
}
export function getSlotIndex(slotName: string): number {
  return slotNameToIndex.get(slotName) ?? 65535;
}
export function getSlotName(index: number): string | undefined {
  return indexToSlotName.get(index);
}
export function getPartTypeIndex(role: string): number {
  return ROLE_TO_PART_TYPE[role] ?? 255;
}

// ═══════════════════════════════════════════════════════════
// PART LOOKUP INDEX
// ═══════════════════════════════════════════════════════════

/** parentEid → Set of attached part eids */
const partIndex = new Map<number, Set<number>>();

/** Get all part entity IDs attached to a creature. */
export function getPartsOf(parentEid: number): number[] {
  const set = partIndex.get(parentEid);
  return set ? [...set] : [];
}

/** Get the part index set directly (for iteration without allocation). */
export function getPartSet(parentEid: number): Set<number> | undefined {
  return partIndex.get(parentEid);
}

function addToPartIndex(parentEid: number, partEid: number): void {
  let set = partIndex.get(parentEid);
  if (!set) {
    set = new Set();
    partIndex.set(parentEid, set);
  }
  set.add(partEid);
}

function removeFromPartIndex(parentEid: number, partEid: number): void {
  const set = partIndex.get(parentEid);
  if (set) {
    set.delete(partEid);
    if (set.size === 0) partIndex.delete(parentEid);
  }
}

/** Remove all entries for a creature (used on creature death). */
export function clearPartIndex(parentEid: number): void {
  partIndex.delete(parentEid);
}

// ═══════════════════════════════════════════════════════════
// CAPACITY DERIVATION
// ═══════════════════════════════════════════════════════════

/** Capacity keys matching Body component fields. */
const CAPACITY_KEYS: CapacityType[] = [
  'mobility', 'manipulation', 'consciousness', 'circulation',
];

/**
 * Sum part HPs for display/debug only. Body HP is tracked directly via
 * Health.hp[creatureEid] — it is NOT derived from part sums.
 */
export function sumPartHp(creatureEid: number): number {
  const parts = getPartsOf(creatureEid);
  let total = 0;
  for (const pEid of parts) {
    total += Health.hp[pEid];
  }
  return total;
}

/**
 * Recalculate Body capacities from attached parts using degradation curves.
 * Each part's contribution is weighted by its HP state (see getPartContribution).
 * Consciousness is further modified by overall body HP (stamina modifier).
 */
export function recalcCapacities(creatureEid: number): void {
  const registry = getRegistry();
  const speciesId = getSpeciesId(Body.speciesIdx[creatureEid]);
  const species = speciesId ? registry.species.get(speciesId) : undefined;
  if (!species?.parts) return;

  // Sum weighted contributions per capacity
  const totalParts: Record<string, number> = {};
  const weightedSum: Record<string, number> = {};
  for (const key of CAPACITY_KEYS) {
    totalParts[key] = 0;
    weightedSum[key] = 0;
  }

  const parts = getPartsOf(creatureEid);
  for (const pEid of parts) {
    const defId = getPartDefId(PartIdentity.partDefId[pEid]);
    const partDef = defId ? registry.parts.get(defId) : undefined;
    if (!partDef?.capacityContribution) continue;

    const contribution = getPartContribution(pEid);
    for (const cap of partDef.capacityContribution) {
      totalParts[cap] = (totalParts[cap] ?? 0) + 1;
      weightedSum[cap] = (weightedSum[cap] ?? 0) + contribution;
    }
  }

  // Compute percentages — 0 if no parts contribute
  for (const key of CAPACITY_KEYS) {
    const t = totalParts[key] ?? 0;
    const w = weightedSum[key] ?? 0;
    const pct = t > 0 ? Math.round((w / t) * 100) : 0;
    Body[key][creatureEid] = pct;
  }

  // Consciousness stamina modifier: body HP affects effective consciousness
  const rawConsciousness = Body.consciousness[creatureEid];
  if (rawConsciousness > 0) {
    const bodyHpRatio = Health.hp[creatureEid] / Math.max(1, Health.maxHp[creatureEid]);
    const staminaModifier = 0.5 + 0.5 * bodyHpRatio;
    Body.consciousness[creatureEid] = Math.round(rawConsciousness * staminaModifier);
  }
}

/**
 * Recalculate FOV.range from sensor part state using degradation curves.
 * Must be called after recalcCapacities (or any part damage/attach/detach).
 */
export function recalcFOV(creatureEid: number, world: object): void {
  if (!hasComponent(world, creatureEid, FOV)) return;
  const registry = getRegistry();
  const speciesId = getSpeciesId(Body.speciesIdx[creatureEid]);
  const species = speciesId ? registry.species.get(speciesId) : undefined;
  if (!species) return;
  const baseFov = species.fovRange ?? 8;

  const parts = getPartsOf(creatureEid);
  let totalSensors = 0;
  let sensorSum = 0;
  for (const pEid of parts) {
    if (PartIdentity.typeId[pEid] === PartType.SENSOR) {
      totalSensors++;
      sensorSum += getPartContribution(pEid);
    }
  }

  const sensorRatio = totalSensors > 0 ? sensorSum / totalSensors : 0;
  FOV.range[creatureEid] = Math.max(1, Math.round(baseFov * sensorRatio));
}

/**
 * Get the movement cost multiplier based on mobility capacity.
 * Mobility only affects movement cost, not action speed.
 */
export function getMovementCostMultiplier(creatureEid: number): number {
  const mobility = Body.mobility[creatureEid];
  if (mobility <= 0) return Infinity;
  if (mobility >= 100) return 1.0;
  if (mobility >= 75) return 1.2;
  if (mobility >= 50) return 1.5;
  if (mobility >= 25) return 2.0;
  return 3.0;
}

// ═══════════════════════════════════════════════════════════
// SPAWN / ATTACH / DETACH
// ═══════════════════════════════════════════════════════════

/**
 * Create part entities for a creature based on its species body plan.
 * Adds Body to the creature, populates Part Lookup Index.
 */
export function spawnBodyForCreature(
  world: object,
  creatureEid: number,
  species: SpeciesData,
  registry: DataRegistry,
): void {
  if (!species.parts || species.parts.length === 0) return;

  // Add body component to creature
  addComponent(world, creatureEid, Body);
  Body.speciesIdx[creatureEid] = getSpeciesIndex(species.id);

  // Create part entities
  for (const slot of species.parts) {
    const partDef = registry.parts.get(slot.default);
    if (!partDef) {
      console.warn(`[body] Unknown part def '${slot.default}' for species '${species.id}'`);
      continue;
    }

    const partEid = addEntity(world);
    addComponent(world, partEid, Health);
    addComponent(world, partEid, PartIdentity);
    addComponent(world, partEid, PartMaterial);
    addComponent(world, partEid, AttachedTo);

    Health.hp[partEid] = partDef.maxHp;
    Health.maxHp[partEid] = partDef.maxHp;

    PartIdentity.partDefId[partEid] = getPartDefIndex(partDef.id);
    PartIdentity.typeId[partEid] = getPartTypeIndex(partDef.type);
    PartIdentity.speciesId[partEid] = getSpeciesIndex(partDef.species);

    PartMaterial.materialId[partEid] = getMaterialIndex(partDef.material);

    AttachedTo.parentEid[partEid] = creatureEid;
    AttachedTo.slotId[partEid] = getSlotIndex(slot.id);

    addToPartIndex(creatureEid, partEid);
  }

  // Body HP is its own pool — set from species maxHp, not summed from parts.
  // Parts have local HP for severing; body HP tracks overall health.
  const bodyMaxHp = species.maxHp ?? 10;
  Health.maxHp[creatureEid] = bodyMaxHp;
  Health.hp[creatureEid] = bodyMaxHp;

  recalcCapacities(creatureEid);
  recalcFOV(creatureEid, world);
}

/**
 * Detach a part from its parent body and place it on the floor.
 * Removes from Part Lookup Index, recalculates body aggregates.
 */
export function detachPart(
  world: object,
  partEid: number,
  bodyEid: number,
  x: number,
  y: number,
): void {
  // Remove attachment
  removeComponent(world, partEid, AttachedTo);
  removeFromPartIndex(bodyEid, partEid);

  // Place on floor
  addComponent(world, partEid, Position);
  addComponent(world, partEid, Renderable);
  Position.x[partEid] = x;
  Position.y[partEid] = y;
  Renderable.spriteIndex[partEid] = 5; // placeholder: part-on-floor sprite
  Renderable.layer[partEid] = 1; // objects layer

  // Recalculate capacities and FOV (body HP already reduced by damage)
  recalcCapacities(bodyEid);
  recalcFOV(bodyEid, world);
}

/**
 * Look up the PartData for a part entity from its PartIdentity index.
 */
export function getPartData(partEid: number): PartData | undefined {
  const defId = getPartDefId(PartIdentity.partDefId[partEid]);
  if (!defId) return undefined;
  return getRegistry().parts.get(defId);
}

/** Find loose severed parts at a tile position. */
export function findPartsAtPosition(
  world: object,
  x: number,
  y: number,
  maxEid = 10000,
): number[] {
  const results: number[] = [];
  for (let eid = 0; eid < maxEid; eid++) {
    if (!hasComponent(world, eid, PartIdentity)) continue;
    if (!hasComponent(world, eid, Position)) continue;
    if (hasComponent(world, eid, AttachedTo)) continue;
    if (Position.x[eid] === x && Position.y[eid] === y) {
      results.push(eid);
    }
  }
  return results;
}

// ════════════════════════��══════════════════════════════════
// DYNAMIC SLOT REGISTRATION
// ═══════════════════════════════════════════════════════════

let nextDynamicSlotIdx = 10000; // high offset to avoid collisions with static slots

/**
 * Register a dynamic slot name for parts attached beyond the species blueprint.
 * Returns the numeric index for the new slot.
 */
export function registerDynamicSlot(name: string): number {
  const existing = slotNameToIndex.get(name);
  if (existing !== undefined) return existing;
  const idx = nextDynamicSlotIdx++;
  slotNameToIndex.set(name, idx);
  indexToSlotName.set(idx, name);
  return idx;
}

// ═══════════════════════════════════════════════════════════
// SLOT QUERIES
// ═══════════════════════════════════════════════════════════

/**
 * Get a map of occupied slots for a creature: slotIdx → partEid.
 */
export function getOccupiedSlots(bodyEid: number): Map<number, number> {
  const result = new Map<number, number>();
  const parts = getPartsOf(bodyEid);
  for (const pEid of parts) {
    result.set(AttachedTo.slotId[pEid], pEid);
  }
  return result;
}

/**
 * Find the first empty blueprint slot matching a given role, or allocate a dynamic slot.
 * Returns the slot index to use for attachment.
 */
function findSlotForRole(bodyEid: number, role: PartRole): number {
  const registry = getRegistry();
  const speciesId = getSpeciesId(Body.speciesIdx[bodyEid]);
  const species = speciesId ? registry.species.get(speciesId) : undefined;
  const occupied = getOccupiedSlots(bodyEid);

  // Try blueprint slots first
  if (species?.parts) {
    for (const slot of species.parts) {
      if (slot.role === role) {
        const slotIdx = getSlotIndex(slot.id);
        if (!occupied.has(slotIdx)) return slotIdx;
      }
    }
  }

  // All blueprint slots for this role are occupied — create a dynamic slot
  // Count existing parts of this role to generate a unique name
  let count = 0;
  const parts = getPartsOf(bodyEid);
  for (const pEid of parts) {
    const defId = getPartDefId(PartIdentity.partDefId[pEid]);
    const partDef = defId ? registry.parts.get(defId) : undefined;
    if (partDef?.type === role) count++;
  }
  const dynamicName = `${role}_extra_${count}`;
  return registerDynamicSlot(dynamicName);
}

// ═══════════════════════════════════════════════════════════
// COMPATIBILITY
// ════════════════════���══════════════════════════════════════

/**
 * Check if a part is compatible with a creature's body.
 * roleMatch: part role matches any slot role in the species blueprint.
 * materialMatch: part material is in the species' compatibleWith list.
 */
export function checkPartCompatibility(
  partEid: number,
  bodyEid: number,
): { roleMatch: boolean; materialMatch: boolean } {
  const registry = getRegistry();
  const partDef = getPartData(partEid);
  const speciesId = getSpeciesId(Body.speciesIdx[bodyEid]);
  const species = speciesId ? registry.species.get(speciesId) : undefined;

  // Role match — the part's type is a valid role for any slot in this species
  let roleMatch = false;
  if (partDef && species?.parts) {
    const roles = new Set(species.parts.map(s => s.role));
    roleMatch = roles.has(partDef.type);
  }
  // Also allow roles beyond the blueprint (any valid part role matches)
  if (partDef) roleMatch = true;

  // Material match — part material is in species' compatibility list
  let materialMatch = true;
  if (partDef && species?.compatibleWith) {
    const matId = getMaterialId(PartMaterial.materialId[partEid]);
    materialMatch = matId ? species.compatibleWith.includes(matId) : false;
  }

  return { roleMatch, materialMatch };
}

// ═══════════════════════════════��═══════════════════════════
// ATTACH PART
// ══════════════════════════════════════════���════════════════

/**
 * Attach a part entity to a creature's body.
 * Mirrors detachPart — removes floor/inventory presence, adds to body.
 * If slotName is not provided, auto-finds the best slot for the part's role.
 * Returns true if attachment succeeded.
 */
export function attachPart(
  world: object,
  partEid: number,
  bodyEid: number,
  slotName?: string,
): boolean {
  // Guards
  if (hasComponent(world, partEid, Dead)) return false;
  if (hasComponent(world, partEid, AttachedTo)) return false;
  if (hasComponent(world, bodyEid, Dead)) return false;
  if (!hasComponent(world, bodyEid, Body)) return false;

  const partDef = getPartData(partEid);
  if (!partDef) return false;

  // Determine target slot
  let slotIdx: number;
  if (slotName) {
    slotIdx = getSlotIndex(slotName);
    if (slotIdx === 65535) {
      slotIdx = registerDynamicSlot(slotName);
    }
  } else {
    slotIdx = findSlotForRole(bodyEid, partDef.type as PartRole);
  }

  // Remove from floor (if on floor)
  if (hasComponent(world, partEid, Position)) {
    removeComponent(world, partEid, Position);
  }
  if (hasComponent(world, partEid, Renderable)) {
    removeComponent(world, partEid, Renderable);
  }

  // Remove from inventory (if held)
  if (hasComponent(world, partEid, HeldBy)) {
    removeItemFromOwner(world, partEid);
  }

  // Attach to body
  addComponent(world, partEid, AttachedTo);
  AttachedTo.parentEid[partEid] = bodyEid;
  AttachedTo.slotId[partEid] = slotIdx;
  addToPartIndex(bodyEid, partEid);

  // Recalculate body aggregates
  recalcCapacities(bodyEid);
  recalcFOV(bodyEid, world);

  return true;
}
