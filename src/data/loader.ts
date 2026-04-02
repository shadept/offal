/**
 * JSON5 data loader — reads content files from data/ and builds typed registries.
 * All game content is data-driven; no hardcoded content in game logic.
 */
import JSON5 from 'json5';
import type { MaterialData, TileData, SpeciesData, MapData, FactionData, PhysicsRulesData, RoomData, ShipClassData, DataRegistry } from '../types';

// Vite glob imports — `?raw` imports file contents as strings
const materialFiles = import.meta.glob('/data/materials/*.json5', {
  eager: true,
  query: '?raw',
  import: 'default',
});

const tileFiles = import.meta.glob('/data/tiles/*.json5', {
  eager: true,
  query: '?raw',
  import: 'default',
});

const mapFiles = import.meta.glob('/data/maps/*.json5', {
  eager: true,
  query: '?raw',
  import: 'default',
});

const speciesFiles = import.meta.glob('/data/species/*.json5', {
  eager: true,
  query: '?raw',
  import: 'default',
});

const factionFiles = import.meta.glob('/data/factions.json5', {
  eager: true,
  query: '?raw',
  import: 'default',
});

const physicsRulesFiles = import.meta.glob('/data/physics-rules.json5', {
  eager: true,
  query: '?raw',
  import: 'default',
});

const roomFiles = import.meta.glob('/data/rooms.json5', {
  eager: true,
  query: '?raw',
  import: 'default',
});

const shipClassFiles = import.meta.glob('/data/ships/*.json5', {
  eager: true,
  query: '?raw',
  import: 'default',
});

function parseMaterials(): Map<string, MaterialData> {
  const map = new Map<string, MaterialData>();
  for (const [path, raw] of Object.entries(materialFiles)) {
    try {
      const parsed = JSON5.parse(raw as string);
      const list: MaterialData[] = parsed.materials ?? [parsed];
      for (const mat of list) {
        if (mat.id) map.set(mat.id, mat);
      }
    } catch (e) {
      console.error(`Failed to parse material file ${path}:`, e);
    }
  }
  return map;
}

function parseTiles(): { byId: Map<string, TileData>; byIndex: Map<number, TileData> } {
  const byId = new Map<string, TileData>();
  const byIndex = new Map<number, TileData>();
  for (const [path, raw] of Object.entries(tileFiles)) {
    try {
      const parsed = JSON5.parse(raw as string);
      const list: TileData[] = parsed.tiles ?? [parsed];
      for (const tile of list) {
        if (tile.id) {
          byId.set(tile.id, tile);
          byIndex.set(tile.index, tile);
        }
      }
    } catch (e) {
      console.error(`Failed to parse tile file ${path}:`, e);
    }
  }
  return { byId, byIndex };
}

function parseSpecies(): Map<string, SpeciesData> {
  const map = new Map<string, SpeciesData>();
  for (const [path, raw] of Object.entries(speciesFiles)) {
    try {
      const parsed = JSON5.parse(raw as string);
      const list: SpeciesData[] = parsed.species ?? [parsed];
      for (const sp of list) {
        if (sp.id) map.set(sp.id, sp);
      }
    } catch (e) {
      console.error(`Failed to parse species file ${path}:`, e);
    }
  }
  return map;
}

function parseMaps(): Map<string, MapData> {
  const map = new Map<string, MapData>();
  for (const [path, raw] of Object.entries(mapFiles)) {
    try {
      const parsed = JSON5.parse(raw as string) as MapData;
      if (parsed.id) map.set(parsed.id, parsed);
    } catch (e) {
      console.error(`Failed to parse map file ${path}:`, e);
    }
  }
  return map;
}

function parseFactions(): Map<string, FactionData> {
  const map = new Map<string, FactionData>();
  for (const [path, raw] of Object.entries(factionFiles)) {
    try {
      const parsed = JSON5.parse(raw as string);
      const list: FactionData[] = parsed.factions ?? [parsed];
      for (const f of list) {
        if (f.id) map.set(f.id, f);
      }
    } catch (e) {
      console.error(`Failed to parse faction file ${path}:`, e);
    }
  }
  return map;
}

function parsePhysicsRules(): PhysicsRulesData {
  const defaultRules: PhysicsRulesData = {
    rules: [],
    fluidFireInteractions: { suppressors: [], intensifiers: [], intensifierThresholdMultiplier: 0.3 },
  };
  for (const [path, raw] of Object.entries(physicsRulesFiles)) {
    try {
      const parsed = JSON5.parse(raw as string);
      return {
        rules: parsed.rules ?? [],
        fluidFireInteractions: parsed.fluidFireInteractions ?? defaultRules.fluidFireInteractions,
      };
    } catch (e) {
      console.error(`Failed to parse physics rules file ${path}:`, e);
    }
  }
  return defaultRules;
}

function parseRooms(): Map<string, RoomData> {
  const map = new Map<string, RoomData>();
  for (const [path, raw] of Object.entries(roomFiles)) {
    try {
      const parsed = JSON5.parse(raw as string);
      const list: RoomData[] = parsed.rooms ?? [parsed];
      for (const room of list) {
        if (room.id) map.set(room.id, room);
      }
    } catch (e) {
      console.error(`Failed to parse room file ${path}:`, e);
    }
  }
  return map;
}

function parseShipClasses(): Map<string, ShipClassData> {
  const map = new Map<string, ShipClassData>();
  for (const [path, raw] of Object.entries(shipClassFiles)) {
    try {
      const parsed = JSON5.parse(raw as string) as ShipClassData;
      if (parsed.id) map.set(parsed.id, parsed);
    } catch (e) {
      console.error(`Failed to parse ship class file ${path}:`, e);
    }
  }
  return map;
}

let registry: DataRegistry | null = null;

/** Load all JSON5 data files and return the registry. Cached after first call. */
export function loadData(): DataRegistry {
  if (registry) return registry;

  const { byId: tiles, byIndex: tilesByIndex } = parseTiles();

  const rooms = parseRooms();

  registry = {
    materials: parseMaterials(),
    tiles,
    tilesByIndex,
    species: parseSpecies(),
    maps: parseMaps(),
    factions: parseFactions(),
    physicsRules: parsePhysicsRules(),
    rooms,
    shipClasses: parseShipClasses(),
  };

  console.log(
    `[data] Loaded ${registry.materials.size} materials, ` +
    `${registry.tiles.size} tiles, ` +
    `${registry.species.size} species, ` +
    `${registry.factions.size} factions, ` +
    `${registry.maps.size} maps, ` +
    `${registry.physicsRules.rules.length} physics rules, ` +
    `${registry.rooms.size} room types, ` +
    `${registry.shipClasses.size} ship classes`
  );
  return registry;
}

/** Get the cached registry. Throws if loadData() hasn't been called. */
export function getRegistry(): DataRegistry {
  if (!registry) throw new Error('Data not loaded — call loadData() first');
  return registry;
}
