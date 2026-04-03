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
  Health, Position, Renderable,
  PartIdentity, PartMaterial, AttachedTo, Body, CachedCapacity, Turn,
} from './components';
import type { DataRegistry, PartData, SpeciesData, CapacityType } from '../types';

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

/** Capacity keys matching CachedCapacity component fields. */
const CAPACITY_KEYS: CapacityType[] = [
  'mobility', 'manipulation', 'consciousness', 'circulation', 'structuralIntegrity',
];

/**
 * Recalculate Body.cachedHp and mirror to Health.hp.
 * Only current HP is recalculated — maxHP is set once at spawn and represents
 * the body's full potential. Losing parts is a wound, not a ceiling reduction.
 */
export function recalcBodyHp(creatureEid: number): void {
  const parts = getPartsOf(creatureEid);
  let totalHp = 0;
  for (const pEid of parts) {
    totalHp += Health.hp[pEid];
  }
  Body.cachedHp[creatureEid] = totalHp;
  // Mirror current HP only — maxHp stays at original body potential
  Health.hp[creatureEid] = totalHp;
}

/**
 * Recalculate CachedCapacity from functional attached parts.
 * A part is functional if Health.hp[partEid] > 0.
 */
export function recalcCapacities(creatureEid: number): void {
  const registry = getRegistry();
  const speciesId = getSpeciesId(Body.speciesIdx[creatureEid]);
  const species = speciesId ? registry.species.get(speciesId) : undefined;
  if (!species?.parts) return;

  // Count total and functional parts per capacity
  const total: Record<string, number> = {};
  const functional: Record<string, number> = {};
  for (const key of CAPACITY_KEYS) {
    total[key] = 0;
    functional[key] = 0;
  }

  const parts = getPartsOf(creatureEid);
  for (const pEid of parts) {
    const defId = getPartDefId(PartIdentity.partDefId[pEid]);
    const partDef = defId ? registry.parts.get(defId) : undefined;
    if (!partDef?.capacityContribution) continue;

    for (const cap of partDef.capacityContribution) {
      total[cap] = (total[cap] ?? 0) + 1;
      if (Health.hp[pEid] > 0) {
        functional[cap] = (functional[cap] ?? 0) + 1;
      }
    }
  }

  // Compute percentages
  for (const key of CAPACITY_KEYS) {
    const t = total[key] ?? 0;
    const f = functional[key] ?? 0;
    const pct = t > 0 ? Math.round((f / t) * 100) : 100;
    CachedCapacity[key][creatureEid] = pct;
  }
}

/**
 * Update Turn.speed based on mobility capacity and locomotion baseline.
 */
export function updateSpeedFromCapacity(creatureEid: number): void {
  const registry = getRegistry();
  const speciesId = getSpeciesId(Body.speciesIdx[creatureEid]);
  const species = speciesId ? registry.species.get(speciesId) : undefined;
  if (!species) return;

  const baseSpeed = species.speed;
  const mobility = CachedCapacity.mobility[creatureEid];
  const baseline = species.locomotionBaseline ?? 'biped';

  let speedMult: number;
  if (baseline === 'biped') {
    // Count legs via slot roles
    const parts = getPartsOf(creatureEid);
    let totalLegs = 0;
    let functionalLegs = 0;
    for (const pEid of parts) {
      if (PartIdentity.typeId[pEid] === PartType.LEG) {
        totalLegs++;
        if (Health.hp[pEid] > 0) functionalLegs++;
      }
    }
    if (totalLegs === 0) {
      speedMult = 1.0; // species has no legs by design
    } else if (functionalLegs === 0) {
      speedMult = 0.3; // crawling
    } else if (functionalLegs < totalLegs) {
      speedMult = 0.6; // hobbling
    } else {
      speedMult = 1.0;
    }
  } else if (baseline === 'quadruped') {
    const parts = getPartsOf(creatureEid);
    let totalLegs = 0;
    let functionalLegs = 0;
    for (const pEid of parts) {
      if (PartIdentity.typeId[pEid] === PartType.LEG) {
        totalLegs++;
        if (Health.hp[pEid] > 0) functionalLegs++;
      }
    }
    if (totalLegs === 0) {
      speedMult = 1.0;
    } else {
      const ratio = functionalLegs / totalLegs;
      if (ratio >= 1) speedMult = 1.0;
      else if (ratio >= 0.75) speedMult = 0.8;
      else if (ratio >= 0.5) speedMult = 0.5;
      else if (ratio > 0) speedMult = 0.25;
      else speedMult = 0;
    }
  } else if (baseline === 'hover') {
    // Proportional to rotors
    speedMult = mobility / 100;
  } else if (baseline === 'serpentine') {
    // Proportional to segments
    speedMult = mobility / 100;
  } else {
    speedMult = mobility / 100;
  }

  Turn.speed[creatureEid] = baseSpeed * speedMult;
}

// ═══════════════════════════════════════════════════════════
// SPAWN / ATTACH / DETACH
// ═══════════════════════════════════════════════════════════

/**
 * Create part entities for a creature based on its species body plan.
 * Adds Body and CachedCapacity to the creature, populates Part Lookup Index.
 */
export function spawnBodyForCreature(
  world: object,
  creatureEid: number,
  species: SpeciesData,
  registry: DataRegistry,
): void {
  if (!species.parts || species.parts.length === 0) return;

  // Add body components to creature
  addComponent(world, creatureEid, Body);
  addComponent(world, creatureEid, CachedCapacity);
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

  // Compute aggregates — set maxHP once from full body potential
  const parts = getPartsOf(creatureEid);
  let totalMaxHp = 0;
  for (const pEid of parts) {
    totalMaxHp += Health.maxHp[pEid];
  }
  Body.cachedMaxHp[creatureEid] = totalMaxHp;
  Health.maxHp[creatureEid] = totalMaxHp;

  recalcBodyHp(creatureEid);
  recalcCapacities(creatureEid);
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

  // Recalculate body
  recalcBodyHp(bodyEid);
  recalcCapacities(bodyEid);
  updateSpeedFromCapacity(bodyEid);
}

/**
 * Look up the PartData for a part entity from its PartIdentity index.
 */
export function getPartData(partEid: number): PartData | undefined {
  const defId = getPartDefId(PartIdentity.partDefId[partEid]);
  if (!defId) return undefined;
  return getRegistry().parts.get(defId);
}
