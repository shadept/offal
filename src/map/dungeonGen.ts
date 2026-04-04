/**
 * Ship generation wrapper — converts raw graph-based generation output
 * into the game-ready format with room functions, entity spawns,
 * infrastructure, and arrival events.
 *
 * Delegates to shipGen.ts for the actual procedural layout, then layers
 * on data-driven room population from data/rooms.json5.
 */
import { TileMap } from './TileMap';
import { TileType } from '../types';
import { getRegistry } from '../data/loader';
import { generateShipFromConfig } from './shipGen';
import type { ShipGenConfig, ShipGraph, TeleporterPair } from './shipGen';
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

export interface GeneratedShip {
  tileMap: TileMap;
  rooms: RoomInfo[];
  playerSpawn: { x: number; y: number };
  spawns: { species: string; x: number; y: number }[];
  doors: { x: number; y: number }[];
  teleporters: TeleporterPair[];
  seed: string;
  /** The raw ship graph for debug overlay */
  graph: ShipGraph;
}

export interface DungeonGenConfig {
  shipType?: string;
  architecture?: string;
}

export interface ArrivalEvent {
  type: 'fire' | 'gas_leak';
  x: number;
  y: number;
}

// ═══════════════════════════════════════════════════════════
// ROOM TYPE → ROOM DATA MAPPING
// ═══════════════════════════════════════════════════════════

/** Maps generated room types to RoomData IDs from rooms.json5.
 *  Multiple generator types can map to the same room data. */
const ROOM_TYPE_TO_DATA: Record<string, string> = {
  bridge: 'bridge',
  cargo: 'cargo',
  lab: 'lab',
  medical: 'medical',
  engineering: 'engineering',
  engine: 'engineering',
  storage: 'storage',
  crew_quarters: 'crew_quarters',
  armory: 'armory',
  // Types that don't have a direct rooms.json5 entry use a fallback
  security: 'armory',
  cantina: 'crew_quarters',
  cells: 'storage',
  refinery: 'engineering',
  drill: 'engineering',
  shields: 'engineering',
  sensors: 'lab',
  hydroponics: 'cargo',
  hangar: 'cargo',
};

function getRoomDataForType(type: string): RoomData | null {
  const registry = getRegistry();
  const dataId = ROOM_TYPE_TO_DATA[type];
  if (dataId) return registry.rooms.get(dataId) ?? null;
  // Weapon/exterior types — no population
  return null;
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
// INFRASTRUCTURE
// ═══════════════════════════════════════════════════════════

function placeInfrastructure(rooms: RoomInfo[], tileMap: TileMap, rng: SeededRNG): void {
  for (const room of rooms) {
    if (!room.function) continue;
    const infra = room.function.infrastructure;
    if (!infra || infra.length === 0) continue;

    for (const type of infra) {
      if (type === 'crate' || type === 'console') {
        const count = rng.int(0, 2);
        for (let i = 0; i < count; i++) {
          const edge = rng.int(0, 3);
          let x: number, y: number;
          switch (edge) {
            case 0:
              x = rng.int(room.rect.x, room.rect.x + room.rect.w - 1);
              y = room.rect.y;
              break;
            case 1:
              x = rng.int(room.rect.x, room.rect.x + room.rect.w - 1);
              y = room.rect.y + room.rect.h - 1;
              break;
            case 2:
              x = room.rect.x;
              y = rng.int(room.rect.y, room.rect.y + room.rect.h - 1);
              break;
            default:
              x = room.rect.x + room.rect.w - 1;
              y = rng.int(room.rect.y, room.rect.y + room.rect.h - 1);
              break;
          }
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

function generateArrivalEvents(rooms: RoomInfo[], tileMap: TileMap, rng: SeededRNG): ArrivalEvent[] {
  const events: ArrivalEvent[] = [];

  for (const room of rooms) {
    if (!room.function) continue;
    const possible = room.function.arrivalEvents;
    if (!possible || possible.length === 0) continue;

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

export function generateShip(
  seed?: string,
  config?: DungeonGenConfig,
): GeneratedShip & { arrivalEvents: ArrivalEvent[] } {
  const rng = new SeededRNG(seed);
  const registry = getRegistry();

  // Pick ship type + architecture from config or random
  const shipTypes = Array.from(registry.shipTypes.keys());
  const archs = Array.from(registry.architectures.keys());

  const shipType = config?.shipType ?? rng.pick(shipTypes);
  const architecture = config?.architecture ?? rng.pick(archs);

  const genConfig: ShipGenConfig = { shipType, architecture };
  const result = generateShipFromConfig(genConfig, rng.seed);

  // Build RoomInfo array with room data from registry
  const rooms: RoomInfo[] = result.roomCenters.map(rc => {
    // Find the room's node in the graph to get dimensions
    const node = result.graph.nodes.find(n => n.id === rc.id);
    const rect: Rect = node
      ? { x: rc.x - Math.floor(node.w / 2), y: rc.y - Math.floor(node.h / 2), w: node.w, h: node.h }
      : { x: rc.x, y: rc.y, w: 0, h: 0 };

    return {
      rect,
      function: getRoomDataForType(rc.type),
      center: { x: rc.x, y: rc.y },
    };
  });

  // Population: place creatures per room function
  const popRng = new SeededRNG(rng.seed + '_pop');
  const spawns = populateRooms(rooms, result.tileMap, popRng, result.playerSpawn);

  // Infrastructure — disabled: was placing wall tiles on floor, blocking doors.
  // TODO: reimplement as proper entities (crates, consoles) instead of wall tiles.
  // placeInfrastructure(rooms, result.tileMap, popRng);

  // Arrival events
  const arrivalEvents = generateArrivalEvents(rooms, result.tileMap, popRng);

  console.log(
    `[shipGen] ${registry.shipTypes.get(shipType)?.name ?? shipType} ` +
    `(${registry.architectures.get(architecture)?.name ?? architecture}) — ` +
    `${result.graph.nodes.length} rooms, ${result.graph.edges.length} edges`,
  );

  return {
    tileMap: result.tileMap,
    rooms,
    playerSpawn: result.playerSpawn,
    spawns,
    doors: result.doors,
    teleporters: result.teleporters,
    seed: rng.seed,
    graph: result.graph,
    arrivalEvents,
  };
}
