/** Sandbox mode types */

export type SandboxTool = 'inspect' | 'tile_paint' | 'entity_spawn' | 'fluid_place' | 'gas_place';

export interface TileInspectData {
  x: number;
  y: number;
  tileType: string;
  tileTypeId: number;
  materialName: string;
  visibility: string;
  light: number;
  // Phase 3 placeholders
  fluids: Record<string, number>;
  gases: Record<string, number>;
  temperature: number;
  surfaceStates: string[];
}

export interface EntityInspectData {
  eid: number;
  position: { x: number; y: number };
  spriteIndex: number;
  layer: number;
  energy: number;
  speed: number;
  fovRange: number;
  isPlayer: boolean;
  hasAI: boolean;
  aiBehaviour: number;
  aiTargetEid: number;
  aiPathLength: number;
  hp: number;
  maxHp: number;
  faction: string;
  attackDamage: number;
}

/** AI debug data for overlay rendering */
export interface AIDebugData {
  path: { x: number; y: number }[];
  targetTile: { x: number; y: number } | null;
  behaviour: number;
  targetEid: number;
}
