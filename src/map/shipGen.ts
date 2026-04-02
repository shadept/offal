/**
 * Ship Generator — graph-based ship layout generation.
 *
 * Pipeline:
 *   1. Graph:    Read ship class data → room nodes + adjacency edges
 *   2. Manifest: Size each room from function/size constraints
 *   3. Pack:     Iteratively place rooms compactly, route corridors
 *   4. Carve:    Write rooms/corridors/walls to tilemap
 *
 * Rooms are packed tight — connected rooms share walls where possible.
 * Corridors are emergent: only created where rooms can't be adjacent.
 */
import { TileMap } from './TileMap';
import { TileType } from '../types';
import type { ShipClassData, ShipRoomDef } from '../types';

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

export interface RoomNode {
  id: string;
  function: string;
  /** Interior dimensions (not including walls) */
  w: number;
  h: number;
  /** Placed position (top-left of interior, set during packing) */
  x: number;
  y: number;
  extremity: boolean;
}

export interface ShipGraph {
  rooms: RoomNode[];
  /** Adjacency edges as pairs of room IDs */
  edges: [string, string][];
}

export interface GeneratedShipResult {
  tileMap: TileMap;
  graph: ShipGraph;
  playerSpawn: { x: number; y: number };
  doors: { x: number; y: number }[];
  /** Room info for entity spawning / room functions */
  roomCenters: { id: string; function: string; x: number; y: number }[];
}

// ═══════════════════════════════════════════════════════════
// SEEDED RNG (same as dungeonGen)
// ═══════════════════════════════════════════════════════════

class SeededRNG {
  private s: number;
  readonly seed: string;

  constructor(seed?: string) {
    this.seed = seed ?? Math.random().toString(36).slice(2, 10);
    this.s = this.hashSeed(this.seed);
  }

  private hashSeed(str: string): number {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
    }
    return h >>> 0 || 1;
  }

  next(): number {
    this.s ^= this.s << 13;
    this.s ^= this.s >> 17;
    this.s ^= this.s << 5;
    return (this.s >>> 0) / 4294967296;
  }

  intRange(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}

// ═══════════════════════════════════════════════════════════
// SIZE CONSTRAINTS
// ═══════════════════════════════════════════════════════════

/** Interior dimensions (w, h) ranges by size category */
const SIZE_RANGES: Record<string, { minW: number; maxW: number; minH: number; maxH: number }> = {
  small:  { minW: 3, maxW: 4, minH: 3, maxH: 4 },
  medium: { minW: 4, maxW: 6, minH: 4, maxH: 6 },
  large:  { minW: 6, maxW: 8, minH: 6, maxH: 8 },
};

// ═══════════════════════════════════════════════════════════
// STEP 1 & 2: GRAPH + MANIFEST
// ═══════════════════════════════════════════════════════════

function buildGraph(shipClass: ShipClassData, rng: SeededRNG): ShipGraph {
  const rooms: RoomNode[] = [];

  for (const def of shipClass.rooms) {
    const range = SIZE_RANGES[def.size] ?? SIZE_RANGES.medium;
    const w = rng.intRange(range.minW, range.maxW);
    const h = rng.intRange(range.minH, range.maxH);
    rooms.push({
      id: def.function,
      function: def.function,
      w,
      h,
      x: 0,
      y: 0,
      extremity: def.extremity ?? false,
    });
  }

  return {
    rooms,
    edges: [...shipClass.connections],
  };
}

// ═══════════════════════════════════════════════════════════
// STEP 3: ITERATIVE PACKING
// ═══════════════════════════════════════════════════════════

/** Directions to try attaching a room to an existing room's wall */
const ATTACH_DIRS = [
  { dx: 1, dy: 0, label: 'east' },
  { dx: -1, dy: 0, label: 'west' },
  { dx: 0, dy: 1, label: 'south' },
  { dx: 0, dy: -1, label: 'north' },
] as const;

