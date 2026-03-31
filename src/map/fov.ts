/**
 * Recursive shadowcasting FOV algorithm.
 * Based on the classic roguelike algorithm by Björn Bergström.
 * Computes which tiles are visible from a given origin within a radius.
 */
import { TileMap } from './TileMap';
import { Visibility } from '../types';

// Multipliers for the eight octants
const OCTANT_MULTIPLIERS = [
  [1, 0, 0, 1],   // E-NE
  [0, 1, 1, 0],   // N-NE
  [0, -1, 1, 0],  // N-NW
  [-1, 0, 0, 1],  // W-NW
  [-1, 0, 0, -1], // W-SW
  [0, -1, -1, 0], // S-SW
  [0, 1, -1, 0],  // S-SE
  [1, 0, 0, -1],  // E-SE
];

/**
 * Compute FOV from (ox, oy) with given radius.
 * Updates map.visibility and map.light in-place.
 */
export function computeFOV(map: TileMap, ox: number, oy: number, radius: number): void {
  // Reset current visibility
  map.resetVisibility();

  // Origin is always visible
  markVisible(map, ox, oy, radius, 0);

  // Cast light in all 8 octants
  for (const [xx, xy, yx, yy] of OCTANT_MULTIPLIERS) {
    castLight(map, ox, oy, radius, 1, 1.0, 0.0, xx, xy, yx, yy);
  }
}

function markVisible(
  map: TileMap,
  x: number,
  y: number,
  radius: number,
  distance: number,
): void {
  map.setVisibility(x, y, Visibility.VISIBLE);
  // Light falls off with distance
  const intensity = Math.max(0, 255 - Math.floor((distance / radius) * 200));
  const idx = map.idx(x, y);
  if (map.light[idx] < intensity) {
    map.light[idx] = intensity;
  }
}

/**
 * Compute FOV tiles without modifying map state.
 * Returns array of {x, y} positions visible from (ox, oy).
 * Used by sandbox debug overlays.
 */
export function computeFOVTiles(
  map: TileMap, ox: number, oy: number, radius: number,
): { x: number; y: number }[] {
  const result: { x: number; y: number }[] = [];
  const seen = new Set<number>();

  const collect = (x: number, y: number) => {
    if (!map.inBounds(x, y)) return;
    const k = y * map.width + x;
    if (!seen.has(k)) {
      seen.add(k);
      result.push({ x, y });
    }
  };

  collect(ox, oy);

  for (const [xx, xy, yx, yy] of OCTANT_MULTIPLIERS) {
    castLightCollect(map, ox, oy, radius, 1, 1.0, 0.0, xx, xy, yx, yy, collect);
  }

  return result;
}

/**
 * Return a Set of flat tile indices visible from (ox, oy).
 * Does NOT mutate map state. Used by AI for line-of-sight checks.
 */
export function getVisibleTiles(map: TileMap, ox: number, oy: number, radius: number): Set<number> {
  const visible = new Set<number>();

  const collect = (x: number, y: number) => {
    if (map.inBounds(x, y)) visible.add(y * map.width + x);
  };

  collect(ox, oy);

  for (const [xx, xy, yx, yy] of OCTANT_MULTIPLIERS) {
    castLightCollect(map, ox, oy, radius, 1, 1.0, 0.0, xx, xy, yx, yy, collect);
  }

  return visible;
}

function castLightCollect(
  map: TileMap,
  ox: number,
  oy: number,
  radius: number,
  row: number,
  startSlope: number,
  endSlope: number,
  xx: number,
  xy: number,
  yx: number,
  yy: number,
  collect: (x: number, y: number) => void,
): void {
  if (startSlope < endSlope) return;

  let nextStartSlope = startSlope;

  for (let i = row; i <= radius; i++) {
    let blocked = false;

    for (let dx = -i, dy = -i; dx <= 0; dx++) {
      const mapX = ox + dx * xx + dy * xy;
      const mapY = oy + dx * yx + dy * yy;

      const lSlope = (dx - 0.5) / (dy + 0.5);
      const rSlope = (dx + 0.5) / (dy - 0.5);

      if (startSlope < rSlope) continue;
      if (endSlope > lSlope) break;

      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= radius) {
        collect(mapX, mapY);
      }

      if (blocked) {
        if (map.blocksLight(mapX, mapY)) {
          nextStartSlope = rSlope;
          continue;
        } else {
          blocked = false;
          startSlope = nextStartSlope;
        }
      } else if (map.blocksLight(mapX, mapY) && i < radius) {
        blocked = true;
        castLightCollect(map, ox, oy, radius, i + 1, startSlope, lSlope, xx, xy, yx, yy, collect);
        nextStartSlope = rSlope;
      }
    }

    if (blocked) break;
  }
}

function castLight(
  map: TileMap,
  ox: number,
  oy: number,
  radius: number,
  row: number,
  startSlope: number,
  endSlope: number,
  xx: number,
  xy: number,
  yx: number,
  yy: number,
): void {
  if (startSlope < endSlope) return;

  let nextStartSlope = startSlope;

  for (let i = row; i <= radius; i++) {
    let blocked = false;

    for (let dx = -i, dy = -i; dx <= 0; dx++) {
      const mapX = ox + dx * xx + dy * xy;
      const mapY = oy + dx * yx + dy * yy;

      const lSlope = (dx - 0.5) / (dy + 0.5);
      const rSlope = (dx + 0.5) / (dy - 0.5);

      if (startSlope < rSlope) continue;
      if (endSlope > lSlope) break;

      // Calculate distance
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= radius) {
        markVisible(map, mapX, mapY, radius, dist);
      }

      if (blocked) {
        if (map.blocksLight(mapX, mapY)) {
          nextStartSlope = rSlope;
          continue;
        } else {
          blocked = false;
          startSlope = nextStartSlope;
        }
      } else if (map.blocksLight(mapX, mapY) && i < radius) {
        blocked = true;
        castLight(map, ox, oy, radius, i + 1, startSlope, lSlope, xx, xy, yx, yy);
        nextStartSlope = rSlope;
      }
    }

    if (blocked) break;
  }
}
