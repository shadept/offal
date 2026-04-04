/**
 * Ship Generator — graph-based procedural ship generation.
 *
 * Implements a seed-growth algorithm with 5 architecture layouts:
 *   SPINE     — central corridor spine with symmetric branching (Human)
 *   RADIAL    — dense circular packing toward center (Alien)
 *   SEGMENTED — distinct body clusters linked by corridors (Insectoid)
 *   SCAFFOLD  — chaotic corridor maze with rooms on edges (Industrial)
 *   FLOATING  — disjointed islands connected by teleporters (Monolithic)
 *
 * Pipeline:
 *   1. Deck Manifest  — roll room counts from ship type data
 *   2. Seed Placement — bridge at origin
 *   3. Layout Growth  — architecture-specific room attachment
 *   4. Engine Placement — stern-biased engine modules
 *   5. Post-Processing — weapon LOS mutation, cross-connections
 *   6. Tile Carving   — rooms/corridors/hull → TileMap
 *
 * All content is data-driven from:
 *   data/ship-types.json5    — deck manifests per ship type
 *   data/architectures.json5 — layout algorithm params
 *   data/room-sizes.json5    — room dimensions per type + size class
 */
import { TileMap } from './TileMap';
import { TileType } from '../types';
import { SeededRNG } from '../utils/rng';
import { getRegistry } from '../data/loader';
import type { ArchitectureData, ArchitectureLayout, ShipTypeData, RoomSizeData } from '../types';

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

export interface RoomNode {
  id: number;
  /** Room type: 'bridge', 'corridor', 'cargo', 'weapons', etc. */
  type: string;
  /** Display name: 'Command', 'Access', 'Cargo Bay', etc. */
  name: string;
  /** Top-left x of interior floor area */
  x: number;
  /** Top-left y of interior floor area */
  y: number;
  /** Interior width in tiles */
  w: number;
  /** Interior height in tiles */
  h: number;
  /** Facing direction */
  dir: string;
}

export interface ShipEdge {
  source: number;
  target: number;
  type: 'physical' | 'teleport';
}

export interface ShipGraph {
  nodes: RoomNode[];
  edges: ShipEdge[];
  shipType: string;
  architecture: string;
}

/** A pair of teleporter pads — stepping on one warps to the other. */
export interface TeleporterPair {
  a: { x: number; y: number };
  b: { x: number; y: number };
}

export interface GeneratedShipResult {
  tileMap: TileMap;
  graph: ShipGraph;
  playerSpawn: { x: number; y: number };
  doors: { x: number; y: number }[];
  teleporters: TeleporterPair[];
  /** Room info for entity spawning / room functions */
  roomCenters: { id: number; type: string; name: string; x: number; y: number }[];
}

// ═══════════════════════════════════════════════════════════
// ROOM DISPLAY NAMES
// ═══════════════════════════════════════════════════════════

const ROOM_DISPLAY_NAMES: Record<string, string> = {
  bridge: 'Command',
  corridor: 'Access',
  cargo: 'Cargo Bay',
  crew_quarters: 'Quarters',
  cantina: 'Mess Hall',
  lab: 'Science Lab',
  armory: 'Armory',
  cells: 'Cell Block',
  refinery: 'Refinery',
  drill: 'Drill Array',
  weapons: 'Turret',
  turret: 'Turret',
  missile_bay: 'Missile Silo',
  torpedo_tube: 'Torpedo Bay',
  energy_emitter: 'Emitter Array',
  bio_artillery: 'Artillery Sac',
  shields: 'Shield Gen',
  security: 'Security',
  medical: 'Medbay',
  sensors: 'Sensors',
  storage: 'Storage',
  hydroponics: 'Hydroponics',
  hangar: 'Hangar Bay',
  engine: 'Drive',
  engineering: 'Engineering',
};

function displayName(type: string): string {
  return ROOM_DISPLAY_NAMES[type] ?? type;
}

// ═══════════════════════════════════════════════════════════
// ROOM CONFIG (size from data)
// ═══════════════════════════════════════════════════════════

interface RoomConfig {
  w: number;
  h: number;
  type: string;
  name: string;
}

function getRoomConfig(type: string, sizeClass: string, rng: SeededRNG): RoomConfig {
  const registry = getRegistry();
  const sizeData = registry.roomSizes.get(type);
  const base = sizeData ?? { w: registry.defaultRoomSize.w, h: registry.defaultRoomSize.h } as Pick<RoomSizeData, 'w' | 'h'>;

  const scaleW = (min: number, max: number): number => {
    switch (sizeClass) {
      case 'tiny': return Math.max(2, rng.int(min - 2, max - 2));
      case 'large': return rng.int(min + 1, max + 1);
      case 'massive': return rng.int(min + 2, max + 4);
      default: return rng.int(min, max);
    }
  };
  const scaleH = scaleW; // same scaling logic

  return {
    w: scaleW(base.w[0], base.w[1]),
    h: scaleH(base.h[0], base.h[1]),
    type,
    name: displayName(type),
  };
}

// ═══════════════════════════════════════════════════════════
// DECK MANIFEST (from data)
// ═══════════════════════════════════════════════════════════

