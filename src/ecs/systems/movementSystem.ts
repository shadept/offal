/**
 * Movement system.
 * Validates and processes movement for entities.
 * Produces visual events — does NOT directly update Position.
 * Position updates happen immediately; visual events are purely descriptive.
 *
 * Tile interactions (doors) are data-driven via the tile registry.
 */
import { query, hasComponent } from 'bitecs';
import { Position, BlocksMovement, Dead } from '../components';
import { TileMap } from '../../map/TileMap';
import { getRegistry } from '../../data/loader';
import type { VisualEvent } from '../../types';
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

  const targetIndex = map.get(toX, toY);
  const tileData = getRegistry().tilesByIndex.get(targetIndex);

  // Check for interactable tile with opensTo (e.g. closed door)
  if (tileData?.interactable && tileData.opensTo) {
    const openTile = getRegistry().tiles.get(tileData.opensTo);
    if (openTile) {
      map.set(toX, toY, openTile.index);
      eventQueue.push({
        type: 'door_open',
        entityId: eid,
        data: { x: toX, y: toY },
      });
      return { moved: false, cost: DOOR_COST, openedDoor: true };
    }
  }

  // Check if tile blocks movement
  if (map.blocksMovement(toX, toY)) {
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
