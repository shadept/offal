/**
 * Procedural ship dungeon generator — Phase 5.
 *
 * Uses BSP (Binary Space Partitioning) to split a rectangle into rooms,
 * then connects sibling rooms with corridors. Rooms are assigned functions
 * from the data-driven room pool. Population and loot placed per room function.
 *
 * All randomness uses SeededRNG for reproducible generation.
 */
import { TileMap } from './TileMap';
import { TileType } from '../types';
import { getRegistry } from '../data/loader';
import { SeededRNG } from '../utils/rng';
import type { RoomData } from '../types';

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RoomInfo {
  /** Bounding rectangle of the room (floor area, not including walls) */
  rect: Rect;
  /** Assigned room function from data/rooms.json5 */
  function: RoomData | null;
  /** Center tile of the room */
  center: { x: number; y: number };
}

interface BSPNode {
  bounds: Rect;
  left: BSPNode | null;
  right: BSPNode | null;
  room: Rect | null;
}

export interface GeneratedShip {
  tileMap: TileMap;
  rooms: RoomInfo[];
  playerSpawn: { x: number; y: number };
  spawns: { species: string; x: number; y: number }[];
  seed: string;
}

export interface DungeonGenConfig {
  /** Total map width in tiles (including void border) */
  width?: number;
  /** Total map height in tiles */
  height?: number;
  /** Minimum room dimension (interior, not counting walls) */
  minRoomSize?: number;
  /** Maximum room dimension */
  maxRoomSize?: number;
  /** Minimum BSP leaf size before stopping splits */
  minLeafSize?: number;
  /** Corridor width (1 = single tile) */
  corridorWidth?: number;
  /** Void border around the ship */
  border?: number;
}

const DEFAULTS: Required<DungeonGenConfig> = {
  width: 60,
  height: 45,
  minRoomSize: 4,
  maxRoomSize: 10,
  minLeafSize: 8,
  corridorWidth: 1,
  border: 2,
};

// ═══════════════════════════════════════════════════════════
// BSP TREE
// ═══════════════════════════════════════════════════════════

function splitBSP(bounds: Rect, rng: SeededRNG, minLeaf: number): BSPNode {
  const node: BSPNode = { bounds, left: null, right: null, room: null };

  // Stop splitting if too small
  if (bounds.w < minLeaf * 2 && bounds.h < minLeaf * 2) return node;

  // Choose split direction — prefer splitting the longer axis
  let splitH: boolean;
  if (bounds.w < minLeaf * 2) splitH = true;
  else if (bounds.h < minLeaf * 2) splitH = false;
  else splitH = rng.chance(bounds.h >= bounds.w ? 0.65 : 0.35);

  const maxSize = (splitH ? bounds.h : bounds.w) - minLeaf;
  if (maxSize < minLeaf) return node; // can't split

  const split = rng.int(minLeaf, maxSize);

  if (splitH) {
    // Horizontal split — top and bottom
    node.left = splitBSP({ x: bounds.x, y: bounds.y, w: bounds.w, h: split }, rng, minLeaf);
    node.right = splitBSP({ x: bounds.x, y: bounds.y + split, w: bounds.w, h: bounds.h - split }, rng, minLeaf);
  } else {
    // Vertical split — left and right
    node.left = splitBSP({ x: bounds.x, y: bounds.y, w: split, h: bounds.h }, rng, minLeaf);
    node.right = splitBSP({ x: bounds.x + split, y: bounds.y, w: bounds.w - split, h: bounds.h }, rng, minLeaf);
  }

  return node;
}

/** Place a room inside each leaf node of the BSP tree. */
function placeRooms(node: BSPNode, rng: SeededRNG, minRoom: number, maxRoom: number): void {
  if (node.left || node.right) {
    if (node.left) placeRooms(node.left, rng, minRoom, maxRoom);
    if (node.right) placeRooms(node.right, rng, minRoom, maxRoom);
    return;
  }

  // Leaf node — generate a room within bounds
  const maxW = Math.min(maxRoom, node.bounds.w - 2); // leave 1-tile wall margin
  const maxH = Math.min(maxRoom, node.bounds.h - 2);
  if (maxW < minRoom || maxH < minRoom) return;

  const roomW = rng.int(minRoom, maxW);
  const roomH = rng.int(minRoom, maxH);
  const roomX = rng.int(node.bounds.x + 1, node.bounds.x + node.bounds.w - roomW - 1);
  const roomY = rng.int(node.bounds.y + 1, node.bounds.y + node.bounds.h - roomH - 1);

  node.room = { x: roomX, y: roomY, w: roomW, h: roomH };
}