interface DeckManifest {
  rooms: string[];    // non-corridor room types to place
  corridors: number;  // corridor count
  engines: number;    // engine count
}

function getDeckManifest(shipType: ShipTypeData, rng: SeededRNG): DeckManifest {
  const rooms: string[] = [];
  let corridors = 0;

  for (const [type, [min, max]] of Object.entries(shipType.deck)) {
    const count = rng.int(min, max);
    for (let i = 0; i < count; i++) {
      if (type === 'corridor') corridors++;
      else rooms.push(type);
    }
  }

  rng.shuffle(rooms);
  const engines = rng.int(shipType.engines[0], shipType.engines[1]);

  return { rooms, corridors, engines };
}

// ═══════════════════════════════════════════════════════════
// CORE: COLLISION DETECTION
// ═══════════════════════════════════════════════════════════

/** Check if placing a room at (x, y) with size (w, h) collides with any
 *  existing node. Includes 1-tile wall border in the check.
 *  Optionally skip a specific node (the attachment parent). */
function checkCollision(
  nodes: RoomNode[],
  x: number, y: number, w: number, h: number,
  skipId?: number,
): boolean {
  for (const n of nodes) {
    if (n.id === skipId) continue;
    // AABB including 1-tile wall borders
    if (
      x - 1 < n.x + n.w + 1 &&
      x + w + 1 > n.x - 1 &&
      y - 1 < n.y + n.h + 1 &&
      y + h + 1 > n.y - 1
    ) return true;
  }
  return false;
}

/** Expanded collision check for FLOATING placement — the buffer zone
 *  is added only to the NEW room (not existing rooms), ensuring modules
 *  maintain a minimum gap without creating an impossibly large exclusion. */
function checkCollisionExpanded(
  nodes: RoomNode[],
  x: number, y: number, w: number, h: number,
  buffer: number,
): boolean {
  for (const n of nodes) {
    if (
      x - buffer < n.x + n.w &&
      x + w + buffer > n.x &&
      y - buffer < n.y + n.h &&
      y + h + buffer > n.y
    ) return true;
  }
  return false;
}

// ═══════════════════════════════════════════════════════════
// CORE: ATTACHMENT
// ═══════════════════════════════════════════════════════════

const DIR_OFFSETS: Record<string, { dx: number; dy: number }> = {
  N: { dx: 0, dy: -1 },
  S: { dx: 0, dy: 1 },
  E: { dx: 1, dy: 0 },
  W: { dx: -1, dy: 0 },
};

/** Try to attach a new room flush against a parent room's edge.
 *  Returns the new node or null if blocked. */
function tryAttach(
  nodes: RoomNode[],
  edges: ShipEdge[],
  parent: RoomNode,
  config: RoomConfig,
  direction: string,
  rng: SeededRNG,
): RoomNode | null {
  const { w, h, type, name } = config;
  let nx: number, ny: number;

  // Place new room so it shares a wall with parent
  // The 1-tile gap between interiors = shared wall
  if (direction === 'N') {
    nx = parent.x + Math.floor((parent.w - w) / 2);
    ny = parent.y - h - 1;
  } else if (direction === 'S') {
    nx = parent.x + Math.floor((parent.w - w) / 2);
    ny = parent.y + parent.h + 1;
  } else if (direction === 'E') {
    nx = parent.x + parent.w + 1;
    ny = parent.y + Math.floor((parent.h - h) / 2);
  } else { // W
    nx = parent.x - w - 1;
    ny = parent.y + Math.floor((parent.h - h) / 2);
  }

  if (!checkCollision(nodes, nx, ny, w, h, parent.id)) {
    const newNode: RoomNode = {
      id: nodes.length,
      x: nx, y: ny, w, h,
      type, name, dir: direction,
    };
    nodes.push(newNode);
    edges.push({ source: parent.id, target: newNode.id, type: 'physical' });
    return newNode;
  }
  return null;
}

/** Try to place rooms symmetrically East and West of parent. */
function tryAttachSymmetric(
  nodes: RoomNode[],
  edges: ShipEdge[],
  parent: RoomNode,
  config: RoomConfig,
  rng: SeededRNG,
): { E: RoomNode | null; W: RoomNode | null } {
  const eNode = tryAttach(nodes, edges, parent, config, 'E', rng);
  const wNode = tryAttach(nodes, edges, parent, config, 'W', rng);
  return { E: eNode, W: wNode };
}

/** Place a room floating at a distance from parent (FLOATING architecture).
 *  Rooms are placed diagonally to create a scattered lattice.
 *  Connected by teleport edge instead of physical. */
