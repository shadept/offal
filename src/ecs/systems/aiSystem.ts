/**
 * AI system — processes non-player entity turns.
 *
 * State machine:
 *   - idle:      not doing anything
 *   - wander:    move to random adjacent walkable tile each turn
 *   - seek:      target in FOV — A* pathfind, update lastKnownPos each turn
 *   - searching: target left FOV — move toward lastKnownPos, countdown searchBudget
 *
 * Pathfinding: A* with Manhattan distance heuristic, 4-directional.
 * Paths are cached per-entity and reused when the target hasn't moved.
 */
import { query, hasComponent, addComponent } from 'bitecs';
import {
  AI, AIState, Turn, PlayerTag, Position, FOV,
  Health, Faction, CombatStats, Dead, BlocksMovement,
} from '../components';
import { areHostile } from '../factions';
import { TileMap } from '../../map/TileMap';
import { getRegistry } from '../../data/loader';
import { getClosedDoorAt, openDoorEntity, checkTeleport } from './movementSystem';
import { getVisibleTiles } from '../../map/fov';
import { applyDamage } from '../damage';
import type { VisualEvent } from '../../types';
import type { VisualEventQueue } from '../../visual/EventQueue';
import { isTileOccupied } from './movementSystem';

/** Standard action cost */
const ACTION_COST = 100;

/** Max A* search range */
const MAX_RANGE = 20;

// ═══════════════════════════════════════════════════════════
// Path cache — stored outside bitECS (variable-length arrays)
// ═══════════════════════════════════════════════════════════

// Path cache — variable-length arrays can't live in bitECS typed arrays.
// Cleaned up via clearEntityAICache() when entities are removed.
const aiPaths = new Map<number, { x: number; y: number }[]>();

/** Get the cached A* path for an entity (for debug overlay). */
export function getAIPath(eid: number): { x: number; y: number }[] {
  return aiPaths.get(eid) ?? [];
}

/** Clear cached path and component cache fields for an entity. */
function clearPath(eid: number): void {
  aiPaths.delete(eid);
  AI.cachedTargetX[eid] = -1;
  AI.cachedTargetY[eid] = -1;
}

/** Clean up path cache when an entity is removed from the world. */
export function clearEntityAICache(eid: number): void {
  aiPaths.delete(eid);
}

// ═══════════════════════════════════════════════════════════
// Tile helpers
// ═══════════════════════════════════════════════════════════

/** Check if a tile has a closed door entity that can be opened. */
function isClosedDoor(map: TileMap, x: number, y: number, world: object): boolean {
  return getClosedDoorAt(x, y, world) >= 0;
}

/** Open a closed door entity at (x, y). */
function openDoor(
  eid: number,
  x: number, y: number,
  map: TileMap,
  eventQueue: VisualEventQueue,
  world: object,
): void {
  const doorEid = getClosedDoorAt(x, y, world);
  if (doorEid < 0) return;
  openDoorEntity(doorEid, eid, map, eventQueue);
}

/** Cardinal directions */
const DIRS = [
  { dx: 0, dy: -1 },
  { dx: 0, dy: 1 },
  { dx: -1, dy: 0 },
  { dx: 1, dy: 0 },
];

// ═══════════════════════════════════════════════════════════
// FOV helpers
// ═══════════════════════════════════════════════════════════

/**
 * Check if entity can see the tile at (tx, ty).
 * Uses the full shadowcasting FOV (same algorithm as player).
 */
function canSee(map: TileMap, eid: number, tx: number, ty: number): boolean {
  const ex = Position.x[eid];
  const ey = Position.y[eid];
  const range = FOV.range[eid] || 6;
  if (chebyshev(ex, ey, tx, ty) > range) return false;
  const visible = getVisibleTiles(map, ex, ey, range);
  return visible.has(ty * map.width + tx);
}

// ═══════════════════════════════════════════════════════════
// MAIN ENTRY
// ═══════════════════════════════════════════════════════════

/**
 * Process all AI entities that have enough energy to act.
 * Returns the number of entities that acted.
 */
