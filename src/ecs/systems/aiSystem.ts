/**
 * AI system — processes non-player entity turns.
 *
 * Behaviours:
 *   - wander: move to a random adjacent walkable tile
 *   - seek: BFS pathfind toward nearest hostile within FOV range
 *   - attack: if adjacent to hostile, deal damage instead of moving
 *
 * Detection: entities start wandering, switch to seek when a hostile
 * is within their fovRange.
 */
import { query, hasComponent } from 'bitecs';
import {
  AI, AIBehaviour, Turn, PlayerTag, Position, FOV,
  Health, Faction, CombatStats, Dead, BlocksMovement,
} from '../components';
import { areHostile } from '../factions';
import { TileMap } from '../../map/TileMap';
import { getRegistry } from '../../data/loader';
import type { VisualEvent } from '../../types';
import type { VisualEventQueue } from '../../visual/EventQueue';

/** Standard action cost */
const ACTION_COST = 100;

/** Check if a tile is a closed door that can be opened. */
function isClosedDoor(map: TileMap, x: number, y: number): boolean {
  const tileIndex = map.get(x, y);
  const tileData = getRegistry().tilesByIndex.get(tileIndex);
  return !!(tileData?.interactable && tileData.opensTo);
}

/** Open a closed door tile: enqueue visual event + commit map change. */
function openDoor(
  eid: number,
  x: number, y: number,
  map: TileMap,
  eventQueue: VisualEventQueue,
): void {
  const tileIndex = map.get(x, y);
  const tileData = getRegistry().tilesByIndex.get(tileIndex);
  if (!tileData?.opensTo) return;
  const openTile = getRegistry().tiles.get(tileData.opensTo);
  if (!openTile) return;

  const doorEvent: VisualEvent = {
    type: 'door_open',
    entityId: eid,
    data: { x, y },
  };
  eventQueue.push(doorEvent, () => {
    map.set(x, y, openTile.index);
  });
}

/** Cardinal directions */
const DIRS = [
  { dx: 0, dy: -1 },
  { dx: 0, dy: 1 },
  { dx: -1, dy: 0 },
  { dx: 1, dy: 0 },
];

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
  /** Tiles claimed by pending moves this batch (prevents same-tile overlap). */
  const pendingTiles = new Set<string>();
  let acted = 0;

  for (const eid of aiEntities) {
    if (players.includes(eid)) continue;
    if (hasComponent(world, eid, Dead)) continue;
    if (Turn.energy[eid] < ACTION_COST) continue;

    // Determine behaviour: check for nearby hostiles
    const target = findNearestHostile(eid, allCombatants, map, world);

    if (target !== -1) {
      AI.targetEid[eid] = target;
      const dist = chebyshev(
        Position.x[eid], Position.y[eid],
        Position.x[target], Position.y[target],
      );

      if (dist === 1) {
        // Adjacent — attack
        performAttack(eid, target, world, eventQueue);
        AI.behaviour[eid] = AIBehaviour.SEEK;
      } else {
        // Seek toward target
        AI.behaviour[eid] = AIBehaviour.SEEK;
        seekToward(eid, target, map, world, eventQueue, pendingTiles);
      }
    } else {
      // No hostile in range — wander
      AI.targetEid[eid] = -1;
      AI.behaviour[eid] = AIBehaviour.WANDER;
      wander(eid, map, world, eventQueue, pendingTiles);
    }

    Turn.energy[eid] -= ACTION_COST;
    acted++;
  }

  return acted;
}

/** Find the nearest hostile entity within this entity's FOV range. */
function findNearestHostile(
  eid: number,
  candidates: number[],
  map: TileMap,
  world: object,
): number {
  const ex = Position.x[eid];
  const ey = Position.y[eid];
  const range = FOV.range[eid] || 6;
  const myFaction = Faction.factionIndex[eid];

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
    const dist = chebyshev(ex, ey, cx, cy);
    if (dist <= range && dist < bestDist) {
      bestDist = dist;
      bestTarget = cid;
    }
  }

  return bestTarget;
}

/** Move to a random adjacent walkable, unoccupied tile. */
function wander(
  eid: number,
  map: TileMap,
  world: object,
  eventQueue: VisualEventQueue,
  pendingTiles: Set<string>,
): void {
  const x = Position.x[eid];
  const y = Position.y[eid];

  // Shuffle directions
  const dirs = [...DIRS].sort(() => Math.random() - 0.5);

  for (const { dx, dy } of dirs) {
    const nx = x + dx;
    const ny = y + dy;
    if (!map.inBounds(nx, ny)) continue;

    // If closed door, open it and end turn
    if (isClosedDoor(map, nx, ny)) {
      openDoor(eid, nx, ny, map, eventQueue);
      return;
    }

    if (map.blocksMovement(nx, ny)) continue;
    if (isTileOccupied(nx, ny, eid, world)) continue;
    const key = `${nx},${ny}`;
    if (pendingTiles.has(key)) continue;

    pendingTiles.add(key);
    enqueueMove(eid, x, y, nx, ny, eventQueue);
    return;
  }
  // No valid move — idle
}

/** BFS pathfind one step toward target. */
function seekToward(
  eid: number,
  target: number,
  map: TileMap,
  world: object,
  eventQueue: VisualEventQueue,
  pendingTiles: Set<string>,
): void {
  const sx = Position.x[eid];
  const sy = Position.y[eid];
  const tx = Position.x[target];
  const ty = Position.y[target];

  const step = bfsNextStep(sx, sy, tx, ty, map, eid, world);
  if (step) {
    // If next step IS the target tile, attack instead of moving onto it
    if (step.x === tx && step.y === ty) {
      performAttack(eid, target, world, eventQueue);
      return;
    }
    // If next step is a closed door, open it and end turn
    if (isClosedDoor(map, step.x, step.y)) {
      openDoor(eid, step.x, step.y, map, eventQueue);
      return;
    }
    // Block if tile is occupied or already claimed this batch
    const key = `${step.x},${step.y}`;
    if (isTileOccupied(step.x, step.y, eid, world) || pendingTiles.has(key)) return;
    pendingTiles.add(key);
    enqueueMove(eid, sx, sy, step.x, step.y, eventQueue);
  }
  // else no path — idle
}