function tryPlaceFloating(
  nodes: RoomNode[],
  edges: ShipEdge[],
  parent: RoomNode,
  config: RoomConfig,
  distance: number,
  rng: SeededRNG,
): RoomNode | null {
  const { w, h, type, name } = config;
  const dirs = rng.shuffle([
    { dx: 0.8, dy: -0.8, dir: 'N' },
    { dx: -0.8, dy: -0.8, dir: 'N' },
    { dx: 0.8, dy: 0.8, dir: 'S' },
    { dx: -0.8, dy: 0.8, dir: 'S' },
  ]);

  const parentCx = parent.x + parent.w / 2;
  const parentCy = parent.y + parent.h / 2;

  for (const d of dirs) {
    const cx = parentCx + d.dx * (parent.w / 2 + w / 2 + distance);
    const cy = parentCy + d.dy * (parent.h / 2 + h / 2 + distance);
    const nx = Math.round(cx - w / 2);
    const ny = Math.round(cy - h / 2);

    if (!checkCollisionExpanded(nodes, nx, ny, w, h, Math.floor(distance * 0.8))) {
      const newNode: RoomNode = {
        id: nodes.length,
        x: nx, y: ny, w, h,
        type, name, dir: d.dir,
      };
      nodes.push(newNode);
      edges.push({ source: parent.id, target: newNode.id, type: 'teleport' });
      return newNode;
    }
  }
  return null;
}

// ═══════════════════════════════════════════════════════════
// EXTERIOR DETECTION (for weapon LOS)
// ═══════════════════════════════════════════════════════════

function getExteriorDirs(nodes: RoomNode[], n: RoomNode): string[] {
  const ncx = n.x + n.w / 2;
  const ncy = n.y + n.h / 2;
  const nHalfW = n.w / 2;
  const nHalfH = n.h / 2;

  const freeDirs: string[] = [];

  const blockedN = nodes.some(o => {
    if (o.id === n.id) return false;
    const oCy = o.y + o.h / 2;
    if (oCy >= ncy) return false; // must be north (lower y)
    // Check x overlap
    const oHalfW = o.w / 2;
    const oCx = o.x + o.w / 2;
    return Math.abs(ncx - oCx) < nHalfW + oHalfW - 0.1;
  });

  const blockedS = nodes.some(o => {
    if (o.id === n.id) return false;
    const oCy = o.y + o.h / 2;
    if (oCy <= ncy) return false;
    const oHalfW = o.w / 2;
    const oCx = o.x + o.w / 2;
    return Math.abs(ncx - oCx) < nHalfW + oHalfW - 0.1;
  });

  const blockedE = nodes.some(o => {
    if (o.id === n.id) return false;
    const oCx = o.x + o.w / 2;
    if (oCx <= ncx) return false;
    const oHalfH = o.h / 2;
    const oCy = o.y + o.h / 2;
    return Math.abs(ncy - oCy) < nHalfH + oHalfH - 0.1;
  });

  const blockedW = nodes.some(o => {
    if (o.id === n.id) return false;
    const oCx = o.x + o.w / 2;
    if (oCx >= ncx) return false;
    const oHalfH = o.h / 2;
    const oCy = o.y + o.h / 2;
    return Math.abs(ncy - oCy) < nHalfH + oHalfH - 0.1;
  });

  if (!blockedN) freeDirs.push('N');
  if (!blockedS) freeDirs.push('S');
  if (!blockedE) freeDirs.push('E');
  if (!blockedW) freeDirs.push('W');

  return freeDirs;
}

// ═══════════════════════════════════════════════════════════
// LAYOUT ALGORITHMS
// ═══════════════════════════════════════════════════════════

function layoutSpine(
  nodes: RoomNode[], edges: ShipEdge[],
  manifest: DeckManifest, sizeClass: string,
  layout: ArchitectureLayout, rng: SeededRNG,
): void {
  const bridge = nodes[0];
  const attachDirs = layout.attachDirs ?? ['E', 'W', 'N', 'S'];
  const symmetryBias = layout.symmetryBias ?? 0.3;

  // Phase 1: Build corridor spine straight south
  let curr = bridge;
  const spineNodes: RoomNode[] = [curr];
  for (let i = 0; i < manifest.corridors; i++) {
    const s = tryAttach(nodes, edges, curr, getRoomConfig('corridor', sizeClass, rng), 'S', rng);
    if (s) { spineNodes.push(s); curr = s; }
  }

  // Phase 2: Attach rooms to spine
  const attachPoints = [...spineNodes];
  const rooms = [...manifest.rooms];
  while (rooms.length > 0) {
    const typeToPlace = rooms.pop()!;
    const config = getRoomConfig(typeToPlace, sizeClass, rng);
    let placed = false;

    for (const sNode of rng.shuffle([...attachPoints])) {
      if (rng.chance(symmetryBias)) {
        const attached = tryAttachSymmetric(nodes, edges, sNode, config, rng);
        if (attached.E || attached.W) {
          if (attached.E) attachPoints.push(attached.E);
          if (attached.W) attachPoints.push(attached.W);
          placed = true;
          break;
        }
      } else {
        const dir = rng.pick(attachDirs);
        const n = tryAttach(nodes, edges, sNode, config, dir, rng);
        if (n) { attachPoints.push(n); placed = true; break; }
      }
    }

    // Fallback: try every node
    if (!placed) {
      for (const n of rng.shuffle([...nodes])) {
        const dir = rng.pick(attachDirs);
        if (tryAttach(nodes, edges, n, config, dir, rng)) break;
      }
    }
  }
}