/** Check if two placed rooms overlap (including their walls) */
function roomsOverlap(a: RoomNode, b: RoomNode): boolean {
  // Include 1-tile wall border around each room
  const ax1 = a.x - 1, ay1 = a.y - 1, ax2 = a.x + a.w, ay2 = a.y + a.h;
  const bx1 = b.x - 1, by1 = b.y - 1, bx2 = b.x + b.w, by2 = b.y + b.h;
  return ax1 < bx2 && ax2 > bx1 && ay1 < by2 && ay2 > by1;
}

/** Check if a room overlaps any already-placed rooms (allowing shared walls
 *  between the room and its intended neighbor). */
function hasCollision(room: RoomNode, placed: RoomNode[], neighborId?: string): boolean {
  for (const p of placed) {
    if (p.id === neighborId) continue; // Allow overlap check to be lenient with neighbor
    if (roomsOverlap(room, p)) return true;
  }
  return false;
}

/** Try to attach room B adjacent to room A along a shared wall.
 *  Returns the position for B, or null if it doesn't fit. */
function tryAttach(
  a: RoomNode,
  b: RoomNode,
  dir: typeof ATTACH_DIRS[number],
  placed: RoomNode[],
  rng: SeededRNG,
): { x: number; y: number } | null {
  // Calculate where B goes when attached to A in this direction
  let bx: number, by: number;

  if (dir.dx === 1) {
    // B goes east of A: B.x = A.x + A.w + 1 (shared wall)
    bx = a.x + a.w + 1;
    by = a.y + rng.intRange(-1, Math.max(0, a.h - b.h + 1));
  } else if (dir.dx === -1) {
    // B goes west of A
    bx = a.x - b.w - 1;
    by = a.y + rng.intRange(-1, Math.max(0, a.h - b.h + 1));
  } else if (dir.dy === 1) {
    // B goes south of A
    bx = a.x + rng.intRange(-1, Math.max(0, a.w - b.w + 1));
    by = a.y + a.h + 1;
  } else {
    // B goes north of A
    bx = a.x + rng.intRange(-1, Math.max(0, a.w - b.w + 1));
    by = a.y - b.h - 1;
  }

  // Temporarily set B's position and check collisions
  const origX = b.x, origY = b.y;
  b.x = bx;
  b.y = by;
  const collides = hasCollision(b, placed, a.id);
  b.x = origX;
  b.y = origY;

  if (collides) return null;
  return { x: bx, y: by };
}

/** For elongated ships, prefer east/west attachment */
function getSortedDirs(shape: string, rng: SeededRNG): typeof ATTACH_DIRS[number][] {
  const dirs = [...ATTACH_DIRS];
  if (shape === 'elongated') {
    // Strongly prefer horizontal attachment
    return rng.shuffle([dirs[0], dirs[1]]).concat(rng.shuffle([dirs[2], dirs[3]]));
  }
  return rng.shuffle(dirs);
}