/** Collect all rooms from leaf nodes. */
function collectRooms(node: BSPNode): Rect[] {
  const rooms: Rect[] = [];
  if (node.room) {
    rooms.push(node.room);
  }
  if (node.left) rooms.push(...collectRooms(node.left));
  if (node.right) rooms.push(...collectRooms(node.right));
  return rooms;
}

/** Get a representative room from a subtree (any leaf room). */
function getRoom(node: BSPNode): Rect | null {
  if (node.room) return node.room;
  if (node.left) {
    const r = getRoom(node.left);
    if (r) return r;
  }
  if (node.right) {
    const r = getRoom(node.right);
    if (r) return r;
  }
  return null;
}

// ═══════════════════════════════════════════════════════════
// CORRIDORS
// ═══════════════════════════════════════════════════════════

interface Corridor {
  points: { x: number; y: number }[];
}

/** Connect sibling rooms in the BSP tree with L-shaped corridors. */
function connectSiblings(node: BSPNode, rng: SeededRNG): Corridor[] {
  const corridors: Corridor[] = [];

  if (node.left && node.right) {
    // Connect a room from the left subtree to one from the right
    const roomL = getRoom(node.left);
    const roomR = getRoom(node.right);

    if (roomL && roomR) {
      const cx1 = Math.floor(roomL.x + roomL.w / 2);
      const cy1 = Math.floor(roomL.y + roomL.h / 2);
      const cx2 = Math.floor(roomR.x + roomR.w / 2);
      const cy2 = Math.floor(roomR.y + roomR.h / 2);

      corridors.push(createLCorridor(cx1, cy1, cx2, cy2, rng));
    }

    corridors.push(...connectSiblings(node.left, rng));
    corridors.push(...connectSiblings(node.right, rng));
  }

  return corridors;
}

/** Create an L-shaped corridor between two points. */
function createLCorridor(
  x1: number, y1: number,
  x2: number, y2: number,
  rng: SeededRNG,
): Corridor {
  const points: { x: number; y: number }[] = [];

  // Randomly choose horizontal-first or vertical-first
  if (rng.chance(0.5)) {
    // Horizontal then vertical
    for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) {
      points.push({ x, y: y1 });
    }
    for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) {
      points.push({ x: x2, y });
    }
  } else {
    // Vertical then horizontal
    for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) {
      points.push({ x: x1, y });
    }
    for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) {
      points.push({ x, y: y2 });
    }
  }

  return { points };
}

// ═══════════════════════════════════════════════════════════
// TILE CARVING
// ═══════════════════════════════════════════════════════════

/** Carve a room into the tile map: floor interior, wall border. */
function carveRoom(tileMap: TileMap, room: Rect): void {
  // Carve walls around the room (1 tile border)
  for (let y = room.y - 1; y <= room.y + room.h; y++) {
    for (let x = room.x - 1; x <= room.x + room.w; x++) {
      if (!tileMap.inBounds(x, y)) continue;
      if (x === room.x - 1 || x === room.x + room.w ||
          y === room.y - 1 || y === room.y + room.h) {
        // Only place wall if currently void (don't overwrite existing floor)
        if (tileMap.get(x, y) === TileType.VOID) {
          tileMap.set(x, y, TileType.WALL);
        }
      }
    }
  }

  // Carve floor interior
  for (let y = room.y; y < room.y + room.h; y++) {
    for (let x = room.x; x < room.x + room.w; x++) {
      if (tileMap.inBounds(x, y)) {
        tileMap.set(x, y, TileType.FLOOR);
      }
    }
  }
}

/** Carve a corridor into the tile map with walls on sides. */
function carveCorridor(tileMap: TileMap, corridor: Corridor): void {
  for (const { x, y } of corridor.points) {
    if (!tileMap.inBounds(x, y)) continue;

    // Carve floor
    tileMap.set(x, y, TileType.FLOOR);

    // Place walls around corridor tiles where void exists
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (tileMap.inBounds(nx, ny) && tileMap.get(nx, ny) === TileType.VOID) {
          tileMap.set(nx, ny, TileType.WALL);
        }
      }
    }
  }
}