export function processAITurns(
  world: object,
  map: TileMap,
  eventQueue: VisualEventQueue,
): number {
  const aiEntities = query(world, [AI, Turn, Position]);
  const players = query(world, [PlayerTag]);
  const allCombatants = Array.from(query(world, [Position, Faction, Health]));
  const pendingTiles = new Set<string>();
  let acted = 0;

  for (const eid of aiEntities) {
    if (players.includes(eid)) continue;
    if (hasComponent(world, eid, Dead)) continue;
    if (Turn.energy[eid] < ACTION_COST) continue;

    processEntity(eid, allCombatants, map, world, eventQueue, pendingTiles);
    Turn.energy[eid] -= ACTION_COST;
    acted++;
  }

  return acted;
}

/** Process a single AI entity's turn. */
function processEntity(
  eid: number,
  allCombatants: number[],
  map: TileMap,
  world: object,
  eventQueue: VisualEventQueue,
  pendingTiles: Set<string>,
): void {
  // Skip if killed during this turn (e.g., by another entity's attack earlier in the loop)
  if (hasComponent(world, eid, Dead)) return;

  const state = AI.state[eid] as number;
  const targetEid = AI.targetEid[eid];

  // Validate current target is still alive (entity may have been removed between turns)
  if (targetEid >= 0 && (!hasComponent(world, targetEid, Health) || hasComponent(world, targetEid, Dead) || Health.hp[targetEid] <= 0)) {
    AI.targetEid[eid] = -1;
    AI.state[eid] = AIState.WANDER;
    AI.lastKnownX[eid] = -1;
    AI.lastKnownY[eid] = -1;
    AI.searchBudget[eid] = 0;
    clearPath(eid);
  }

  // Scan FOV for hostiles
  const visibleHostile = findVisibleHostile(eid, allCombatants, map, world);

  switch (state) {
    case AIState.IDLE:
    case AIState.WANDER: {
      if (visibleHostile !== -1) {
        // Hostile spotted — transition to seek
        AI.state[eid] = AIState.SEEK;
        AI.targetEid[eid] = visibleHostile;
        AI.lastKnownX[eid] = Position.x[visibleHostile];
        AI.lastKnownY[eid] = Position.y[visibleHostile];
        clearPath(eid);
        doSeek(eid, visibleHostile, map, world, eventQueue, pendingTiles);
      } else {
        wander(eid, map, world, eventQueue, pendingTiles);
      }
      break;
    }

    case AIState.SEEK: {
      const curTarget = AI.targetEid[eid];
      if (curTarget < 0) {
        AI.state[eid] = AIState.WANDER;
        wander(eid, map, world, eventQueue, pendingTiles);
        break;
      }

      // If a closer visible hostile exists, switch target
      const bestHostile = visibleHostile !== -1 ? visibleHostile : curTarget;

      // Can we see the target?
      const targetX = Position.x[bestHostile];
      const targetY = Position.y[bestHostile];
      const targetVisible = canSee(map, eid, targetX, targetY);

      if (targetVisible) {
        AI.targetEid[eid] = bestHostile;
        AI.lastKnownX[eid] = targetX;
        AI.lastKnownY[eid] = targetY;
        doSeek(eid, bestHostile, map, world, eventQueue, pendingTiles);
      } else {
        // Lost sight — transition to searching
        AI.state[eid] = AIState.SEARCHING;
        AI.searchBudget[eid] = Math.floor((FOV.range[eid] || 6) * 0.5);
        clearPath(eid);
        doSearch(eid, map, world, eventQueue, pendingTiles);
      }
      break;
    }

    case AIState.SEARCHING: {
      // Check if target re-entered FOV
      if (visibleHostile !== -1) {
        AI.state[eid] = AIState.SEEK;
        AI.targetEid[eid] = visibleHostile;
        AI.lastKnownX[eid] = Position.x[visibleHostile];
        AI.lastKnownY[eid] = Position.y[visibleHostile];
        AI.searchBudget[eid] = 0;
        clearPath(eid);
        doSeek(eid, visibleHostile, map, world, eventQueue, pendingTiles);
      } else {
        doSearch(eid, map, world, eventQueue, pendingTiles);
      }
      break;
    }

    default:
      wander(eid, map, world, eventQueue, pendingTiles);
      break;
  }
}

// ═══════════════════════════════════════════════════════════
// DETECTION
// ═══════════════════════════════════════════════════════════