function layoutRadial(
  nodes: RoomNode[], edges: ShipEdge[],
  manifest: DeckManifest, sizeClass: string,
  layout: ArchitectureLayout, rng: SeededRNG,
): void {
  const attachDirs = layout.attachDirs ?? ['N', 'S', 'E', 'W'];

  // Merge rooms + corridors into one deck
  const deck = [...manifest.rooms];
  for (let i = 0; i < manifest.corridors; i++) deck.push('corridor');
  rng.shuffle(deck);

  while (deck.length > 0) {
    const typeToPlace = deck.pop()!;
    const roomConfig = getRoomConfig(typeToPlace, sizeClass, rng);

    let bestParent: RoomNode | null = null;
    let bestDir = '';
    let bestPos: { x: number; y: number } | null = null;
    let minRadius = Infinity;

    for (const parent of rng.shuffle([...nodes])) {
      for (const dir of rng.shuffle([...attachDirs])) {
        // Calculate prospective position
        const { w, h } = roomConfig;
        let nx: number, ny: number;
        if (dir === 'N') { nx = parent.x + Math.floor((parent.w - w) / 2); ny = parent.y - h - 1; }
        else if (dir === 'S') { nx = parent.x + Math.floor((parent.w - w) / 2); ny = parent.y + parent.h + 1; }
        else if (dir === 'E') { nx = parent.x + parent.w + 1; ny = parent.y + Math.floor((parent.h - h) / 2); }
        else { nx = parent.x - w - 1; ny = parent.y + Math.floor((parent.h - h) / 2); }

        const cx = nx + w / 2;
        const cy = ny + h / 2;
        const dist = Math.sqrt(cx * cx + cy * cy);

        if (dist < minRadius && !checkCollision(nodes, nx, ny, w, h, parent.id)) {
          minRadius = dist;
          bestParent = parent;
          bestDir = dir;
          bestPos = { x: nx, y: ny };
        }
      }
    }

    if (bestParent && bestPos) {
      const newNode: RoomNode = {
        id: nodes.length,
        x: bestPos.x, y: bestPos.y,
        w: roomConfig.w, h: roomConfig.h,
        type: roomConfig.type, name: roomConfig.name,
        dir: bestDir,
      };
      nodes.push(newNode);
      edges.push({ source: bestParent.id, target: newNode.id, type: 'physical' });
    }
  }
}

function layoutSegmented(
  nodes: RoomNode[], edges: ShipEdge[],
  manifest: DeckManifest, sizeClass: string,
  layout: ArchitectureLayout, rng: SeededRNG,
): void {
  const attachDirs = layout.attachDirs ?? ['N', 'S', 'E', 'W'];
  const lateralBias = layout.lateralBias ?? 0.3;

  const deck = [...manifest.rooms];
  for (let i = 0; i < manifest.corridors; i++) deck.push('corridor');
  rng.shuffle(deck);

  const segments = deck.length > 15 ? 3 : (deck.length > 6 ? 2 : 1);
  let currentHub = nodes[0]; // bridge

  for (let seg = 0; seg < segments; seg++) {
    const chunkCount = Math.ceil(deck.length / (segments - seg));
    const roomsForSegment = deck.splice(0, chunkCount);
    const segmentNodes: RoomNode[] = [currentHub];

    while (roomsForSegment.length > 0) {
      const rConfig = getRoomConfig(roomsForSegment.pop()!, sizeClass, rng);
      let placed = false;

      for (const sNode of rng.shuffle([...segmentNodes])) {
        for (const dir of rng.shuffle([...attachDirs])) {
          // Bias against N/S to force lateral growth
          if ((dir === 'N' || dir === 'S') && !rng.chance(lateralBias)) continue;
          const n = tryAttach(nodes, edges, sNode, rConfig, dir, rng);
          if (n) { segmentNodes.push(n); placed = true; break; }
        }
        if (placed) break;
      }

      // Fallback: try all nodes, all dirs
      if (!placed) {
        for (const sNode of segmentNodes) {
          for (const dir of rng.shuffle([...attachDirs])) {
            const n = tryAttach(nodes, edges, sNode, rConfig, dir, rng);
            if (n) { segmentNodes.push(n); placed = true; break; }
          }
          if (placed) break;
        }
      }
    }

    // Link segments with a long corridor + hub
    if (seg < segments - 1) {
      const southMost = [...segmentNodes].sort((a, b) => (b.y + b.h) - (a.y + a.h))[0];
      const linkConfig: RoomConfig = { w: 2, h: rng.int(6, 12), type: 'corridor', name: 'Segment Link' };
      const link = tryAttach(nodes, edges, southMost, linkConfig, 'S', rng);
      if (link) {
        const hubConfig: RoomConfig = { w: rng.int(4, 6), h: rng.int(4, 6), type: 'corridor', name: 'Hub' };
        const nextHub = tryAttach(nodes, edges, link, hubConfig, 'S', rng);
        currentHub = nextHub ?? link;
      }
    }
  }
}

