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
export type VisualEventType = 'move' | 'teleport' | 'idle' | 'door_open' | 'door_close' | 'hit_flash' | 'death' | 'fire_spread' | 'fluid_spread' | 'gas_spread' | 'tile_destroyed';

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
  // Fluid-specific (optional)
  viscosity?: number;
  evaporationRate?: number;
  // Gas-specific (optional)
  diffusionRate?: number;
  dissipationRate?: number;
  tags?: string[];
}

/** Tile definition loaded from data/tiles.json5 */
export interface TileData {
  id: string;
  index: number;
  name: string;
  material: string | null;
  blocksMovement: boolean;
  blocksLight: boolean;
  /** Max hit points (undefined = indestructible) */
  hp?: number;
  /** Tile ID to convert to when destroyed */
  destroyedTo?: string;
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
  faction?: string;
  maxHp?: number;
  attackDamage?: number;
}

/** Faction definition loaded from data/factions.json5 */
export interface FactionData {
  id: string;
  name: string;
  hostileTo: string[]; // faction IDs, or ["*"] for hostile to all
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

/** Physics rule propagation config */
export interface PhysicsRulePropagation {
  condition: string;
  materialProperty: string;
  threshold: number;
  effect: string;
  delay: number;
}

/** A single physics rule loaded from data/physics-rules.json5 */
export interface PhysicsRuleData {
  trigger: string;
  propagatesTo: PhysicsRulePropagation | null;
  consumedBy: string[];
  damagePerTurn?: number;
  burnStatusOnOrganic?: boolean;
  duration?: number;
}

/** Fluid-fire interaction config */
export interface FluidFireInteractions {
  suppressors: string[];
  intensifiers: string[];
  intensifierThresholdMultiplier: number;
}

/** Full physics rules data */
export interface PhysicsRulesData {
  rules: PhysicsRuleData[];
  fluidFireInteractions: FluidFireInteractions;
}

/** Room population entry */
export interface RoomPopulationEntry {
  species: string;
  weight: number;
  min: number;
  max: number;
}

/** Room function definition loaded from data/rooms.json5 */
export interface RoomData {
  id: string;
  name: string;
  weight: number;
  maxCount: number;
  population: RoomPopulationEntry[];
  loot: { min: number; max: number };
  infrastructure: string[];
  arrivalEvents: string[];
}

/** Ship class room definition */
export interface ShipRoomDef {
  function: string;
  /** Room size: "small" | "medium" | "large" */
  size: string;
  /** If true, this room must be at an extremity of the ship */
  extremity?: boolean;
}

/** Ship class definition loaded from data/ships/*.json5 */
export interface ShipClassData {
  id: string;
  name: string;
  rooms: ShipRoomDef[];
  /** Pairs of room function IDs that must be connected */
  connections: [string, string][];
  /** Shape constraint for packing: "elongated" | "compact" | "round" */
  shape: string;
}

/** Architecture layout parameters loaded from data/architectures.json5 */
export interface ArchitectureLayout {
  type: 'SPINE' | 'RADIAL' | 'SEGMENTED' | 'SCAFFOLD' | 'FLOATING';
  crossProb: number;
  attachDirs?: string[];
  symmetryBias?: number;
  lateralBias?: number;
  scaffoldDirs?: string[];
  scaffoldExtra?: [number, number];
  floatDist?: [number, number];
  engineFloatDist?: [number, number];
}

/** Architecture definition loaded from data/architectures.json5 */
export interface ArchitectureData {
  id: string;
  name: string;
  layout: ArchitectureLayout;
  weaponExterior: string;
  weaponInterior: string;
}

/** Ship type definition loaded from data/ship-types.json5 */
export interface ShipTypeData {
  id: string;
  name: string;
  sizeClass: 'tiny' | 'small' | 'medium' | 'large' | 'massive';
  deck: Record<string, [number, number]>;
  engines: [number, number];
}

/** Room size definition loaded from data/room-sizes.json5 */
export interface RoomSizeData {
  type: string;
  w: [number, number];
  h: [number, number];
}

/** Data registry — holds all loaded JSON5 data */
export interface DataRegistry {
  materials: Map<string, MaterialData>;
  tiles: Map<string, TileData>;
  tilesByIndex: Map<number, TileData>;
  species: Map<string, SpeciesData>;
  maps: Map<string, MapData>;
  factions: Map<string, FactionData>;
  physicsRules: PhysicsRulesData;
  rooms: Map<string, RoomData>;
  shipClasses: Map<string, ShipClassData>;
  architectures: Map<string, ArchitectureData>;
  shipTypes: Map<string, ShipTypeData>;
  roomSizes: Map<string, RoomSizeData>;
  defaultRoomSize: { w: [number, number]; h: [number, number] };
}
