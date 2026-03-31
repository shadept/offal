/**
 * Map loader — converts a MapData definition (from JSON5) into a TileMap.
 * Resolves the legend (char → tile id → tile index) using the tile registry.
 */
import { TileMap } from './TileMap';
import { getRegistry } from '../data/loader';
import type { MapData } from '../types';

export interface LoadedMap {
  tileMap: TileMap;
  playerSpawn: { x: number; y: number };
  spawns: { species: string; x: number; y: number }[];
}

/** Load a map by ID from the data registry. */
export function loadMap(mapId: string): LoadedMap {
  const registry = getRegistry();
  const mapData = registry.maps.get(mapId);
  if (!mapData) throw new Error(`Map not found: ${mapId}`);
  return buildMap(mapData);
}

/** Build a TileMap from a MapData definition. */
export function buildMap(mapData: MapData): LoadedMap {
  const registry = getRegistry();

  // Resolve legend: char → tile index
  const charToIndex = new Map<string, number>();
  for (const [char, tileId] of Object.entries(mapData.legend)) {
    const tileData = registry.tiles.get(tileId);
    if (!tileData) {
      console.warn(`[map] Legend char '${char}' references unknown tile '${tileId}', defaulting to void`);
      charToIndex.set(char, 0);
    } else {
      charToIndex.set(char, tileData.index);
    }
  }

  // Determine dimensions from grid
  const height = mapData.grid.length;
  const width = Math.max(...mapData.grid.map(row => row.length));
  const tileMap = new TileMap(width, height);

  // Fill from grid
  for (let y = 0; y < height; y++) {
    const row = mapData.grid[y] ?? '';
    for (let x = 0; x < width; x++) {
      const char = row[x] ?? '~';
      const index = charToIndex.get(char) ?? 0; // default to void
      tileMap.set(x, y, index);
    }
  }

  return {
    tileMap,
    playerSpawn: { ...mapData.playerSpawn },
    spawns: mapData.spawns ?? [],
  };
}
