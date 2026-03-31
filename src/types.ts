/** Shared type definitions for OFFAL */

/**
 * Tile type indices — numeric IDs matching data/tiles.json5 `index` values.
 * The enum is a convenience for code readability; the data file is the
 * source of truth for tile properties.
 */
export enum TileType {
  VOID = 0,
  FLOOR = 1,
  WALL = 2,
  DOOR_CLOSED = 3,
  DOOR_OPEN = 4,
}

/** Turn state machine states */
export enum TurnPhase {
  PLAYER_INPUT = 0,
  PROCESSING = 1,
  ANIMATION = 2,
  ENEMY_TURN = 3,
  ENEMY_ANIMATION = 4,
}

/** Visual event types */
export type VisualEventType = 'move' | 'idle' | 'door_open' | 'door_close';

/** A visual event produced by logic, consumed by the renderer */
export interface VisualEvent {
  type: VisualEventType;
  entityId: number;
  data: Record<string, unknown>;
}

/** Direction vector */
export interface Dir {
  dx: number;
  dy: number;
}

/** Cardinal + wait directions */
export const DIRECTIONS: Record<string, Dir> = {
  up:    { dx: 0, dy: -1 },
  down:  { dx: 0, dy: 1 },
  left:  { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
  wait:  { dx: 0, dy: 0 },
};

/** FOV visibility states */
export enum Visibility {
  UNSEEN = 0,
  SEEN = 1,    // previously seen, currently not visible
  VISIBLE = 2, // currently in FOV
}

// ═══════════════════════════════════════════════════════════
// DATA TYPES — loaded from JSON5 at boot
// ═══════════════════════════════════════════════════════════

/** Material data loaded from data/materials/*.json5 */
export interface MaterialData {
  id: string;
  name: string;
  flammability: number;
  conductivity: number;
  hardness: number;
  mass: number;
  color: string;
}

/** Tile definition loaded from data/tiles.json5 */
export interface TileData {
  id: string;
  index: number;
  name: string;
  material: string | null;
  blocksMovement: boolean;
  blocksLight: boolean;
  interactable?: boolean;
  opensTo?: string;
  closesTo?: string;
}

/** Species definition loaded from data/species/*.json5 */
export interface SpeciesData {
  id: string;
  name: string;
  description: string;
  speed: number;
  fovRange: number;
  color: string;
  spawnTags: string[];
  playerStart?: boolean;
}

/** Map definition loaded from data/maps/*.json5 */
export interface MapData {
  id: string;
  name: string;
  description: string;
  playerSpawn: { x: number; y: number };
  legend: Record<string, string>;   // char → tile id
  grid: string[];                   // row strings
  spawns?: { species: string; x: number; y: number }[];
}

/** Data registry — holds all loaded JSON5 data */
export interface DataRegistry {
  materials: Map<string, MaterialData>;
  tiles: Map<string, TileData>;
  tilesByIndex: Map<number, TileData>;
  species: Map<string, SpeciesData>;
  maps: Map<string, MapData>;
}