function layoutScaffold(
  nodes: RoomNode[], edges: ShipEdge[],
  manifest: DeckManifest, sizeClass: string,
  layout: ArchitectureLayout, rng: SeededRNG,
): void {
  const attachDirs = layout.attachDirs ?? ['N', 'S', 'E', 'W'];
  const scaffoldDirs = layout.scaffoldDirs ?? ['N', 'S', 'E', 'W', 'S', 'E', 'W'];
  const [extraMin, extraMax] = layout.scaffoldExtra ?? [5, 12];

  // Phase 1: Build corridor scaffold
  const corridorCount = manifest.corridors + rng.int(extraMin, extraMax);
  const scaffoldNodes: RoomNode[] = [nodes[0]]; // start from bridge

  for (let i = 0; i < corridorCount; i++) {
    const parent = rng.pick(scaffoldNodes);
    const dir = rng.pick(scaffoldDirs);
    const c = tryAttach(nodes, edges, parent, getRoomConfig('corridor', sizeClass, rng), dir, rng);
    if (c) scaffoldNodes.push(c);
  }

  // Phase 2: Attach functional rooms to scaffold edges
  const nonCorridors = [...manifest.rooms];
  while (nonCorridors.length > 0) {
    const typeToPlace = nonCorridors.pop()!;
    const rConfig = getRoomConfig(typeToPlace, sizeClass, rng);

    for (const parent of rng.shuffle([...nodes])) {
      const dir = rng.pick(attachDirs);
      if (tryAttach(nodes, edges, parent, rConfig, dir, rng)) break;
    }
  }
}

function layoutFloating(
  nodes: RoomNode[], edges: ShipEdge[],
  manifest: DeckManifest, sizeClass: string,
  layout: ArchitectureLayout, rng: SeededRNG,
): void {
  const [fMin, fMax] = layout.floatDist ?? [3, 7];

  const deck = [...manifest.rooms];
  rng.shuffle(deck);

  while (deck.length > 0) {
    const typeToPlace = deck.pop()!;
    const roomConfig = getRoomConfig(typeToPlace, sizeClass, rng);

    for (const parent of rng.shuffle([...nodes])) {
      const n = tryPlaceFloating(nodes, edges, parent, roomConfig, rng.int(fMin, fMax), rng);
      if (n) break;
    }
  }
}

// ═══════════════════════════════════════════════════════════
// ENGINE PLACEMENT
// ═══════════════════════════════════════════════════════════