/** Find the nearest hostile entity actually visible (in FOV) to this entity. */
function findVisibleHostile(
  eid: number,
  candidates: number[],
  map: TileMap,
  world: object,
): number {
  const ex = Position.x[eid];
  const ey = Position.y[eid];
  const range = FOV.range[eid] || 6;
  const myFaction = Faction.factionIndex[eid];

  // Compute this entity's visible tile set once
  const visibleSet = getVisibleTiles(map, ex, ey, range);

  let bestDist = Infinity;
  let bestTarget = -1;

  for (const cid of candidates) {
    if (cid === eid) continue;
    if (hasComponent(world, cid, Dead)) continue;
    if (Health.hp[cid] <= 0) continue;

    const theirFaction = Faction.factionIndex[cid];
    if (!areHostile(myFaction, theirFaction)) continue;

    const cx = Position.x[cid];
    const cy = Position.y[cid];

    // Must be in FOV
    if (!visibleSet.has(cy * map.width + cx)) continue;

    const dist = chebyshev(ex, ey, cx, cy);
    if (dist < bestDist) {
      bestDist = dist;
      bestTarget = cid;
    }
  }

  return bestTarget;
}

// ═══════════════════════════════════════════════════════════
// BEHAVIOURS
// ═══════════════════════════════════════════════════════════

/** Seek: pathfind toward visible target, attack if adjacent. */
function doSeek(
  eid: number,
  target: number,
  map: TileMap,
  world: object,
  eventQueue: VisualEventQueue,
  pendingTiles: Set<string>,
): void {
  const ex = Position.x[eid];
  const ey = Position.y[eid];
  const tx = Position.x[target];
  const ty = Position.y[target];

  // Adjacent — attack
  if (manhattan(ex, ey, tx, ty) === 1) {
    performAttack(eid, target, world, eventQueue);
    return;
  }

  // Get or compute path
  const path = getOrComputePath(eid, ex, ey, tx, ty, map, world);
  if (!path || path.length === 0) return;

  const step = path[0];

  // If next step lands on target tile, attack instead
  if (step.x === tx && step.y === ty) {
    performAttack(eid, target, world, eventQueue);
    return;
  }

  // If next step is a closed door, open it
  if (isClosedDoor(map, step.x, step.y, world)) {
    openDoor(eid, step.x, step.y, map, eventQueue, world);
    clearPath(eid); // path invalidated by door opening
    return;
  }

  // Check occupancy
  const key = `${step.x},${step.y}`;
  if (isTileOccupied(step.x, step.y, eid, world) || pendingTiles.has(key)) return;

  pendingTiles.add(key);
  enqueueMove(eid, ex, ey, step.x, step.y, eventQueue, map, world);

  // Consume the step from cached path
  path.shift();
}

/** Search: move toward lastKnownPos, decrement budget. */
function doSearch(
  eid: number,
  map: TileMap,
  world: object,
  eventQueue: VisualEventQueue,
  pendingTiles: Set<string>,
): void {
  const lkx = AI.lastKnownX[eid];
  const lky = AI.lastKnownY[eid];
  const budget = AI.searchBudget[eid];

  // Budget exhausted or no LKP — give up
  if (budget <= 0 || (lkx === -1 && lky === -1)) {
    AI.state[eid] = AIState.WANDER;
    AI.lastKnownX[eid] = -1;
    AI.lastKnownY[eid] = -1;
    AI.targetEid[eid] = -1;
    AI.searchBudget[eid] = 0;
    clearPath(eid);
    wander(eid, map, world, eventQueue, pendingTiles);
    return;
  }

  const ex = Position.x[eid];
  const ey = Position.y[eid];

  // Reached LKP — give up
  if (ex === lkx && ey === lky) {
    AI.state[eid] = AIState.WANDER;
    AI.lastKnownX[eid] = -1;
    AI.lastKnownY[eid] = -1;
    AI.targetEid[eid] = -1;
    AI.searchBudget[eid] = 0;
    clearPath(eid);
    wander(eid, map, world, eventQueue, pendingTiles);
    return;
  }

  // Pathfind toward LKP
  const path = getOrComputePath(eid, ex, ey, lkx, lky, map, world);
  if (!path || path.length === 0) {
    // Can't reach LKP — give up
    AI.state[eid] = AIState.WANDER;
    AI.lastKnownX[eid] = -1;
    AI.lastKnownY[eid] = -1;
    AI.targetEid[eid] = -1;
    AI.searchBudget[eid] = 0;
    clearPath(eid);
    return;
  }

  const step = path[0];

  // Door handling
  if (isClosedDoor(map, step.x, step.y, world)) {
    openDoor(eid, step.x, step.y, map, eventQueue, world);
    clearPath(eid);
    AI.searchBudget[eid] = budget - 1;
    return;
  }

  const key = `${step.x},${step.y}`;
  if (isTileOccupied(step.x, step.y, eid, world) || pendingTiles.has(key)) {
    AI.searchBudget[eid] = budget - 1;
    return;
  }

  pendingTiles.add(key);
  enqueueMove(eid, ex, ey, step.x, step.y, eventQueue, map, world);
  path.shift();
  AI.searchBudget[eid] = budget - 1;
}

