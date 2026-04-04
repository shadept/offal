/**
 * Inventory system — item entity management, pickup, drop, capacity.
 *
 * Items are ECS entities with Item + (Position | HeldBy) components.
 * Creatures have an Inventory component for capacity tracking.
 * A creature's effective inventory includes items held directly
 * plus items in containers attached to functional body parts.
 */
import { addEntity, addComponent, removeComponent, hasComponent } from 'bitecs';
import { getRegistry } from '../data/loader';
import {
  Item, HeldBy, Inventory, Position, Renderable, Health,
} from './components';
import { getPartsOf, detachPart, recalcCapacities } from './body';
import type { ItemData, DataRegistry } from '../types';
import { ITEM_SIZE_VOLUME } from '../types';

// ═══════════════════════════════════════════════════════════
// WORLD REFERENCE
// ═══════════════════════════════════════════════════════════

let _world: object | null = null;

/** Bind the ECS world for hasComponent checks. Call once after createGameWorld(). */
export function bindInventoryWorld(world: object): void {
  _world = world;
}

function w(): object {
  if (!_world) throw new Error('[inventory] World not bound — call bindInventoryWorld() first');
  return _world;
}

// ═══════════════════════════════════════════════════════════
// ITEM INDEX MAPS (string ↔ numeric)
// ═══════════════════════════════════════════════════════════

const itemDefToIndex = new Map<string, number>();
const indexToItemDef = new Map<number, string>();

/** Initialize item index maps. Call after loadData(). */
export function initItemIndices(registry: DataRegistry): void {
  let idx = 0;
  for (const [id] of registry.items) {
    itemDefToIndex.set(id, idx);
    indexToItemDef.set(idx, id);
    idx++;
  }
}

export function getItemDefIndex(itemId: string): number {
  return itemDefToIndex.get(itemId) ?? 65535;
}

export function getItemDefId(index: number): string | undefined {
  return indexToItemDef.get(index);
}

/** Get the ItemData for an item entity. */
export function getItemData(itemEid: number): ItemData | undefined {
  const defId = getItemDefId(Item.itemDefIdx[itemEid]);
  if (!defId) return undefined;
  return getRegistry().items.get(defId);
}

// ═══════════════════════════════════════════════════════════
// INVENTORY INDEX (owner → item set)
// ═══════════════════════════════════════════════════════════

const inventoryIndex = new Map<number, Set<number>>();

/** Get all item entity IDs held by a creature. */
export function getItemsOf(ownerEid: number): number[] {
  const set = inventoryIndex.get(ownerEid);
  return set ? [...set] : [];
}

function addToInventoryIndex(ownerEid: number, itemEid: number): void {
  let set = inventoryIndex.get(ownerEid);
  if (!set) {
    set = new Set();
    inventoryIndex.set(ownerEid, set);
  }
  set.add(itemEid);
}

function removeFromInventoryIndex(ownerEid: number, itemEid: number): void {
  const set = inventoryIndex.get(ownerEid);
  if (set) {
    set.delete(itemEid);
    if (set.size === 0) inventoryIndex.delete(ownerEid);
  }
}

/** Clear all inventory entries for a creature (on death). */
export function clearInventoryIndex(ownerEid: number): void {
  inventoryIndex.delete(ownerEid);
}

/** Remove an item from its owner's inventory index (before entity removal). */
export function removeItemFromOwner(world: object, itemEid: number): void {
  if (hasComponent(world, itemEid, HeldBy)) {
    const owner = HeldBy.ownerEid[itemEid];
    removeFromInventoryIndex(owner, itemEid);
    removeComponent(world, itemEid, HeldBy);
  }
}

// ═══════════════════════════════════════════════════════════
// VOLUME HELPERS
// ═══════════════════════════════════════════════════════════

/** Get the volume of an item entity. */
export function getItemVolume(itemEid: number): number {
  const data = getItemData(itemEid);
  if (!data) return 0;
  const baseVol = ITEM_SIZE_VOLUME[data.size] ?? 4;
  return baseVol * (Item.stackCount[itemEid] || 1);
}

/** Get a creature's total inventory capacity. */
export function getCreatureCapacity(creatureEid: number): number {
  let total = 0;
  // Creature's own inventory
  if (hasComponent(w(), creatureEid, Inventory)) {
    total += Inventory.capacity[creatureEid];
  }
  // Body-part containers (functional parts with Inventory)
  const parts = getPartsOf(creatureEid);
  for (const pEid of parts) {
    if (Health.hp[pEid] > 0 && hasComponent(w(), pEid, Inventory)) {
      total += Inventory.capacity[pEid];
    }
  }
  return total;
}

/** Get a creature's current used volume. */
export function getCreatureUsedVolume(creatureEid: number): number {
  const items = getItemsOf(creatureEid);
  let used = 0;
  for (const iEid of items) {
    used += getItemVolume(iEid);
  }
  return used;
}

/** Recalculate and cache creature inventory used volume. */
export function recalcInventory(creatureEid: number): void {
  if (!hasComponent(w(), creatureEid, Inventory)) return;
  Inventory.usedVolume[creatureEid] = getCreatureUsedVolume(creatureEid);
}

// ═══════════════════════════════════════════════════════════
// CAN PICK UP / PICK UP / DROP
// ═══════════════════════════════════════════════════════════

/** Check if a creature can pick up an item (has capacity). */
export function canPickUp(creatureEid: number, itemEid: number): boolean {
  const cap = getCreatureCapacity(creatureEid);
  const used = getCreatureUsedVolume(creatureEid);
  const vol = getItemVolume(itemEid);
  return (used + vol) <= cap;
}

