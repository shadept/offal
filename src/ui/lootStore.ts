/**
 * LootStore — manages loot panel UI state for inspecting/looting corpses.
 * Same listener pattern as InventoryStore / BodyStore.
 */
import { hasComponent } from 'bitecs';
import { Item, PartIdentity } from '../ecs/components';
import {
  getItemsOf, getItemData, getCreatureCapacity, getCreatureUsedVolume,
} from '../ecs/inventory';
import { getPartsOf, getPartData } from '../ecs/body';
import { ITEM_SIZE_VOLUME } from '../types';
import type { ItemData, PartRole } from '../types';

export interface LootItemInfo {
  eid: number;
  name: string;
  material: string;
  size: string;
  volume: number;
  stackCount: number;
  isPart: boolean;
  partRole?: PartRole;
}

export class LootStore {
  private _open = false;
  private _targetEid = -1;
  private _listeners: (() => void)[] = [];
  private _world: object | null = null;

  bindWorld(world: object): void { this._world = world; }

  get open(): boolean { return this._open; }
  get targetEid(): number { return this._targetEid; }

  /** Open the loot panel for a corpse entity. */
  loot(corpseEid: number): void {
    this._open = true;
    this._targetEid = corpseEid;
    this.notify();
  }

  close(): void {
    this._open = false;
    this._targetEid = -1;
    this.notify();
  }

  /** Get lootable body parts (attached to the corpse). */
  getBodyParts(corpseEid: number): LootItemInfo[] {
    const parts = getPartsOf(corpseEid);
    const result: LootItemInfo[] = [];
    for (const pEid of parts) {
      const partDef = getPartData(pEid);
      result.push({
        eid: pEid,
        name: partDef?.name ?? 'Body Part',
        material: partDef?.material ?? '?',
        size: 'medium',
        volume: 4,
        stackCount: 1,
        isPart: true,
        partRole: partDef?.type as PartRole | undefined,
      });
    }
    return result;
  }

  /** Get inventory items held by the corpse. */
  getInventoryItems(corpseEid: number): LootItemInfo[] {
    const items = getItemsOf(corpseEid);
    const result: LootItemInfo[] = [];
    for (const eid of items) {
      // Skip body parts in inventory (shown in body parts section)
      if (this._world && hasComponent(this._world, eid, PartIdentity)) continue;
      const data = getItemData(eid);
      result.push({
        eid,
        name: data?.name ?? 'Unknown Item',
        material: data?.material ?? '?',
        size: data?.size ?? 'medium',
        volume: data ? (ITEM_SIZE_VOLUME[data.size] ?? 4) * (Item.stackCount[eid] || 1) : 4,
        stackCount: Item.stackCount[eid] || 1,
        isPart: false,
      });
    }
    return result;
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

/** Singleton loot store. */
export const lootStore = new LootStore();
