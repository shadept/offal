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
  HULL = 3,
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
export type VisualEventType = 'move' | 'teleport' | 'idle' | 'door_open' | 'door_close' | 'hit_flash' | 'death' | 'fire_spread' | 'fluid_spread' | 'gas_spread' | 'tile_destroyed' | 'explosion' | 'part_hit' | 'part_severed' | 'part_deactivated' | 'part_destroyed' | 'part_ignite' | 'part_fire_suppressed' | 'item_pickup' | 'item_drop' | 'craft_success';

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
  /** How many turns contamination lasts on an entity after contact */
  contaminationDuration?: number;
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

/** Part type roles — capability categories */
export type PartRole = 'arm' | 'leg' | 'head' | 'torso' | 'organ' | 'sensor' | 'mouth' | 'segment' | 'rotor';

/** Part depth — determines damage targeting eligibility */
export type PartDepth = 'external' | 'internal';

/** Damage type — determines which parts can be targeted */
export type DamageType = 'blunt' | 'cut' | 'stab' | 'energy';

/** Capacity types that parts can contribute to */
export type CapacityType = 'mobility' | 'manipulation' | 'consciousness' | 'circulation';

/** Detach action — what happens when a part is severed */
export type DetachAction =
  | { action: 'become_hostile'; faction: string }
  | { action: 'explode'; damage: number; radius: number; onlyViolent: boolean }
  | { action: 'flailing'; turns: number; damage: number }
  | { action: 'release_spores'; gas: string; concentration: number }
  | { action: 'seek_host'; fallback: string };

/** Part definition loaded from data/parts/*.json5 */
export interface PartData {
  id: string;
  name: string;
  type: PartRole;
  species: string;
  material: string;
  maxHp: number;
  hitWeight: number;
  depth: PartDepth;
  woundEffect: string | null;
  detachedDecayRate: number;
  onDetach: DetachAction | null;
  weaponDamage?: number | null;
  weaponRange?: number | null;
  weaponDamageType?: DamageType | null;
  capacityContribution: CapacityType[] | null;
}

/** Slot definition within a species body plan */
export interface PartSlotDef {
  id: string;
  role: PartRole;
  position: string;
  default: string;
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
  attackDamage?: [number, number];
  parts?: PartSlotDef[];
  compatibleWith?: string[];
  requiredParts?: string[];
  locomotionBaseline?: string;
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

/** Gas interaction rules */
export interface GasRulesData {
  toxicDamagePerTurn: number;
  toxicThreshold: number;
  flammableExplosionThreshold: number;
  explosionDamage: number;
  explosionRadius: number;
}

/** Full physics rules data */
export interface PhysicsRulesData {
  rules: PhysicsRuleData[];
  fluidFireInteractions: FluidFireInteractions;
  gasRules: GasRulesData;
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
  size: 'small' | 'medium' | 'large';
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
  shape: 'elongated' | 'compact' | 'round';
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

/** Architecture visual colors */
export interface ArchitectureColors {
  wallColor: string;
  floorColor: string;
}

/** Architecture hull shape config */
export interface ArchitectureHull {
  shape: 'standard' | 'capsule' | 'ellipse' | 'diamond' | 'grid';
  pad: number;
}

/** Architecture definition loaded from data/architectures.json5 */
export interface ArchitectureData {
  id: string;
  name: string;
  layout: ArchitectureLayout;
  weaponExterior: string;
  weaponInterior: string;
  colors?: ArchitectureColors;
  hull?: ArchitectureHull;
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

/** Item size → volume units mapping */
export const ITEM_SIZE_VOLUME: Record<string, number> = {
  tiny: 1,
  small: 2,
  medium: 4,
  large: 8,
  huge: 16,
};

/** Item definition loaded from data/items/*.json5 */
export interface ItemData {
  id: string;
  name: string;
  description: string;
  material: string;
  shape: string;   // rod | point | sheet | vessel | chunk | composite
  size: string;     // tiny | small | medium | large | huge
  tags: string[];
  stackable?: boolean;
  maxStack?: number;
  fluidCapacity?: number | null;
  contents?: string | null;
  damage?: number | null;
  protection?: number | null;
  potionEffect?: string | null;
}

/** Recipe input definition */
export interface RecipeInput {
  tags: string[];
  quantity?: { min: number };
  consumed?: boolean;
}

/** Recipe output — either a specific item or derived from inputs */
export interface RecipeOutput {
  id?: string;
  derive?: {
    nameFrom: string;
    materialFrom: number;
    tagsFrom: number[];
    sizeFrom: string;
  };
  quantity: number;
}

/** Recipe definition loaded from data/recipes/*.json5 */
export interface RecipeData {
  id: string;
  name?: string;
  description?: string;
  inputs: RecipeInput[];
  conditions?: { environment?: string }[];
  output: RecipeOutput;
  byproducts?: { id: string; quantity: number }[];
}

/** Data registry — holds all loaded JSON5 data */
export interface DataRegistry {
  materials: Map<string, MaterialData>;
  tiles: Map<string, TileData>;
  tilesByIndex: Map<number, TileData>;
  species: Map<string, SpeciesData>;
  parts: Map<string, PartData>;
  maps: Map<string, MapData>;
  factions: Map<string, FactionData>;
  physicsRules: PhysicsRulesData;
  rooms: Map<string, RoomData>;
  shipClasses: Map<string, ShipClassData>;
  architectures: Map<string, ArchitectureData>;
  shipTypes: Map<string, ShipTypeData>;
  roomSizes: Map<string, RoomSizeData>;
  defaultRoomSize: { w: [number, number]; h: [number, number] };
  items: Map<string, ItemData>;
  recipes: Map<string, RecipeData>;
}
