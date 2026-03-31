/**
 * JSON5 data loader — reads content files from data/ and builds typed registries.
 * Phase 0 exit criteria: typed JSON5 loader.
 */
import JSON5 from 'json5';
import type { MaterialData, DataRegistry } from '../types';

// Vite glob import for all JSON5 files under data/
// `?raw` imports file contents as strings
const materialFiles = import.meta.glob('/data/materials/*.json5', {
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

let registry: DataRegistry | null = null;

/** Load all JSON5 data files and return the registry. Cached after first call. */
export function loadData(): DataRegistry {
  if (registry) return registry;
  registry = {
    materials: parseMaterials(),
  };
  console.log(
    `[data] Loaded ${registry.materials.size} materials`
  );
  return registry;
}
