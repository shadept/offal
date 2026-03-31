/**
 * Tile map data structure.
 * Pure data — no rendering. Owned by game logic, read by visual layer.
 *
 * Tile behaviour (blocksMovement, blocksLight) is read from the data
 * registry — the engine has no hardcoded tile logic.
 */
import { Visibility } from '../types';
import { getRegistry } from '../data/loader';

export const TILE_SIZE = 32; // pixels per tile

export class TileMap {
  readonly width: number;
  readonly height: number;

  /** Tile type index at each cell (row-major) — indices match data/tiles.json5 */
  readonly tiles: Uint8Array;

  /** Visibility state per cell for the player */
  readonly visibility: Uint8Array;

  /** Light level per cell (0–255), computed by FOV */
  readonly light: Uint8Array;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    const size = width * height;
    this.tiles = new Uint8Array(size);
    this.visibility = new Uint8Array(size);
    this.light = new Uint8Array(size);
  }

  /** Convert (x, y) to flat index */
  idx(x: number, y: number): number {
    return y * this.width + x;
  }

  /** Check bounds */
  inBounds(x: number, y: number): boolean {
    return x >= 0 && x < this.width && y >= 0 && y < this.height;
  }

  /** Get tile type index at (x, y) */
  get(x: number, y: number): number {
    if (!this.inBounds(x, y)) return 0; // void index
    return this.tiles[this.idx(x, y)];
  }

  /** Set tile type index at (x, y) */
  set(x: number, y: number, type: number): void {
    if (!this.inBounds(x, y)) return;
    this.tiles[this.idx(x, y)] = type;
  }

  /** Check if a tile blocks movement (from tile data registry) */
  blocksMovement(x: number, y: number): boolean {
    const tileData = getRegistry().tilesByIndex.get(this.get(x, y));
    return tileData?.blocksMovement ?? true; // unknown tiles block by default
  }

  /** Check if a tile blocks line of sight (from tile data registry) */
  blocksLight(x: number, y: number): boolean {
    const tileData = getRegistry().tilesByIndex.get(this.get(x, y));
    return tileData?.blocksLight ?? true;
  }

  /** Get visibility at (x, y) */
  getVisibility(x: number, y: number): Visibility {
    if (!this.inBounds(x, y)) return Visibility.UNSEEN;
    return this.visibility[this.idx(x, y)] as Visibility;
  }

  /** Set visibility at (x, y) */
  setVisibility(x: number, y: number, v: Visibility): void {
    if (!this.inBounds(x, y)) return;
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