/** Pick up an item from the floor into a creature's inventory. */
export function pickUp(
  world: object,
  creatureEid: number,
  itemEid: number,
): boolean {
  if (!canPickUp(creatureEid, itemEid)) return false;

  // Remove floor presence
  if (hasComponent(world, itemEid, Position)) {
    removeComponent(world, itemEid, Position);
  }
  if (hasComponent(world, itemEid, Renderable)) {
    removeComponent(world, itemEid, Renderable);
  }

  // Add ownership
  addComponent(world, itemEid, HeldBy);
  HeldBy.ownerEid[itemEid] = creatureEid;
  addToInventoryIndex(creatureEid, itemEid);

  recalcInventory(creatureEid);
  return true;
}

/** Drop an item from a creature's inventory onto a tile. */
export function drop(
  world: object,
  creatureEid: number,
  itemEid: number,
  x: number,
  y: number,
): void {
  // Remove ownership
  if (hasComponent(world, itemEid, HeldBy)) {
    removeComponent(world, itemEid, HeldBy);
  }
  removeFromInventoryIndex(creatureEid, itemEid);

  // Place on floor
  addComponent(world, itemEid, Position);
  addComponent(world, itemEid, Renderable);
  Position.x[itemEid] = x;
  Position.y[itemEid] = y;
  Renderable.spriteIndex[itemEid] = 7; // item-on-floor sprite
  Renderable.layer[itemEid] = 1; // object layer

  recalcInventory(creatureEid);
}

/** Transfer an item directly between two creatures' inventories (no floor step). */
export function transferItem(
  world: object,
  fromEid: number,
  toEid: number,
  itemEid: number,
): boolean {
  if (!canPickUp(toEid, itemEid)) return false;

  // Update ownership
  removeFromInventoryIndex(fromEid, itemEid);
  HeldBy.ownerEid[itemEid] = toEid;
  addToInventoryIndex(toEid, itemEid);

  recalcInventory(fromEid);
  recalcInventory(toEid);
  return true;
}

/**
 * Detach a body part from a creature and place it directly into another creature's inventory.
 * Used for looting body parts from corpses. Detaches to floor first, then picks up.
 */
export function takePartFromBody(
  world: object,
  partEid: number,
  bodyEid: number,
  recipientEid: number,
): boolean {
  // Detach to a temporary floor position (uses the body's position)
  const x = Position.x[bodyEid];
  const y = Position.y[bodyEid];
  detachPart(world, partEid, bodyEid, x, y);

  // Now pick up from floor into recipient's inventory
  if (!pickUp(world, recipientEid, partEid)) {
    // Failed (no capacity) — part stays on floor
    return false;
  }
  return true;
}

// ═══════════════════════════════════════════════════════════
// ITEM SPAWNING
// ═══════════════════════════════════════════════════════════

/** Get the material index for an item from its data. */
function getMaterialIdx(materialId: string): number {
  const registry = getRegistry();
  let idx = 0;
  for (const [id] of registry.materials) {
    if (id === materialId) return idx;
    idx++;
  }
  return 255;
}

/** Spawn an item entity on the floor at (x, y). */
export function spawnItemOnFloor(
  world: object,
  itemId: string,
  x: number,
  y: number,
  count?: number,
): number {
  const registry = getRegistry();
  const data = registry.items.get(itemId);
  if (!data) {
    console.warn(`[inventory] Unknown item '${itemId}'`);
    return -1;
  }

  const eid = addEntity(world);
  addComponent(world, eid, Item);
  addComponent(world, eid, Position);
  addComponent(world, eid, Renderable);

  Item.itemDefIdx[eid] = getItemDefIndex(itemId);
  Item.materialIdx[eid] = getMaterialIdx(data.material);
  Item.stackCount[eid] = count ?? 1;

  Position.x[eid] = x;
  Position.y[eid] = y;
  Renderable.spriteIndex[eid] = 7; // item-on-floor sprite
  Renderable.layer[eid] = 1;

  return eid;
}

/** Spawn an item directly into a creature's inventory. */
export function spawnItemInInventory(
  world: object,
  itemId: string,
  ownerEid: number,
  count?: number,
): number {
  const registry = getRegistry();
  const data = registry.items.get(itemId);
  if (!data) {
    console.warn(`[inventory] Unknown item '${itemId}'`);
    return -1;
  }

  // Check capacity
  if (!canPickUp(ownerEid, -1)) {
    // Rough check — -1 won't have data, so check manually
    const cap = getCreatureCapacity(ownerEid);
    const used = getCreatureUsedVolume(ownerEid);
    const vol = ITEM_SIZE_VOLUME[data.size] ?? 4;
    if (used + vol > cap) return -1;
  }

  const eid = addEntity(world);
  addComponent(world, eid, Item);
  addComponent(world, eid, HeldBy);

  Item.itemDefIdx[eid] = getItemDefIndex(itemId);
  Item.materialIdx[eid] = getMaterialIdx(data.material);
  Item.stackCount[eid] = count ?? 1;

  HeldBy.ownerEid[eid] = ownerEid;
  addToInventoryIndex(ownerEid, eid);

  recalcInventory(ownerEid);
  return eid;
}

/**
 * Find all item entities at a tile position.
 * Uses a position scan — acceptable for the number of items in play.
 */
export function findItemsAtPosition(x: number, y: number, maxEid: number): number[] {
  const world = w();
  const results: number[] = [];
  for (let eid = 0; eid < maxEid; eid++) {
    if (hasComponent(world, eid, Item) && hasComponent(world, eid, Position)) {
      if (Position.x[eid] === x && Position.y[eid] === y) {
        results.push(eid);
      }
    }
  }
  return results;
}