function placeEngines(
  nodes: RoomNode[], edges: ShipEdge[],
  engineCount: number, sizeClass: string,
  arch: ArchitectureData, rng: SeededRNG,
): void {
  const layout = arch.layout;

  // Sort nodes by southernmost edge (highest y + h), exclude engines/weapons
  const southern = [...nodes]
    .filter(n => !EXTERIOR_ROOM_TYPES.has(n.type))
    .sort((a, b) => (b.y + b.h) - (a.y + a.h));

  if (southern.length === 0) return;
  let enginesPlaced = 0;

  for (const n of southern) {
    if (enginesPlaced >= engineCount) break;

    const engineConfig = getRoomConfig('engine', sizeClass, rng);
    let e: RoomNode | null = null;

    if (layout.type === 'FLOATING') {
      const [eMin, eMax] = layout.engineFloatDist ?? [3, 5];
      e = tryPlaceFloating(nodes, edges, n, engineConfig, rng.int(eMin, eMax), rng);
    } else {
      e = tryAttach(nodes, edges, n, engineConfig, 'S', rng);
    }

    if (e) {
      enginesPlaced++;
      // SPINE: try symmetric engine placement
      if (layout.type === 'SPINE' && n.type === 'corridor' && enginesPlaced < engineCount) {
        const sym = tryAttachSymmetric(nodes, edges, n, getRoomConfig('engine', sizeClass, rng), rng);
        if (sym.E) enginesPlaced++;
        if (sym.W) enginesPlaced++;
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════
// POST-PROCESSING
// ═══════════════════════════════════════════════════════════

/** Mutate weapon rooms based on line-of-sight to exterior. */
function mutateWeapons(
  nodes: RoomNode[],
  arch: ArchitectureData,
  sizeClass: string,
  rng: SeededRNG,
): void {
  for (const n of nodes) {
    if (n.type !== 'weapons') continue;

    const freeDirs = getExteriorDirs(nodes, n);
    if (freeDirs.length > 0) {
      // Exterior weapon — face outward
      n.dir = rng.pick(freeDirs);
      n.type = arch.weaponExterior;
    } else {
      // Interior weapon
      n.type = arch.weaponInterior;
    }
    n.name = displayName(n.type);
  }
}

/** Add cross-connections between spatially adjacent rooms that don't
 *  already share an edge, creating loops for better navigation. */
function addCrossConnections(
  nodes: RoomNode[], edges: ShipEdge[],
  crossProb: number, rng: SeededRNG,
): void {
  if (crossProb <= 0) return;

  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const n1 = nodes[i];
      const n2 = nodes[j];

      if (EXTERIOR_ROOM_TYPES.has(n1.type) || EXTERIOR_ROOM_TYPES.has(n2.type)) continue;

      // Check if edge already exists
      const exists = edges.some(e =>
        (e.source === n1.id && e.target === n2.id) ||
        (e.source === n2.id && e.target === n1.id));
      if (exists) continue;

      // Check if rooms share a wall (adjacent)
      const shareVertWall =
        (n1.x + n1.w + 1 === n2.x || n2.x + n2.w + 1 === n1.x) &&
        n1.y < n2.y + n2.h && n1.y + n1.h > n2.y;

      const shareHorizWall =
        (n1.y + n1.h + 1 === n2.y || n2.y + n2.h + 1 === n1.y) &&
        n1.x < n2.x + n2.w && n1.x + n1.w > n2.x;

      if ((shareVertWall || shareHorizWall) && rng.chance(crossProb)) {
        edges.push({ source: n1.id, target: n2.id, type: 'physical' });
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════
// GRAPH GENERATION (orchestrator)
// ═══════════════════════════════════════════════════════════

function generateShipGraph(
  shipType: ShipTypeData,
  arch: ArchitectureData,
  rng: SeededRNG,
): ShipGraph {
  const nodes: RoomNode[] = [];
  const edges: ShipEdge[] = [];

  const manifest = getDeckManifest(shipType, rng);
  const sizeClass = shipType.sizeClass;

  // Seed: bridge at origin
  const bridgeConfig = getRoomConfig('bridge', sizeClass, rng);
  const bridge: RoomNode = {
    id: 0,
    x: -Math.floor(bridgeConfig.w / 2),
    y: -Math.floor(bridgeConfig.h / 2),
    w: bridgeConfig.w,
    h: bridgeConfig.h,
    type: 'bridge',
    name: 'Command',
    dir: 'N',
  };
  nodes.push(bridge);

  // Layout growth
  const layout = arch.layout;
  switch (layout.type) {
    case 'SPINE':
      layoutSpine(nodes, edges, manifest, sizeClass, layout, rng);
      break;
    case 'RADIAL':
      layoutRadial(nodes, edges, manifest, sizeClass, layout, rng);
      break;
    case 'SEGMENTED':
      layoutSegmented(nodes, edges, manifest, sizeClass, layout, rng);
      break;
    case 'SCAFFOLD':
      layoutScaffold(nodes, edges, manifest, sizeClass, layout, rng);
      break;
    case 'FLOATING':
      layoutFloating(nodes, edges, manifest, sizeClass, layout, rng);
      break;
  }

  // Engine placement
  placeEngines(nodes, edges, manifest.engines, sizeClass, arch, rng);

  // Post-processing: weapon mutation
  mutateWeapons(nodes, arch, sizeClass, rng);

  // Post-processing: cross-connections
  addCrossConnections(nodes, edges, layout.crossProb, rng);

  return { nodes, edges, shipType: shipType.id, architecture: arch.id };
}

// ═══════════════════════════════════════════════════════════
// TILE CARVING
// ═══════════════════════════════════════════════════════════

/** Find where two rooms share a wall and can have a door. */
function findDoorPosition(a: RoomNode, b: RoomNode, rng: SeededRNG): { x: number; y: number } | null {
  // Shared vertical wall (rooms side by side)
  if (a.x + a.w + 1 === b.x || b.x + b.w + 1 === a.x) {
    const wallX = a.x + a.w + 1 === b.x ? a.x + a.w : b.x + b.w;
    const overlapMin = Math.max(a.y, b.y);
    const overlapMax = Math.min(a.y + a.h - 1, b.y + b.h - 1);
    if (overlapMin <= overlapMax) {
      return { x: wallX, y: rng.int(overlapMin, overlapMax) };
    }
  }

  // Shared horizontal wall (rooms above/below)
  if (a.y + a.h + 1 === b.y || b.y + b.h + 1 === a.y) {
    const wallY = a.y + a.h + 1 === b.y ? a.y + a.h : b.y + b.h;
    const overlapMin = Math.max(a.x, b.x);
    const overlapMax = Math.min(a.x + a.w - 1, b.x + b.w - 1);
    if (overlapMin <= overlapMax) {
      return { x: rng.int(overlapMin, overlapMax), y: wallY };
    }
  }

  return null;
}

/** Carve an L-shaped corridor between two rooms that aren't adjacent. */
function carveCorridor(
  a: RoomNode, b: RoomNode,
  tileMap: TileMap, rng: SeededRNG,
): { x: number; y: number }[] {
  const ax = a.x + Math.floor(a.w / 2);
  const ay = a.y + Math.floor(a.h / 2);
  const bx = b.x + Math.floor(b.w / 2);
  const by = b.y + Math.floor(b.h / 2);

  const points: { x: number; y: number }[] = [];

  if (rng.chance(0.5)) {
    for (let x = Math.min(ax, bx); x <= Math.max(ax, bx); x++) points.push({ x, y: ay });
    for (let y = Math.min(ay, by); y <= Math.max(ay, by); y++) points.push({ x: bx, y });
  } else {
    for (let y = Math.min(ay, by); y <= Math.max(ay, by); y++) points.push({ x: ax, y });
    for (let x = Math.min(ax, bx); x <= Math.max(ax, bx); x++) points.push({ x, y: by });
  }

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

/** Room types excluded from hull wrapping (engines, weapons face exterior). */
const EXTERIOR_ROOM_TYPES = new Set([
  'engine', 'weapons', 'turret', 'missile_bay',
  'torpedo_tube', 'energy_emitter', 'bio_artillery',
]);

/** Test if a point is inside a hull shape (normalized coordinates). */
function isInsideHullShape(
  shape: string, dx: number, dy: number, hw: number, hh: number,
): boolean {
  const nx = dx / hw;
  const ny = dy / hh;
  switch (shape) {
    case 'capsule':
    case 'ellipse':
      return nx * nx + ny * ny <= 1;
    case 'diamond':
      return Math.abs(nx) + Math.abs(ny) <= 1;
    case 'standard':
    case 'grid':
    default:
      return true; // rectangular, all tiles within bounds are inside
  }
}

/**
 * Fill hull around each room using the architecture's hull shape and padding.
 * Each non-exterior room gets a shaped hull bubble. The bubbles overlap to
 * form the ship's continuous hull contour.
 */
function fillPerRoomHulls(
  nodes: RoomNode[], offsetX: number, offsetY: number,
  tileMap: TileMap, arch: ArchitectureData,
): void {
  const hullCfg = arch.hull ?? { shape: 'standard' as const, pad: 2 };
  const pad = hullCfg.pad;
  const shape = hullCfg.shape;

  for (const node of nodes) {
    if (EXTERIOR_ROOM_TYPES.has(node.type)) continue;

    // Room center in tile-space (interior center + offset)
    const cx = node.x + offsetX + node.w / 2;
    const cy = node.y + offsetY + node.h / 2;
    // Half-extents: interior half + 1 (wall border) + hull padding
    const hw = node.w / 2 + 1 + pad;
    const hh = node.h / 2 + 1 + pad;

    const minTX = Math.floor(cx - hw);
    const maxTX = Math.ceil(cx + hw);
    const minTY = Math.floor(cy - hh);
    const maxTY = Math.ceil(cy + hh);

    for (let y = minTY; y <= maxTY; y++) {
      for (let x = minTX; x <= maxTX; x++) {
        if (!tileMap.inBounds(x, y)) continue;
        if (tileMap.get(x, y) !== TileType.VOID) continue;

        const dx = x - cx;
        const dy = y - cy;

        if (isInsideHullShape(shape, dx, dy, hw, hh)) {
          tileMap.set(x, y, TileType.WALL);
        }
      }
    }
  }
}

/**
 * Smoothing pass: fill VOID tiles that have 2+ cardinal WALL neighbors.
 * Closes narrow gaps between hull bubbles along corridors.
 */
function smoothHullGaps(tileMap: TileMap, passes: number): void {
  const { width, height } = tileMap;
  for (let pass = 0; pass < passes; pass++) {
    const snapshot = new Uint8Array(tileMap.tiles);
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        if (snapshot[idx] !== TileType.VOID) continue;

        // Don't fill tiles adjacent to floor — avoids blocking doors and corridors
        const n = snapshot[(y - 1) * width + x];
        const s = snapshot[(y + 1) * width + x];
        const w = snapshot[y * width + (x - 1)];
        const e = snapshot[y * width + (x + 1)];
        if (n === TileType.FLOOR || s === TileType.FLOOR ||
            w === TileType.FLOOR || e === TileType.FLOOR) continue;

        let wallNeighbors = 0;
        if (n === TileType.WALL) wallNeighbors++;
        if (s === TileType.WALL) wallNeighbors++;
        if (w === TileType.WALL) wallNeighbors++;
        if (e === TileType.WALL) wallNeighbors++;

        if (wallNeighbors >= 2) {
          tileMap.set(x, y, TileType.WALL);
        }
      }
    }
  }
}

/** Pick the floor tile inside a room that is closest to a target point. */
function pickTeleporterTile(
  room: RoomNode, targetX: number, targetY: number,
  tileMap: TileMap, _rng: SeededRNG,
): { x: number; y: number } {
  let bestX = room.x + Math.floor(room.w / 2);
  let bestY = room.y + Math.floor(room.h / 2);
  let bestDist = Infinity;

  for (let y = room.y; y < room.y + room.h; y++) {
    for (let x = room.x; x < room.x + room.w; x++) {
      if (tileMap.get(x, y) !== TileType.FLOOR) continue;
      const dist = (x - targetX) * (x - targetX) + (y - targetY) * (y - targetY);
      if (dist < bestDist) {
        bestDist = dist;
        bestX = x;
        bestY = y;
      }
    }
  }

  return { x: bestX, y: bestY };
}

/** Carve the ship graph onto a TileMap. Returns door + teleporter positions. */
function carveShipToTileMap(
  graph: ShipGraph, tileMap: TileMap,
  offsetX: number, offsetY: number, rng: SeededRNG,
  arch: ArchitectureData,
): { doors: { x: number; y: number }[]; teleporters: TeleporterPair[] } {
  const nodeMap = new Map(graph.nodes.map(n => [n.id, n]));
  const doors: { x: number; y: number }[] = [];
  const teleporters: TeleporterPair[] = [];

  // Carve each room: wall border + floor interior
  for (const node of graph.nodes) {
    const rx = node.x + offsetX;
    const ry = node.y + offsetY;

    for (let y = ry - 1; y <= ry + node.h; y++) {
      for (let x = rx - 1; x <= rx + node.w; x++) {
        if (!tileMap.inBounds(x, y)) continue;
        const isInterior = x >= rx && x < rx + node.w && y >= ry && y < ry + node.h;
        if (isInterior) {
          tileMap.set(x, y, TileType.FLOOR);
        } else if (tileMap.get(x, y) === TileType.VOID) {
          tileMap.set(x, y, TileType.WALL);
        }
      }
    }
  }

  // Process edges
  for (const edge of graph.edges) {
    const a = nodeMap.get(edge.source);
    const b = nodeMap.get(edge.target);
    if (!a || !b) continue;

    if (edge.type === 'teleport') {
      // Place teleporter pads — one in each room, facing the other
      const aCx = a.x + Math.floor(a.w / 2) + offsetX;
      const aCy = a.y + Math.floor(a.h / 2) + offsetY;
      const bCx = b.x + Math.floor(b.w / 2) + offsetX;
      const bCy = b.y + Math.floor(b.h / 2) + offsetY;

      const aOff = { ...a, x: a.x + offsetX, y: a.y + offsetY };
      const bOff = { ...b, x: b.x + offsetX, y: b.y + offsetY };

      const padA = pickTeleporterTile(aOff, bCx, bCy, tileMap, rng);
      const padB = pickTeleporterTile(bOff, aCx, aCy, tileMap, rng);
      teleporters.push({ a: padA, b: padB });
      continue;
    }

    // Physical edge — door or corridor
    const aOff: RoomNode = { ...a, x: a.x + offsetX, y: a.y + offsetY };
    const bOff: RoomNode = { ...b, x: b.x + offsetX, y: b.y + offsetY };

    const doorPos = findDoorPosition(aOff, bOff, rng);
    if (doorPos) {
      tileMap.set(doorPos.x, doorPos.y, TileType.FLOOR);
      doors.push(doorPos);
    } else {
      // Non-adjacent — carve corridor
      const corridorPts = carveCorridor(aOff, bOff, tileMap, rng);
      if (corridorPts.length > 0) {
        doors.push(corridorPts[0]);
        doors.push(corridorPts[corridorPts.length - 1]);
      }
    }
  }

  // Per-room hull generation — shaped hull bubbles around each room
  fillPerRoomHulls(graph.nodes, offsetX, offsetY, tileMap, arch);

  // Smoothing: close narrow gaps between hull bubbles along corridors
  // Skip for floating architectures (modules are intentionally disconnected)
  if (arch.layout.type !== 'FLOATING') {
    smoothHullGaps(tileMap, 2);
  }

  return { doors, teleporters };
}

// ═══════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════

/** Last generated graph — available for debug overlay rendering */
export let lastGeneratedGraph: ShipGraph | null = null;

export interface ShipGenConfig {
  shipType: string;
  architecture: string;
}

export function generateShipFromConfig(
  config: ShipGenConfig,
  seed?: string,
): GeneratedShipResult {
  const rng = new SeededRNG(seed);
  const registry = getRegistry();

  const shipType = registry.shipTypes.get(config.shipType);
  if (!shipType) throw new Error(`Unknown ship type: "${config.shipType}"`);
  const arch = registry.architectures.get(config.architecture);
  if (!arch) throw new Error(`Unknown architecture: "${config.architecture}"`);

  // Generate ship graph
  const graph = generateShipGraph(shipType, arch, rng);
  lastGeneratedGraph = graph;

  // Compute bounding box (with wall borders)
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const node of graph.nodes) {
    minX = Math.min(minX, node.x - 1);
    minY = Math.min(minY, node.y - 1);
    maxX = Math.max(maxX, node.x + node.w);
    maxY = Math.max(maxY, node.y + node.h);
  }

  // Border must accommodate hull padding + extra breathing room
  const hullPad = arch.hull?.pad ?? 2;
  const border = Math.ceil(hullPad) + 3;
  const mapW = (maxX - minX + 1) + border * 2;
  const mapH = (maxY - minY + 1) + border * 2;
  const offsetX = border - minX;
  const offsetY = border - minY;

  // Carve to tilemap
  const tileMap = new TileMap(mapW, mapH);
  const { doors, teleporters } = carveShipToTileMap(graph, tileMap, offsetX, offsetY, rng, arch);

  // Room centers (tilemap coords)
  const roomCenters = graph.nodes.map(n => ({
    id: n.id,
    type: n.type,
    name: n.name,
    x: n.x + offsetX + Math.floor(n.w / 2),
    y: n.y + offsetY + Math.floor(n.h / 2),
  }));

  // Player spawns in the bridge (first node)
  const playerSpawn = { x: roomCenters[0].x, y: roomCenters[0].y };

  return { tileMap, graph, playerSpawn, doors, teleporters, roomCenters };
}

/** Backward-compatible wrapper — generates from ShipClassData.
 *  Falls back to default config if the ship class doesn't map to new data. */
export function generateShipFromClass(
  _shipClass: import('../types').ShipClassData,
  seed?: string,
): GeneratedShipResult {
  // Default to scout + human architecture for legacy compatibility
  return generateShipFromConfig({ shipType: 'scout', architecture: 'human' }, seed);
}