/** BFS from (sx,sy) to (tx,ty), return first step. */
function bfsNextStep(
  sx: number, sy: number,
  tx: number, ty: number,
  map: TileMap,
  eid: number,
  world: object,
): { x: number; y: number } | null {
  const maxRange = 20;
  const visited = new Set<number>();
  const parent = new Map<number, number>();

  const key = (x: number, y: number) => y * map.width + x;
  const startKey = key(sx, sy);
  const targetKey = key(tx, ty);

  visited.add(startKey);
  const queue: number[] = [startKey];

  while (queue.length > 0) {
    const cur = queue.shift()!;
    const cx = cur % map.width;
    const cy = (cur - cx) / map.width;

    if (cur === targetKey) {
      // Trace back to first step from start
      let step = cur;
      while (parent.get(step) !== startKey) {
        step = parent.get(step)!;
      }
      return { x: step % map.width, y: (step - step % map.width) / map.width };
    }

    for (const { dx, dy } of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!map.inBounds(nx, ny)) continue;
      const nk = key(nx, ny);
      if (visited.has(nk)) continue;

      // Distance check to limit BFS scope
      if (chebyshev(sx, sy, nx, ny) > maxRange) continue;

      // Allow walking to the target tile even if occupied.
      // Treat closed doors as traversable (AI will open them).
      const isTarget = (nx === tx && ny === ty);
      const isDoor = isClosedDoor(map, nx, ny);
      if (!isTarget && !isDoor && map.blocksMovement(nx, ny)) continue;
      if (!isTarget && !isDoor && isTileOccupied(nx, ny, eid, world)) continue;

      visited.add(nk);
      parent.set(nk, cur);
      queue.push(nk);
    }
  }

  return null;
}

/** Attack a target entity. */
function performAttack(
  attacker: number,
  target: number,
  world: object,
  eventQueue: VisualEventQueue,
): void {
  const damage = CombatStats.attackDamage[attacker] || 1;

  const hitEvent: VisualEvent = {
    type: 'hit_flash',
    entityId: target,
    data: { damage, attackerId: attacker },
  };

  eventQueue.push(hitEvent, () => {
    // Apply damage when animation completes
    Health.hp[target] -= damage;

    if (Health.hp[target] <= 0) {
      // Queue death event
      const deathEvent: VisualEvent = {
        type: 'death',
        entityId: target,
        data: {},
      };
      eventQueue.push(deathEvent);
    }
  });
}

/** Enqueue a move visual event with position commit. */
function enqueueMove(
  eid: number,
  fromX: number, fromY: number,
  toX: number, toY: number,
  eventQueue: VisualEventQueue,
): void {
  const moveEvent: VisualEvent = {
    type: 'move',
    entityId: eid,
    data: { fromX, fromY, toX, toY },
  };
  eventQueue.push(moveEvent, () => {
    Position.x[eid] = toX;
    Position.y[eid] = toY;
  });
}

/** Check if a tile has another living entity on it. */
function isTileOccupied(x: number, y: number, excludeEid: number, world: object): boolean {
  const entities = query(world, [Position, BlocksMovement]);
  for (const eid of entities) {
    if (eid === excludeEid) continue;
    if (hasComponent(world, eid, Dead)) continue;
    if (Position.x[eid] === x && Position.y[eid] === y) return true;
  }
  return false;
}

/** Chebyshev distance. */
function chebyshev(x1: number, y1: number, x2: number, y2: number): number {
  return Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
}

// ═══════════════════════════════════════════════════════════
// DEBUG — exported for sandbox AI overlay
// ═══════════════════════════════════════════════════════════

/** BFS full path from (sx,sy) to (tx,ty). Returns all tiles in path order (excluding start). */
export function bfsFullPath(
  sx: number, sy: number,
  tx: number, ty: number,
  map: TileMap,
  eid: number,
  world: object,
): { x: number; y: number }[] {
  const maxRange = 20;
  const visited = new Set<number>();
  const parent = new Map<number, number>();

  const key = (x: number, y: number) => y * map.width + x;
  const startKey = key(sx, sy);
  const targetKey = key(tx, ty);

  visited.add(startKey);
  const queue: number[] = [startKey];

  while (queue.length > 0) {
    const cur = queue.shift()!;
    const cx = cur % map.width;
    const cy = (cur - cx) / map.width;

    if (cur === targetKey) {
      // Trace back full path
      const path: { x: number; y: number }[] = [];
      let step = cur;
      while (step !== startKey) {
        path.push({ x: step % map.width, y: (step - step % map.width) / map.width });
        step = parent.get(step)!;
      }
      path.reverse();
      return path;
    }

    for (const { dx, dy } of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!map.inBounds(nx, ny)) continue;
      const nk = key(nx, ny);
      if (visited.has(nk)) continue;
      if (chebyshev(sx, sy, nx, ny) > maxRange) continue;

      const isTarget = (nx === tx && ny === ty);
      const isDoor = isClosedDoor(map, nx, ny);
      if (!isTarget && !isDoor && map.blocksMovement(nx, ny)) continue;
      if (!isTarget && !isDoor && isTileOccupied(nx, ny, eid, world)) continue;

      visited.add(nk);
      parent.set(nk, cur);
      queue.push(nk);
    }
  }

  return [];
}
