/**
 * Tile map data structure.
 * Pure data — no rendering. Owned by game logic, read by visual layer.
 */
import { TileType, Visibility } from '../types';

export const TILE_SIZE = 32; // pixels per tile

export class TileMap {
  readonly width: number;
  readonly height: number;

  /** Tile type at each cell (row-major) */
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

  /** Get tile type at (x, y) */
  get(x: number, y: number): TileType {
    if (!this.inBounds(x, y)) return TileType.VOID;
    return this.tiles[this.idx(x, y)] as TileType;
  }

  /** Set tile type at (x, y) */
  set(x: number, y: number, type: TileType): void {
    if (!this.inBounds(x, y)) return;
    this.tiles[this.idx(x, y)] = type;
  }

  /** Check if a tile blocks movement */
  blocksMovement(x: number, y: number): boolean {
    const t = this.get(x, y);
    return t === TileType.VOID || t === TileType.WALL || t === TileType.DOOR_CLOSED;
  }

  /** Check if a tile blocks line of sight */
  blocksLight(x: number, y: number): boolean {
    const t = this.get(x, y);
    return t === TileType.VOID || t === TileType.WALL || t === TileType.DOOR_CLOSED;
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