/** Move to a random adjacent walkable, unoccupied tile. */
function wander(
  eid: number,
  map: TileMap,
  world: object,
  eventQueue: VisualEventQueue,
  pendingTiles: Set<string>,
): void {
  AI.state[eid] = AIState.WANDER;
  const x = Position.x[eid];
  const y = Position.y[eid];

  // Shuffle directions but push the reverse of last move to the end
  // to avoid back-and-forth flashing
  const lastDx = AI.lastDirX[eid];
  const lastDy = AI.lastDirY[eid];
  const dirs = [...DIRS].sort(() => Math.random() - 0.5);
  if (lastDx !== 0 || lastDy !== 0) {
    const revIdx = dirs.findIndex(d => d.dx === -lastDx && d.dy === -lastDy);
    if (revIdx >= 0) {
      dirs.push(dirs.splice(revIdx, 1)[0]);
    }
  }

  for (const { dx, dy } of dirs) {
    const nx = x + dx;
    const ny = y + dy;
    if (!map.inBounds(nx, ny)) continue;

    // If closed door, open it and end turn
    if (isClosedDoor(map, nx, ny, world)) {
      openDoor(eid, nx, ny, map, eventQueue, world);
      return;
    }

    if (map.blocksMovement(nx, ny)) continue;
    if (isTileOccupied(nx, ny, eid, world)) continue;
    const key = `${nx},${ny}`;
    if (pendingTiles.has(key)) continue;

    pendingTiles.add(key);
    AI.lastDirX[eid] = dx;
    AI.lastDirY[eid] = dy;
    enqueueMove(eid, x, y, nx, ny, eventQueue, map, world);
    return;
  }
}

// ═══════════════════════════════════════════════════════════
// A* PATHFINDING
// ═══════════════════════════════════════════════════════════

/** Get cached path or compute new one. Returns the path array (mutable). */
function getOrComputePath(
  eid: number,
  sx: number, sy: number,
  tx: number, ty: number,
  map: TileMap,
  world: object,
): { x: number; y: number }[] | null {
  const cachedX = AI.cachedTargetX[eid];
  const cachedY = AI.cachedTargetY[eid];
  const path = aiPaths.get(eid);

  // Reuse cached path if target hasn't moved and path is non-empty
  if (path && path.length > 0 && cachedX === tx && cachedY === ty) {
    // Validate first step is still walkable
    const step = path[0];
    const isTarget = step.x === tx && step.y === ty;
    const isDoor = isClosedDoor(map, step.x, step.y, world);
    if (isTarget || isDoor || (!map.blocksMovement(step.x, step.y))) {
      return path;
    }
    // Path invalidated — recompute
  }

  // Compute new A* path
  const newPath = aStarPath(sx, sy, tx, ty, map, eid, world);
  if (newPath && newPath.length > 0) {
    aiPaths.set(eid, newPath);
    AI.cachedTargetX[eid] = tx;
    AI.cachedTargetY[eid] = ty;
    return newPath;
  }

  clearPath(eid);
  return null;
}

/**
 * A* pathfinding from (sx,sy) to (tx,ty).
 * Returns full path excluding start, or null if no path.
 * 4-directional, Manhattan distance heuristic.
 */
