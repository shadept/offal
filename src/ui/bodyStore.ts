/**
 * BodyStore — manages body panel UI state.
 * Plain class with listeners for framework-agnostic reactivity (same pattern as InventoryStore).
 */
import { Health, Body, CachedCapacity, AttachedTo, PartMaterial } from '../ecs/components';
import {
  getPartsOf, getSpeciesId, getPartData, getSlotName, getSlotIndex, getMaterialId,
  getOccupiedSlots,
} from '../ecs/body';
import { getRegistry } from '../data/loader';
import type { CapacityType, PartRole } from '../types';

export interface SlotInfo {
  slotId: string;
  slotIdx: number;
  role: PartRole;
  position: string;
  isBlueprint: boolean;
  occupied: boolean;
  partEid: number;
  partName: string;
  hp: number;
  maxHp: number;
  material: string;
  isFunctional: boolean;
  capacityContribution: CapacityType[] | null;
}

export interface BodyInfo {
  speciesId: string;
  speciesName: string;
  locomotionBaseline: string;
  slots: SlotInfo[];
  capacities: Record<CapacityType, number>;
  bodyHp: number;
  bodyMaxHp: number;
}

const CAPACITY_KEYS: CapacityType[] = [
  'mobility', 'manipulation', 'consciousness', 'circulation', 'structuralIntegrity',
];

export class BodyStore {
  private _open = false;
  private _targetEid = -1;
  private _isPlayerBody = false;
  private _highlightedRole: PartRole | null = null;
  private _listeners: (() => void)[] = [];

  get open(): boolean { return this._open; }
  get targetEid(): number { return this._targetEid; }
  get isPlayerBody(): boolean { return this._isPlayerBody; }
  get highlightedRole(): PartRole | null { return this._highlightedRole; }

  /** Toggle the body panel for the player. */
  toggle(playerEid: number): void {
    if (this._open && this._targetEid === playerEid) {
      this.close();
    } else {
      this._open = true;
      this._targetEid = playerEid;
      this._isPlayerBody = true;
      this.notify();
    }
  }

  /** Open the body panel to inspect an arbitrary creature. */
  inspect(creatureEid: number, isPlayer: boolean): void {
    this._open = true;
    this._targetEid = creatureEid;
    this._isPlayerBody = isPlayer;
    this.notify();
  }

  close(): void {
    this._open = false;
    this._targetEid = -1;
    this._highlightedRole = null;
    this.notify();
  }

  setHighlight(role: PartRole | null): void {
    this._highlightedRole = role;
    this.notify();
  }

  /** Get full body information for display. */
  getBodyInfo(creatureEid: number): BodyInfo | null {
    if (creatureEid < 0) return null;

    const registry = getRegistry();
    const speciesId = getSpeciesId(Body.speciesIdx[creatureEid]);
    const species = speciesId ? registry.species.get(speciesId) : undefined;
    if (!species) return null;

    const occupied = getOccupiedSlots(creatureEid);
    const parts = getPartsOf(creatureEid);
    const slots: SlotInfo[] = [];

    // Blueprint slots — always present
    const blueprintSlotIdxs = new Set<number>();
    if (species.parts) {
      for (const slot of species.parts) {
        const slotIdx = getSlotIndex(slot.id);
        blueprintSlotIdxs.add(slotIdx);
        const partEid = occupied.get(slotIdx) ?? -1;
        slots.push(this._makeSlotInfo(slot.id, slotIdx, slot.role as PartRole, slot.position, true, partEid));
      }
    }

    // Dynamic (extra) slots — parts attached beyond the blueprint
    for (const pEid of parts) {
      const slotIdx = AttachedTo.slotId[pEid];
      if (!blueprintSlotIdxs.has(slotIdx)) {
        const partDef = getPartData(pEid);
        const slotName = getSlotName(slotIdx) ?? `slot_${slotIdx}`;
        slots.push(this._makeSlotInfo(
          slotName, slotIdx, (partDef?.type ?? 'organ') as PartRole, 'extra', false, pEid,
        ));
      }
    }

    // Capacities
    const capacities = {} as Record<CapacityType, number>;
    for (const key of CAPACITY_KEYS) {
      capacities[key] = CachedCapacity[key][creatureEid];
    }

    return {
      speciesId: species.id,
      speciesName: species.name,
      locomotionBaseline: species.locomotionBaseline ?? 'biped',
      slots,
      capacities,
      bodyHp: Health.hp[creatureEid],
      bodyMaxHp: Health.maxHp[creatureEid],
    };
  }

  private _makeSlotInfo(
    slotId: string, slotIdx: number, role: PartRole, position: string,
    isBlueprint: boolean, partEid: number,
  ): SlotInfo {
    if (partEid < 0) {
      return {
        slotId, slotIdx, role, position, isBlueprint,
        occupied: false, partEid: -1,
        partName: '', hp: 0, maxHp: 0, material: '',
        isFunctional: false, capacityContribution: null,
      };
    }

    const partDef = getPartData(partEid);
    const matId = getMaterialId(PartMaterial.materialId[partEid]);

    return {
      slotId, slotIdx, role, position, isBlueprint,
      occupied: true,
      partEid,
      partName: partDef?.name ?? 'Unknown Part',
      hp: Health.hp[partEid],
      maxHp: Health.maxHp[partEid],
      material: matId ?? '?',
      isFunctional: Health.hp[partEid] > 0,
      capacityContribution: partDef?.capacityContribution ?? null,
    };
  }

  onChange(fn: () => void): void {
    this._listeners.push(fn);
  }

  removeListener(fn: () => void): void {
    this._listeners = this._listeners.filter(l => l !== fn);
  }

  notify(): void {
    for (const fn of this._listeners) fn();
  }
}

/** Singleton body store. */
export const bodyStore = new BodyStore();