function packRooms(graph: ShipGraph, shape: string, rng: SeededRNG): void {
  const placed: RoomNode[] = [];
  const roomMap = new Map(graph.rooms.map(r => [r.id, r]));

  // Start with the first extremity room (cockpit), or first room
  const startRoom = graph.rooms.find(r => r.extremity) ?? graph.rooms[0];
  startRoom.x = 0;
  startRoom.y = 0;
  placed.push(startRoom);

  // BFS from start room along edges to determine placement order
  const visited = new Set<string>([startRoom.id]);
  const queue: string[] = [startRoom.id];
  const order: { roomId: string; neighborId: string }[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const [a, b] of graph.edges) {
      const neighbor = a === current ? b : b === current ? a : null;
      if (!neighbor || visited.has(neighbor)) continue;
      visited.add(neighbor);
      queue.push(neighbor);
      order.push({ roomId: neighbor, neighborId: current });
    }
  }

  // Place each room by attaching it to its neighbor
  for (const { roomId, neighborId } of order) {
    const room = roomMap.get(roomId)!;
    const neighbor = roomMap.get(neighborId)!;
    const dirs = getSortedDirs(shape, rng);

    let attached = false;
    // Try multiple times with slight randomization
    for (let attempt = 0; attempt < 12; attempt++) {
      for (const dir of dirs) {
        const pos = tryAttach(neighbor, room, dir, placed, rng);
        if (pos) {
          room.x = pos.x;
          room.y = pos.y;
          placed.push(room);
          attached = true;
          break;
        }
      }
      if (attached) break;
    }

    if (!attached) {
      // Fallback: place with a gap (corridor will be needed)
      const fallbackDir = dirs[0];
      room.x = neighbor.x + fallbackDir.dx * (neighbor.w + 3);
      room.y = neighbor.y + fallbackDir.dy * (neighbor.h + 3);
      placed.push(room);
    }
  }
}

// ═══════════════════════════════════════════════════════════
// STEP 4: CARVE TO TILEMAP
// ═══════════════════════════════════════════════════════════

/** Find where two rooms share a wall and can have a door. */
function findDoorPosition(a: RoomNode, b: RoomNode, rng: SeededRNG): { x: number; y: number } | null {
  // Check if rooms are adjacent horizontally (shared vertical wall)
  if (a.x + a.w + 1 === b.x || b.x + b.w + 1 === a.x) {
    // Shared vertical wall — find overlapping y range
    const wallX = a.x + a.w + 1 === b.x ? a.x + a.w : b.x + b.w;
    const overlapMin = Math.max(a.y, b.y);
    const overlapMax = Math.min(a.y + a.h - 1, b.y + b.h - 1);
    if (overlapMin <= overlapMax) {
      const doorY = rng.intRange(overlapMin, overlapMax);
      return { x: wallX, y: doorY };
    }
  }

  // Check if rooms are adjacent vertically (shared horizontal wall)
  if (a.y + a.h + 1 === b.y || b.y + b.h + 1 === a.y) {
    const wallY = a.y + a.h + 1 === b.y ? a.y + a.h : b.y + b.h;
    const overlapMin = Math.max(a.x, b.x);
    const overlapMax = Math.min(a.x + a.w - 1, b.x + b.w - 1);
    if (overlapMin <= overlapMax) {
      const doorX = rng.intRange(overlapMin, overlapMax);
      return { x: doorX, y: wallY };
    }
  }

  return null;
}

