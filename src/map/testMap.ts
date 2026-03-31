/**
 * Hand-crafted test map for Phase 1.
 * A small ship section: bridge, corridor, cargo bay, with doors.
 */
import { TileMap } from './TileMap';
import { TileType } from '../types';

const MAP_WIDTH = 40;
const MAP_HEIGHT = 30;

/** Player spawn position */
export const PLAYER_SPAWN = { x: 6, y: 5 };

export function createTestMap(): TileMap {
  const map = new TileMap(MAP_WIDTH, MAP_HEIGHT);

  // Fill with void
  map.tiles.fill(TileType.VOID);

  // Helper: fill rectangle with a tile type
  function fillRect(x: number, y: number, w: number, h: number, type: TileType) {
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        map.set(x + dx, y + dy, type);
      }
    }
  }

  // Helper: draw rectangle border (walls) with floor interior
  function room(x: number, y: number, w: number, h: number) {
    fillRect(x, y, w, h, TileType.WALL);
    fillRect(x + 1, y + 1, w - 2, h - 2, TileType.FLOOR);
  }

  // ── Room 1: Bridge (top-left) ───────────────────────────
  room(2, 2, 12, 8);

  // ── Room 2: Corridor (horizontal, connecting bridge to cargo) ──
  fillRect(14, 4, 8, 1, TileType.WALL);
  fillRect(14, 5, 8, 2, TileType.FLOOR);
  fillRect(14, 7, 8, 1, TileType.WALL);

  // ── Room 3: Cargo Bay (right side) ──────────────────────
  room(22, 1, 14, 12);

  // ── Room 4: Lab (bottom-left) ───────────────────────────
  room(2, 12, 10, 8);

  // ── Room 5: Corridor (vertical, bridge to lab) ──────────
  fillRect(4, 10, 1, 2, TileType.WALL);
  fillRect(5, 10, 2, 2, TileType.FLOOR);
  fillRect(7, 10, 1, 2, TileType.WALL);

  // ── Room 6: Engineering (bottom-center) ─────────────────
  room(12, 14, 12, 10);

  // ── Room 7: Corridor (lab to engineering) ───────────────
  fillRect(12, 16, 1, 2, TileType.FLOOR); // punch through wall

  // ── Room 8: Storage (bottom-right) ──────────────────────
  room(26, 14, 10, 10);

  // ── Room 9: Corridor (cargo to storage, vertical) ───────
  fillRect(30, 13, 1, 1, TileType.WALL);
  fillRect(31, 13, 2, 1, TileType.FLOOR);
  fillRect(33, 13, 1, 1, TileType.WALL);

  // ── Room 10: Small utility closet ───────────────────────
  room(15, 6, 6, 6);

  // ── Doors ───────────────────────────────────────────────

  // Bridge → corridor
  map.set(13, 5, TileType.DOOR_CLOSED);
  map.set(13, 6, TileType.DOOR_CLOSED);

  // Corridor → cargo bay
  map.set(22, 5, TileType.DOOR_CLOSED);
  map.set(22, 6, TileType.DOOR_CLOSED);

  // Bridge → vertical corridor to lab
  map.set(5, 9, TileType.DOOR_CLOSED);
  map.set(6, 9, TileType.DOOR_CLOSED);

  // Lab → engineering corridor
  map.set(11, 16, TileType.DOOR_CLOSED);
  map.set(11, 17, TileType.DOOR_CLOSED);

  // Engineering → storage
  map.set(24, 18, TileType.DOOR_CLOSED);
  map.set(24, 19, TileType.DOOR_CLOSED);

  // Cargo → storage vertical corridor
  map.set(31, 12, TileType.DOOR_CLOSED);
  map.set(32, 12, TileType.DOOR_CLOSED);

  // Utility closet doors
  map.set(15, 8, TileType.DOOR_CLOSED);

  // ── Some interior detail in cargo bay ────────────────────
  // Crate-like wall segments
  map.set(25, 4, TileType.WALL);
  map.set(25, 5, TileType.WALL);
  map.set(28, 7, TileType.WALL);
  map.set(29, 7, TileType.WALL);
  map.set(32, 4, TileType.WALL);
  map.set(32, 5, TileType.WALL);

  return map;
}
