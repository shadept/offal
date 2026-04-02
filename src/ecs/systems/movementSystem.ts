/**
 * Movement system.
 * Validates and processes movement for entities.
 * Produces visual events — does NOT directly update Position.
 * Position updates happen immediately; visual events are purely descriptive.
 *
 * Door interactions use entity-based doors with tile overlay projection.
 */
import { query, hasComponent } from 'bitecs';
import { Position, BlocksMovement, Dead, Door, Renderable } from '../components';
import { TileMap } from '../../map/TileMap';
import { SpriteIndex } from '../world';
import type { VisualEventQueue } from '../../visual/EventQueue';

/** Standard movement cost in time-energy units */
const MOVE_COST = 100;

/** Cost to open a door */
const DOOR_COST = 100;

export interface MoveResult {
  moved: boolean;
  cost: number;
  openedDoor: boolean;
}

/** Check if a tile has another living entity on it. */
export function isTileOccupied(x: number, y: number, excludeEid: number, world: object): boolean {
  return getBlockingEntity(x, y, excludeEid, world) >= 0;
}

/** Return the entity blocking a tile, or -1 if none. */
export function getBlockingEntity(x: number, y: number, excludeEid: number, world: object): number {
  const entities = query(world, [Position, BlocksMovement]);
  for (const eid of entities) {
    if (eid === excludeEid) continue;
    if (hasComponent(world, eid, Dead)) continue;
    if (Position.x[eid] === x && Position.y[eid] === y) return eid;
  }
  return -1;
}

/** Rebuild door overlay from current door entity state. */
export function syncDoorOverlays(map: TileMap, world: object): void {
  map.entityBlocksMovement.fill(0);
  map.entityBlocksLight.fill(0);
  for (const eid of query(world, [Position, Door])) {
    if (hasComponent(world, eid, Dead)) continue;
    if (Door.isOpen[eid] === 1) continue;
    const idx = map.idx(Position.x[eid], Position.y[eid]);
    map.entityBlocksMovement[idx] = 1;
    map.entityBlocksLight[idx] = 1;
  }
}

/** Find a closed door entity at (x, y), or -1 if none. */
export function getClosedDoorAt(x: number, y: number, world: object): number {
  const doors = query(world, [Position, Door]);
  for (const eid of doors) {
    if (hasComponent(world, eid, Dead)) continue;
    if (Position.x[eid] === x && Position.y[eid] === y && Door.isOpen[eid] === 0) {
      return eid;
    }
  }
  return -1;
}

/** Open a door entity: update component, overlay, and enqueue visual event. */
export function openDoorEntity(
  doorEid: number,
  openerEid: number,
  map: TileMap,
  eventQueue: VisualEventQueue,
): void {
  Door.isOpen[doorEid] = 1;
  Renderable.spriteIndex[doorEid] = SpriteIndex.DOOR_OPEN;
  const x = Position.x[doorEid];
  const y = Position.y[doorEid];
  const idx = map.idx(x, y);
  map.entityBlocksMovement[idx] = 0;
  map.entityBlocksLight[idx] = 0;
  eventQueue.push({
    type: 'door_open',
    entityId: doorEid,
    data: { x, y },
  });
}

/**
 * Try to move entity in direction (dx, dy).
 * Returns the result and enqueues visual events.
 */
export function tryMove(
  eid: number,
  dx: number,
  dy: number,
  map: TileMap,
  eventQueue: VisualEventQueue,
  world: object,
): MoveResult {
  const fromX = Position.x[eid];
  const fromY = Position.y[eid];
  const toX = fromX + dx;
  const toY = fromY + dy;

  // Wait action (no movement)
  if (dx === 0 && dy === 0) {
    return { moved: false, cost: MOVE_COST, openedDoor: false };
  }

  // Check bounds
  if (!map.inBounds(toX, toY)) {
    return { moved: false, cost: 0, openedDoor: false };
  }

  // Check if tile blocks movement (includes entity overlay — closed doors)
  if (map.blocksMovement(toX, toY)) {
    // Check if a closed door entity is causing the block — open it
    const doorEid = getClosedDoorAt(toX, toY, world);
    if (doorEid >= 0) {
      openDoorEntity(doorEid, eid, map, eventQueue);
      return { moved: false, cost: DOOR_COST, openedDoor: true };
    }
    return { moved: false, cost: 0, openedDoor: false };
  }

  // Check if tile is occupied by another entity
  if (isTileOccupied(toX, toY, eid, world)) {
    return { moved: false, cost: 0, openedDoor: false };
  }

  // Commit position immediately, then enqueue visual event
  Position.x[eid] = toX;
  Position.y[eid] = toY;
  eventQueue.push({
    type: 'move',
    entityId: eid,
    data: { fromX, fromY, toX, toY },
  });

  return { moved: true, cost: MOVE_COST, openedDoor: false };
}