/** Carve an L-shaped corridor between two rooms that aren't adjacent. */
function carveCorridor(
  a: RoomNode,
  b: RoomNode,
  tileMap: TileMap,
  rng: SeededRNG,
): { x: number; y: number }[] {
  const ax = a.x + Math.floor(a.w / 2);
  const ay = a.y + Math.floor(a.h / 2);
  const bx = b.x + Math.floor(b.w / 2);
  const by = b.y + Math.floor(b.h / 2);

  const points: { x: number; y: number }[] = [];

  // L-shaped: go horizontal then vertical (or vice versa)
  if (rng.chance(0.5)) {
    for (let x = Math.min(ax, bx); x <= Math.max(ax, bx); x++) {
      points.push({ x, y: ay });
    }
    for (let y = Math.min(ay, by); y <= Math.max(ay, by); y++) {
      points.push({ x: bx, y });
    }
  } else {
    for (let y = Math.min(ay, by); y <= Math.max(ay, by); y++) {
      points.push({ x: ax, y });
    }
    for (let x = Math.min(ax, bx); x <= Math.max(ax, bx); x++) {
      points.push({ x, y: by });
    }
  }

  // Carve corridor floor and surrounding walls
  for (const { x, y } of points) {
    if (!tileMap.inBounds(x, y)) continue;
    tileMap.set(x, y, TileType.FLOOR);
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

  return points;
}

function carveShipToTileMap(
  graph: ShipGraph,
  tileMap: TileMap,
  offsetX: number,
  offsetY: number,
  rng: SeededRNG,
): { x: number; y: number }[] {
  const roomMap = new Map(graph.rooms.map(r => [r.id, r]));
  const doors: { x: number; y: number }[] = [];

  // Carve each room: walls + interior floor
  for (const room of graph.rooms) {
    const rx = room.x + offsetX;
    const ry = room.y + offsetY;

    // Walls (1-tile border around interior)
    for (let y = ry - 1; y <= ry + room.h; y++) {
      for (let x = rx - 1; x <= rx + room.w; x++) {
        if (!tileMap.inBounds(x, y)) continue;
        const isInterior = x >= rx && x < rx + room.w && y >= ry && y < ry + room.h;
        if (isInterior) {
          tileMap.set(x, y, TileType.FLOOR);
        } else if (tileMap.get(x, y) === TileType.VOID) {
          tileMap.set(x, y, TileType.WALL);
        }
      }
    }
  }

  // Process edges: place doors at shared walls, or carve corridors
  for (const [aId, bId] of graph.edges) {
    const a = roomMap.get(aId)!;
    const b = roomMap.get(bId)!;

    // Offset room positions for door calculation
    const aOff = { ...a, x: a.x + offsetX, y: a.y + offsetY };
    const bOff = { ...b, x: b.x + offsetX, y: b.y + offsetY };

    const doorPos = findDoorPosition(aOff, bOff, rng);
    if (doorPos) {
      // Rooms are adjacent — place door in shared wall
      tileMap.set(doorPos.x, doorPos.y, TileType.FLOOR);
      doors.push(doorPos);
    } else {
      // Rooms aren't adjacent — carve corridor
      const corridorPoints = carveCorridor(aOff, bOff, tileMap, rng);
      // Place doors where corridor enters each room
      if (corridorPoints.length > 0) {
        doors.push(corridorPoints[0]);
        doors.push(corridorPoints[corridorPoints.length - 1]);
      }
    }
  }

  return doors;
}

// ═══════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════

/** Last generated graph — available for debug overlay rendering */
export let lastGeneratedGraph: ShipGraph | null = null;

export function generateShipFromClass(
  shipClass: ShipClassData,
  seed?: string,
): GeneratedShipResult {
  const rng = new SeededRNG(seed);

  // Step 1-2: Build graph with sized rooms
  const graph = buildGraph(shipClass, rng);

  // Step 3: Pack rooms
  packRooms(graph, shipClass.shape, rng);
  lastGeneratedGraph = graph;

  // Compute bounding box of all rooms (with wall borders)
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const room of graph.rooms) {
    minX = Math.min(minX, room.x - 1);
    minY = Math.min(minY, room.y - 1);
    maxX = Math.max(maxX, room.x + room.w);
    maxY = Math.max(maxY, room.y + room.h);
  }

  // Add border padding around the ship
  const border = 3;
  const mapW = (maxX - minX + 1) + border * 2;
  const mapH = (maxY - minY + 1) + border * 2;
  const offsetX = border - minX;
  const offsetY = border - minY;

  // Step 4: Create tilemap and carve
  const tileMap = new TileMap(mapW, mapH);
  const doors = carveShipToTileMap(graph, tileMap, offsetX, offsetY, rng);

  // Compute room centers for spawning / debug overlay
  const roomCenters = graph.rooms.map(r => ({
    id: r.id,
    function: r.function,
    x: r.x + offsetX + Math.floor(r.w / 2),
    y: r.y + offsetY + Math.floor(r.h / 2),
  }));

  // Player spawns in the first room (cockpit)
  const playerSpawn = { ...roomCenters[0] };

  return {
    tileMap,
    graph,
    playerSpawn,
    doors,
    roomCenters,
  };
}
