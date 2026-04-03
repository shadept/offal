/**
 * Tile map data structure — virtual infinite plane.
 * Pure data — no rendering. Owned by game logic, read by visual layer.
 *
 * Any tile not explicitly set is VOID. There are no hard boundaries —
 * the map conceptually extends infinitely in all directions. Internally,
 * storage is a flat array sized to fit the generated content; coordinates
 * outside the allocated region silently return VOID / are no-ops.
 *
 * Tile behaviour (blocksMovement, blocksLight) is read from the data
 * registry — the engine has no hardcoded tile logic.
 */
import { Visibility } from '../types';
import { getRegistry } from '../data/loader';

export const TILE_SIZE = 32; // pixels per tile

export class TileMap {
  /** Allocated dimensions (internal storage only — NOT map boundaries) */
  readonly width: number;
  readonly height: number;

  /** Tile type index at each cell (row-major) — indices match data/tiles.json5 */
  readonly tiles: Uint8Array;

  /** Visibility state per cell for the player */
  readonly visibility: Uint8Array;

  /** Light level per cell (0–255), computed by FOV */
  readonly light: Uint8Array;

  /** Entity-projected overlays — entities (doors, barricades, etc.) set these
   *  to block movement/light independently of the base tile. */
  readonly entityBlocksMovement: Uint8Array;
  readonly entityBlocksLight: Uint8Array;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    const size = width * height;
    this.tiles = new Uint8Array(size);
    this.visibility = new Uint8Array(size);
    this.light = new Uint8Array(size);
    this.entityBlocksMovement = new Uint8Array(size);
    this.entityBlocksLight = new Uint8Array(size);
  }

  /** Convert (x, y) to flat index. Only valid for coordinates within the
   *  allocated region — callers iterating the grid can use this directly. */
  idx(x: number, y: number): number {
    return y * this.width + x;
  }

  /** Check if (x, y) falls within the allocated storage.
   *  The map is conceptually infinite, but storage is finite. */
  private inArray(x: number, y: number): boolean {
    return x >= 0 && x < this.width && y >= 0 && y < this.height;
  }

  /** Always true — the map is a virtual infinite plane.
   *  Unset tiles are VOID. Kept for API compatibility. */
  inBounds(_x: number, _y: number): boolean {
    return true;
  }

  /** Get tile type index at (x, y). Returns 0 (VOID) for unset tiles. */
  get(x: number, y: number): number {
    if (!this.inArray(x, y)) return 0;
    return this.tiles[this.idx(x, y)];
  }

  /** Set tile type index at (x, y). No-op for coordinates outside storage. */
  set(x: number, y: number, type: number): void {
    if (!this.inArray(x, y)) return;
    this.tiles[this.idx(x, y)] = type;
  }

  /** Check if a tile blocks movement (tile data OR entity overlay).
   *  Out-of-storage tiles are treated as VOID (blocks movement). */
  blocksMovement(x: number, y: number): boolean {
    if (!this.inArray(x, y)) return true;
    const idx = this.idx(x, y);
    if (this.entityBlocksMovement[idx]) return true;
    const tileData = getRegistry().tilesByIndex.get(this.tiles[idx]);
    return tileData?.blocksMovement ?? true;
  }

  /** Check if a tile blocks line of sight (tile data OR entity overlay).
   *  Out-of-storage tiles are treated as VOID (blocks light). */
  blocksLight(x: number, y: number): boolean {
    if (!this.inArray(x, y)) return true;
    const idx = this.idx(x, y);
    if (this.entityBlocksLight[idx]) return true;
    const tileData = getRegistry().tilesByIndex.get(this.tiles[idx]);
    return tileData?.blocksLight ?? true;
  }

  /** Get visibility at (x, y) */
  getVisibility(x: number, y: number): Visibility {
    if (!this.inArray(x, y)) return Visibility.UNSEEN;
    return this.visibility[this.idx(x, y)] as Visibility;
  }

  /** Set visibility at (x, y) */
  setVisibility(x: number, y: number, v: Visibility): void {
    if (!this.inArray(x, y)) return;
    this.visibility[this.idx(x, y)] = v;
  }

  /** Reset all VISIBLE cells to SEEN (called before recomputing FOV) */
  resetVisibility(): void {
    for (let i = 0; i < this.visibility.length; i++) {
      if (this.visibility[i] === Visibility.VISIBLE) {
        this.visibility[i] = Visibility.SEEN;
      }
    }
    this.light.fill(0);
  }
}
