/**
 * Faction runtime utilities.
 *
 * Maps faction string IDs to numeric indices for use in ECS components.
 * Provides hostility checks based on data/factions.json5.
 */
import { getRegistry } from '../data/loader';
import type { FactionData } from '../types';

/** Faction string ID → numeric index mapping (built at init) */
const factionToIndex = new Map<string, number>();
const indexToFaction = new Map<number, string>();

let initialized = false;

/** Initialize faction index mapping from loaded data. Call after loadData(). */
export function initFactions(): void {
  const registry = getRegistry();
  let idx = 0;
  for (const [id] of registry.factions) {
    factionToIndex.set(id, idx);
    indexToFaction.set(idx, id);
    idx++;
  }
  initialized = true;
}

/** Get numeric index for a faction ID. Returns 255 if unknown. */
export function getFactionIndex(factionId: string): number {
  return factionToIndex.get(factionId) ?? 255;
}

/** Get faction ID from numeric index. */
export function getFactionId(index: number): string | undefined {
  return indexToFaction.get(index);
}

/** Check if factionA is hostile to factionB (by numeric index). */
export function areHostile(factionIndexA: number, factionIndexB: number): boolean {
  if (factionIndexA === factionIndexB) return false;
  if (!initialized) return false;

  const idA = indexToFaction.get(factionIndexA);
  const idB = indexToFaction.get(factionIndexB);
  if (!idA || !idB) return false;

  const registry = getRegistry();
  const fA = registry.factions.get(idA);
  const fB = registry.factions.get(idB);

  return isHostileOneSided(fA, idB) || isHostileOneSided(fB, idA);
}

function isHostileOneSided(faction: FactionData | undefined, otherId: string): boolean {
  if (!faction) return false;
  return faction.hostileTo.includes('*') || faction.hostileTo.includes(otherId);
}
