/**
 * Movement system.
 * Validates and processes movement for entities.
 * Produces visual events — does NOT directly update Position.
 * Position updates happen in the visual event's onCommit callback.
 *
 * Tile interactions (doors) are data-driven via the tile registry.
 */
import { Position } from '../components';
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
      const doorEvent: VisualEvent = {
        type: 'door_open',
        entityId: eid,
        data: { x: toX, y: toY },
      };
      eventQueue.push(doorEvent, () => {
        map.set(toX, toY, openTile.index);
      });
      return { moved: false, cost: DOOR_COST, openedDoor: true };
    }
  }

  // Check if tile blocks movement
  if (map.blocksMovement(toX, toY)) {
    return { moved: false, cost: 0, openedDoor: false };
  }

  // Valid move — enqueue visual event
  const moveEvent: VisualEvent = {
    type: 'move',
    entityId: eid,
    data: { fromX, fromY, toX, toY },
  };
  eventQueue.push(moveEvent, () => {
    // Commit position change when animation completes
    Position.x[eid] = toX;
    Position.y[eid] = toY;
  });

  return { moved: true, cost: MOVE_COST, openedDoor: false };
}
