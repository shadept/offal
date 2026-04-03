/**
 * InventoryStore — manages inventory UI state.
 * Not a Svelte $state store — plain class with listeners for framework-agnostic reactivity.
 */
import { hasComponent } from 'bitecs';
import { Item, HeldBy, Inventory, Position } from '../ecs/components';
import {
  getItemsOf, getItemData, getItemVolume, getCreatureCapacity,
  getCreatureUsedVolume, findItemsAtPosition,
} from '../ecs/inventory';
import { crudeCompositeData } from '../ecs/crafting';
import type { ItemData } from '../types';
import { ITEM_SIZE_VOLUME } from '../types';

export interface InventoryItemInfo {
  eid: number;
  name: string;
  material: string;
  size: string;
  volume: number;
  stackCount: number;
  tags: string[];
  selected: boolean;
}

export interface FloorItemInfo {
  eid: number;
  name: string;
  material: string;
  size: string;
}

export class InventoryStore {
  private _open = false;
  private _craftMode = false;
  private _selectedItems = new Set<number>();
  private _listeners: (() => void)[] = [];

  get open(): boolean { return this._open; }
  get craftMode(): boolean { return this._craftMode; }

  toggle(): void {
    this._open = !this._open;
    if (!this._open) {
      this._craftMode = false;
      this._selectedItems.clear();
    }
    this.notify();
  }

  close(): void {
    this._open = false;
    this._craftMode = false;
    this._selectedItems.clear();
    this.notify();
  }

  openPanel(): void {
    this._open = true;
    this.notify();
  }

  toggleCraftMode(): void {
    this._craftMode = !this._craftMode;
    if (!this._craftMode) this._selectedItems.clear();
    this.notify();
  }

  toggleItemSelection(eid: number): void {
    if (this._selectedItems.has(eid)) {
      this._selectedItems.delete(eid);
    } else {
      this._selectedItems.add(eid);
    }
    this.notify();
  }

  isSelected(eid: number): boolean {
    return this._selectedItems.has(eid);
  }

  getSelectedItems(): number[] {
    return [...this._selectedItems];
  }

  clearSelection(): void {
    this._selectedItems.clear();
    this.notify();
  }

  /** Get inventory items for a creature. */
  getInventoryItems(creatureEid: number): InventoryItemInfo[] {
    const items = getItemsOf(creatureEid);
    const result: InventoryItemInfo[] = [];

    for (const eid of items) {
      const data = getItemData(eid);
      const crude = crudeCompositeData.get(eid);
      const name = data?.name ?? crude?.name ?? 'Unknown Item';
      const material = data?.material ?? crude?.material ?? '?';
      const size = data?.size ?? crude?.size ?? 'medium';
      const volume = data ? (ITEM_SIZE_VOLUME[data.size] ?? 4) * (Item.stackCount[eid] || 1) : 4;

      result.push({
        eid,
        name,
        material,
        size,
        volume,
        stackCount: Item.stackCount[eid] || 1,
        tags: data?.tags ?? crude?.tags ?? [],
        selected: this._selectedItems.has(eid),
      });
    }

    return result;
  }

  /** Get capacity info for a creature. */
  getCapacityInfo(creatureEid: number): { used: number; max: number } {
    return {
      used: getCreatureUsedVolume(creatureEid),
      max: getCreatureCapacity(creatureEid),
    };
  }

  /** Get items on the floor at a position. */
  getFloorItems(x: number, y: number, maxEid: number): FloorItemInfo[] {
    const eids = findItemsAtPosition(x, y, maxEid);
    return eids.map(eid => {
      const data = getItemData(eid);
      return {
        eid,
        name: data?.name ?? 'Unknown',
        material: data?.material ?? '?',
        size: data?.size ?? 'medium',
      };
    });
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

/** Singleton inventory store. */
export const inventoryStore = new InventoryStore();
