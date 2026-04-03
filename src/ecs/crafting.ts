/**
 * Crafting system — recipe matching, crude composite fallback, craft execution.
 *
 * Recipes match by tags (not item IDs). If no recipe matches, a crude
 * composite is produced with merged tags and averaged properties.
 */
import { addEntity, addComponent, removeEntity, hasComponent } from 'bitecs';
import { getRegistry } from '../data/loader';
import {
  Item, HeldBy, Inventory, Position, Renderable,
} from './components';
import {
  getItemData, getItemDefIndex, getItemsOf,
  recalcInventory, drop, spawnItemInInventory, spawnItemOnFloor,
  removeItemFromOwner,
} from './inventory';
import type { RecipeData, ItemData } from '../types';
import { ITEM_SIZE_VOLUME } from '../types';
import type { VisualEventQueue } from '../visual/EventQueue';
import { gameLog } from '../ui/gameLog';

// ═══════════════════════════════════════════════════════════
// RECIPE MATCHING
// ═══════════════════════════════════════════════════════════

/** Check if an item entity matches a recipe input's tag requirements. */
function itemMatchesInput(itemEid: number, inputTags: string[]): boolean {
  const data = getItemData(itemEid);
  if (!data) return false;
  return inputTags.every(tag => data.tags.includes(tag));
}

export interface RecipeMatch {
  recipe: RecipeData;
  /** Which item eids satisfy which input (parallel arrays) */
  assignments: number[];
}

/**
 * Given a set of selected item eids, find all matching recipes.
 * Each recipe input must be satisfied by a distinct item.
 */
export function findMatchingRecipes(selectedItems: number[]): RecipeMatch[] {
  const registry = getRegistry();
  const matches: RecipeMatch[] = [];

  for (const [, recipe] of registry.recipes) {
    const assignment = tryAssignInputs(recipe, selectedItems);
    if (assignment) {
      matches.push({ recipe, assignments: assignment });
    }
  }

  return matches;
}

/**
 * Try to assign selected items to recipe inputs (greedy).
 * Returns array of item eids parallel to recipe.inputs, or null if no match.
 */
function tryAssignInputs(recipe: RecipeData, items: number[]): number[] | null {
  const used = new Set<number>();
  const assignments: number[] = [];

  for (const input of recipe.inputs) {
    const minQty = input.quantity?.min ?? 1;
    let found = false;

    for (const eid of items) {
      if (used.has(eid)) continue;
      if (!itemMatchesInput(eid, input.tags)) continue;

      const count = Item.stackCount[eid] || 1;
      if (count >= minQty) {
        assignments.push(eid);
        used.add(eid);
        found = true;
        break;
      }
    }

    if (!found) return null;
  }

  return assignments;
}

// ═══════════════════════════════════════════════════════════
// CRUDE COMPOSITE FALLBACK
// ═══════════════════════════════════════════════════════════

export interface CrudeComposite {
  name: string;
  description: string;
  material: string;
  shape: string;
  size: string;
  tags: string[];
}

/** Generate a crude composite from N items. */
export function generateCrudeComposite(itemEids: number[]): CrudeComposite {
  const allData: ItemData[] = [];
  for (const eid of itemEids) {
    const d = getItemData(eid);
    if (d) allData.push(d);
  }

  // Merge tags (union)
  const tagSet = new Set<string>();
  for (const d of allData) {
    for (const t of d.tags) tagSet.add(t);
  }
  tagSet.add('crude');
  tagSet.add('composite');

  // Material from first item
  const material = allData[0]?.material ?? 'organic';

  // Size = largest
  const sizeOrder = ['tiny', 'small', 'medium', 'large', 'huge'];
  let maxSizeIdx = 0;
  for (const d of allData) {
    const idx = sizeOrder.indexOf(d.size);
    if (idx > maxSizeIdx) maxSizeIdx = idx;
  }

  // Name from input names
  const names = allData.map(d => d.name);
  const name = `Crude ${names.join('-')}`;
  const description = `A crude combination of ${names.join(' and ')}. Improvised.`;

  return {
    name,
    description,
    material,
    shape: 'composite',
    size: sizeOrder[maxSizeIdx],
    tags: [...tagSet],
  };
}

// ═══════════════════════════════════════════════════════════
// CRAFT EXECUTION
// ═══════════════════════════════════════════════════════════

/**
 * Execute a recipe craft: consume inputs, produce output.
 * Returns the output item eid, or -1 on failure.
 */
export function executeCraft(
  world: object,
  creatureEid: number,
  match: RecipeMatch,
  eventQueue: VisualEventQueue,
  turnCount: number,
): number {
  const registry = getRegistry();
  const { recipe, assignments } = match;

  // Consume inputs
  for (let i = 0; i < recipe.inputs.length; i++) {
    const input = recipe.inputs[i];
    const itemEid = assignments[i];
    if (input.consumed !== false) {
      removeItemFromOwner(world, itemEid);
      removeEntity(world, itemEid);
    }
  }

  // Produce output
  let outputEid = -1;
  if (recipe.output.id) {
    outputEid = spawnItemInInventory(world, recipe.output.id, creatureEid);
    if (outputEid === -1) {
      // No space or unknown item — drop at feet
      const x = hasComponent(world, creatureEid, Position) ? Position.x[creatureEid] : 0;
      const y = hasComponent(world, creatureEid, Position) ? Position.y[creatureEid] : 0;
      outputEid = spawnItemOnFloor(world, recipe.output.id, x, y);
    }
  }

  // Recalc inventory
  recalcInventory(creatureEid);

  // Log & visual event
  const outputData = outputEid >= 0 ? getItemData(outputEid) : null;
  const outputName = outputData?.name ?? recipe.name ?? 'something';
  gameLog.push(turnCount, 'system', `Crafted: ${outputName}`);

  eventQueue.push({
    type: 'craft_success',
    entityId: creatureEid,
    data: { outputEid, outputName },
  });

  return outputEid;
}

/**
 * Execute a crude composite craft: consume all inputs, produce generic item.
 */
export function executeCrudeCraft(
  world: object,
  creatureEid: number,
  itemEids: number[],
  eventQueue: VisualEventQueue,
  turnCount: number,
): number {
  const composite = generateCrudeComposite(itemEids);

  // Remove all input items
  for (const eid of itemEids) {
    removeItemFromOwner(world, eid);
    removeEntity(world, eid);
  }

  // Create crude composite entity
  const outputEid = addEntity(world);
  addComponent(world, outputEid, Item);
  addComponent(world, outputEid, HeldBy);

  // Use a generic item def index (0 = first item) — crude composites don't map to data
  Item.itemDefIdx[outputEid] = 65535; // sentinel: no data def
  Item.materialIdx[outputEid] = 0;
  Item.stackCount[outputEid] = 1;

  HeldBy.ownerEid[outputEid] = creatureEid;

  recalcInventory(creatureEid);

  gameLog.push(turnCount, 'system', `Crafted: ${composite.name}`);

  eventQueue.push({
    type: 'craft_success',
    entityId: creatureEid,
    data: { outputEid, outputName: composite.name },
  });

  // Store composite data on entity for display
  crudeCompositeData.set(outputEid, composite);

  return outputEid;
}

/** Side-channel storage for crude composite metadata (not in bitECS SoA). */
export const crudeCompositeData = new Map<number, CrudeComposite>();