function aStarPath(
  sx: number, sy: number,
  tx: number, ty: number,
  map: TileMap,
  eid: number,
  world: object,
): { x: number; y: number }[] | null {
  const h = (x: number, y: number) => Math.abs(x - tx) + Math.abs(y - ty);
  const key = (x: number, y: number) => y * map.width + x;
  const startKey = key(sx, sy);
  const targetKey = key(tx, ty);

  if (startKey === targetKey) return [];

  const gScore = new Map<number, number>();
  const fScore = new Map<number, number>();
  const parent = new Map<number, number>();
  const closed = new Set<number>();

  const open: number[] = [];

  gScore.set(startKey, 0);
  fScore.set(startKey, h(sx, sy));
  open.push(startKey);

  while (open.length > 0) {
    // Find node with lowest fScore
    let bestIdx = 0;
    let bestF = fScore.get(open[0])!;
    for (let i = 1; i < open.length; i++) {
      const f = fScore.get(open[i])!;
      if (f < bestF) { bestF = f; bestIdx = i; }
    }

    const cur = open[bestIdx];
    open[bestIdx] = open[open.length - 1];
    open.pop();

    if (cur === targetKey) {
      const path: { x: number; y: number }[] = [];
      let step = cur;
      while (step !== startKey) {
        path.push({ x: step % map.width, y: (step - step % map.width) / map.width });
        step = parent.get(step)!;
      }
      path.reverse();
      return path;
    }

    closed.add(cur);
    const cx = cur % map.width;
    const cy = (cur - cx) / map.width;

    // Range limit
    if (manhattan(sx, sy, cx, cy) > MAX_RANGE) continue;

    for (const { dx, dy } of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!map.inBounds(nx, ny)) continue;
      const nk = key(nx, ny);
      if (closed.has(nk)) continue;

      const isTarget = (nx === tx && ny === ty);
      const isDoor = isClosedDoor(map, nx, ny, world);
      if (!isTarget && !isDoor && map.blocksMovement(nx, ny)) continue;
      if (!isTarget && !isDoor && isTileOccupied(nx, ny, eid, world)) continue;

      const tentativeG = gScore.get(cur)! + 1;
      const prevG = gScore.get(nk);

      if (prevG === undefined || tentativeG < prevG) {
        parent.set(nk, cur);
        gScore.set(nk, tentativeG);
        fScore.set(nk, tentativeG + h(nx, ny));
        if (prevG === undefined) {
          open.push(nk);
        }
      }
    }
  }

  return null;
}

// ═══════════════════════════════════════════════════════════
// COMBAT
// ═══════════════════════════════════════════════════════════

/** Attack a target entity. */
export function performAttack(
  attacker: number,
  target: number,
  world: object,
  eventQueue: VisualEventQueue,
): void {
  const damage = CombatStats.attackDamage[attacker] || 1;
  applyDamage(target, damage, {
    source: 'melee',
    attackerEid: attacker,
    damageType: 'blunt',
  }, world, eventQueue);
}

// ═══════════════════════════════════════════════════════════
// MOVEMENT
// ═══════════════════════════════════════════════════════════

/** Enqueue a move visual event with position commit, then check teleporters. */
function enqueueMove(
  eid: number,
  fromX: number, fromY: number,
  toX: number, toY: number,
  eventQueue: VisualEventQueue,
  map?: TileMap, world?: object,
): void {
  const moveEvent: VisualEvent = {
    type: 'move',
    entityId: eid,
    data: { fromX, fromY, toX, toY },
  };
  Position.x[eid] = toX;
  Position.y[eid] = toY;
  eventQueue.push(moveEvent);

  // Teleporter check — warp if entity stepped onto a pad
  if (map && world) {
    checkTeleport(eid, fromX, fromY, map, world, eventQueue);
  }
}

// ═══════════════════════════════════════════════════════════
// UTILITY
// ═══════════════════════════════════════════════════════════

/** Chebyshev distance. */
function chebyshev(x1: number, y1: number, x2: number, y2: number): number {
  return Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
}

/** Manhattan distance. */
function manhattan(x1: number, y1: number, x2: number, y2: number): number {
  return Math.abs(x2 - x1) + Math.abs(y2 - y1);
}
