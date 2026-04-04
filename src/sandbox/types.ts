/** Sandbox mode types */

export type SandboxTool = 'inspect' | 'tile_paint' | 'entity_spawn' | 'fluid_place' | 'gas_place';

export interface TileInspectData {
  x: number;
  y: number;
  tileType: string;
  tileTypeId: number;
  materialName: string;
  visibility: string;
  light: number | string;
  // Phase 3 placeholders
  fluids: Record<string, number>;
  gases: Record<string, number>;
  temperature: number;
  surfaceStates: string[];
}

export interface EntityInspectData {
  eid: number;
  isPlayer: boolean;
}

/** Data for one component section in the inspector. */
export interface ComponentSectionData {
  name: string;
  fields: [string, string][];
  hasOverlay: boolean;
}