/** Place doors where corridors meet room walls. */
function placeDoors(tileMap: TileMap, corridors: Corridor[], rng: SeededRNG): void {
  for (const corridor of corridors) {
    for (const { x, y } of corridor.points) {
      if (!tileMap.inBounds(x, y)) continue;
      if (tileMap.get(x, y) !== TileType.FLOOR) continue;

      // Check if this floor tile is a doorway candidate:
      // walls on two opposite sides, floor on two opposite sides
      const n = tileMap.get(x, y - 1);
      const s = tileMap.get(x, y + 1);
      const e = tileMap.get(x + 1, y);
      const w = tileMap.get(x - 1, y);

      const isVertDoor = (n === TileType.WALL && s === TileType.WALL &&
                          e === TileType.FLOOR && w === TileType.FLOOR);
      const isHorzDoor = (e === TileType.WALL && w === TileType.WALL &&
                          n === TileType.FLOOR && s === TileType.FLOOR);

      if ((isVertDoor || isHorzDoor) && rng.chance(0.7)) {
        tileMap.set(x, y, TileType.DOOR_CLOSED);
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════
// ROOM FUNCTION ASSIGNMENT
// ═══════════════════════════════════════════════════════════

function assignRoomFunctions(rooms: Rect[], rng: SeededRNG): RoomInfo[] {
  const registry = getRegistry();
  const roomDefs = Array.from(registry.rooms.values());

  if (roomDefs.length === 0) {
    return rooms.map(r => ({
      rect: r,
      function: null,
      center: { x: Math.floor(r.x + r.w / 2), y: Math.floor(r.y + r.h / 2) },
    }));
  }

  // Track how many times each function has been assigned
  const counts = new Map<string, number>();
  for (const def of roomDefs) counts.set(def.id, 0);

  const result: RoomInfo[] = [];

  for (const room of rooms) {
    // Filter to functions that haven't hit maxCount
    const available = roomDefs.filter(d => (counts.get(d.id) ?? 0) < d.maxCount);
    const pool = available.length > 0 ? available : roomDefs;

    const weights = pool.map(d => d.weight);
    const chosen = rng.weightedPick(pool, weights);
    counts.set(chosen.id, (counts.get(chosen.id) ?? 0) + 1);

    result.push({
      rect: room,
      function: chosen,
      center: { x: Math.floor(room.x + room.w / 2), y: Math.floor(room.y + room.h / 2) },
    });
  }

  return result;
}

// ═══════════════════════════════════════════════════════════
// POPULATION
// ═══════════════════════════════════════════════════════════

function populateRooms(
  rooms: RoomInfo[],
  tileMap: TileMap,
  rng: SeededRNG,
  playerSpawn: { x: number; y: number },
): { species: string; x: number; y: number }[] {
  const spawns: { species: string; x: number; y: number }[] = [];

  for (const room of rooms) {
    if (!room.function) continue;
    const pop = room.function.population;
    if (!pop || pop.length === 0) continue;

    for (const entry of pop) {
      const count = rng.int(entry.min, entry.max);
      for (let i = 0; i < count; i++) {
        // Find a random walkable tile in the room that isn't the player spawn
        const pos = findOpenTile(room.rect, tileMap, rng, playerSpawn, spawns);
        if (pos) {
          spawns.push({ species: entry.species, x: pos.x, y: pos.y });
        }
      }
    }
  }

  return spawns;
}

function findOpenTile(
  room: Rect,
  tileMap: TileMap,
  rng: SeededRNG,
  playerSpawn: { x: number; y: number },
  existingSpawns: { x: number; y: number }[],
): { x: number; y: number } | null {
  // Try random positions, fall back to scan
  for (let attempt = 0; attempt < 20; attempt++) {
    const x = rng.int(room.x, room.x + room.w - 1);
    const y = rng.int(room.y, room.y + room.h - 1);

    if (tileMap.get(x, y) !== TileType.FLOOR) continue;
    if (x === playerSpawn.x && y === playerSpawn.y) continue;
    if (existingSpawns.some(s => s.x === x && s.y === y)) continue;
    return { x, y };
  }
  return null;
}

// ═══════════════════════════════════════════════════════════
// INFRASTRUCTURE TILES
// ═══════════════════════════════════════════════════════════

/** Place decorative infrastructure markers on wall-adjacent floor tiles.
 *  For now these are visual hints — actual pipe/vent tile types come later.
 *  We place a few wall tiles in room interiors to suggest consoles/crates. */
function placeInfrastructure(rooms: RoomInfo[], tileMap: TileMap, rng: SeededRNG): void {
  for (const room of rooms) {
    if (!room.function) continue;
    const infra = room.function.infrastructure;
    if (!infra || infra.length === 0) continue;

    // For each infrastructure type, place 0-2 wall tiles inside the room
    // to represent consoles, crates, etc. (visual obstacles)
    for (const type of infra) {
      if (type === 'crate' || type === 'console') {
        const count = rng.int(0, 2);
        for (let i = 0; i < count; i++) {
          // Place against a wall (1 tile in from room edge)
          const edge = rng.int(0, 3);
          let x: number, y: number;
          switch (edge) {
            case 0: // top
              x = rng.int(room.rect.x, room.rect.x + room.rect.w - 1);
              y = room.rect.y;
              break;
            case 1: // bottom
              x = rng.int(room.rect.x, room.rect.x + room.rect.w - 1);
              y = room.rect.y + room.rect.h - 1;
              break;
            case 2: // left
              x = room.rect.x;
              y = rng.int(room.rect.y, room.rect.y + room.rect.h - 1);
              break;
            default: // right
              x = room.rect.x + room.rect.w - 1;
              y = rng.int(room.rect.y, room.rect.y + room.rect.h - 1);
              break;
          }
          // Don't block center or create isolated areas
          if (x === room.center.x && y === room.center.y) continue;
          if (tileMap.inBounds(x, y) && tileMap.get(x, y) === TileType.FLOOR) {
            tileMap.set(x, y, TileType.WALL);
          }
        }
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════
// ARRIVAL STATE
// ═══════════════════════════════════════════════════════════

export interface ArrivalEvent {
  type: 'fire' | 'gas_leak';
  x: number;
  y: number;
}

function generateArrivalEvents(rooms: RoomInfo[], tileMap: TileMap, rng: SeededRNG): ArrivalEvent[] {
  const events: ArrivalEvent[] = [];

  for (const room of rooms) {
    if (!room.function) continue;
    const possible = room.function.arrivalEvents;
    if (!possible || possible.length === 0) continue;

    // Small chance per room to have a pre-existing event
    if (!rng.chance(0.15)) continue;

    const eventType = rng.pick(possible) as 'fire' | 'gas_leak';
    const x = rng.int(room.rect.x, room.rect.x + room.rect.w - 1);
    const y = rng.int(room.rect.y, room.rect.y + room.rect.h - 1);

    if (tileMap.get(x, y) === TileType.FLOOR) {
      events.push({ type: eventType, x, y });
    }
  }

  return events;
}

// ═══════════════════════════════════════════════════════════
// MAIN GENERATOR
// ═══════════════════════════════════════════════════════════

export function generateShip(seed?: string, config?: DungeonGenConfig): GeneratedShip & { arrivalEvents: ArrivalEvent[] } {
  const rng = new SeededRNG(seed);
  const cfg = { ...DEFAULTS, ...config };

  // Create tile map filled with void
  const tileMap = new TileMap(cfg.width, cfg.height);
  // Already all zeros (VOID)

  // BSP area (excluding border)
  const bspBounds: Rect = {
    x: cfg.border,
    y: cfg.border,
    w: cfg.width - cfg.border * 2,
    h: cfg.height - cfg.border * 2,
  };

  // Build BSP tree
  const root = splitBSP(bspBounds, rng, cfg.minLeafSize);

  // Place rooms in leaf nodes
  placeRooms(root, rng, cfg.minRoomSize, cfg.maxRoomSize);

  // Collect all rooms
  const roomRects = collectRooms(root);
  if (roomRects.length === 0) {
    // Fallback: place a single room in the center
    const fallback: Rect = {
      x: Math.floor(cfg.width / 4),
      y: Math.floor(cfg.height / 4),
      w: Math.floor(cfg.width / 2),
      h: Math.floor(cfg.height / 2),
    };
    roomRects.push(fallback);
  }

  // Connect sibling rooms with corridors
  const corridors = connectSiblings(root, rng);

  // Carve rooms into tile map
  for (const room of roomRects) {
    carveRoom(tileMap, room);
  }

  // Carve corridors
  for (const corridor of corridors) {
    carveCorridor(tileMap, corridor);
  }

  // Place doors at corridor-room boundaries
  placeDoors(tileMap, corridors, rng);

  // Assign room functions
  const rooms = assignRoomFunctions(roomRects, rng);

  // Place infrastructure
  placeInfrastructure(rooms, tileMap, rng);

  // Choose player spawn: center of first room
  const playerSpawn = { ...rooms[0].center };

  // Populate rooms with entities
  const spawns = populateRooms(rooms, tileMap, rng, playerSpawn);

  // Generate arrival events
  const arrivalEvents = generateArrivalEvents(rooms, tileMap, rng);

  return {
    tileMap,
    rooms,
    playerSpawn,
    spawns,
    seed: rng.seed,
    arrivalEvents,
  };
}
