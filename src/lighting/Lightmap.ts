/**
 * CPU-side per-tile RGB lightmap.
 *
 * Stores HDR light values (Float32, can exceed 1.0 for over-exposure).
 * Light sources are registered and propagated via shadowcasting.
 * The result is uploaded to a canvas texture for the GPU shader.
 */
import { propagateLight } from '../map/fov';

/** Flicker type → alpha-channel index for GPU encoding. */
export const FLICKER_INDEX: Record<string, number> = {
  fire: 1,
  broken: 2,
  pulse: 3,
};

export interface LightSource {
  id: number;
  x: number;
  y: number;
  r: number;
  g: number;
  b: number;
  radius: number;
  flicker?: 'fire' | 'broken' | 'pulse';
}

/**
 * Scale factor for encoding HDR float values into Uint8 texture.
 * Light 1.0 (normal) maps to 128 in the texture.
 * Light 2.0 (over-exposed) maps to 255.
 * Shader divides by this to reconstruct HDR.
 */
export const LIGHT_TEXTURE_SCALE = 128;

export class Lightmap {
  readonly width: number;
  readonly height: number;
  readonly r: Float32Array;
  readonly g: Float32Array;
  readonly b: Float32Array;
  /** Per-tile flicker type index (0=none). Highest-intensity source wins. */
  readonly flicker: Uint8Array;
  /** Per-tile flicker seed (0–255). All tiles from the same source share the same seed. */
  readonly flickerSeed: Uint8Array;

  private _sources: LightSource[] = [];
  private _nextId = 1;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    const size = width * height;
    this.r = new Float32Array(size);
    this.g = new Float32Array(size);
    this.b = new Float32Array(size);
    this.flicker = new Uint8Array(size);
    this.flickerSeed = new Uint8Array(size);
  }

  get sources(): readonly LightSource[] { return this._sources; }

  clear(): void {
    this.r.fill(0);
    this.g.fill(0);
    this.b.fill(0);
    this.flicker.fill(0);
    this.flickerSeed.fill(0);
  }

  addSource(src: Omit<LightSource, 'id'>): LightSource {
    const source: LightSource = { ...src, id: this._nextId++ };
    this._sources.push(source);
    return source;
  }

  removeSource(id: number): void {
    this._sources = this._sources.filter(s => s.id !== id);
  }

  updateSource(id: number, x: number, y: number): void {
    const src = this._sources.find(s => s.id === id);
    if (src) { src.x = x; src.y = y; }
  }

  /**
   * Recompute the lightmap from all registered sources.
   * Uses shadowcasting per source with additive RGB accumulation.
   */
  recompute(blocksLight: (x: number, y: number) => boolean): void {
    this.clear();
    for (const src of this._sources) {
      // Derive a stable per-source seed (0–255) from its ID
      const seed = src.flicker ? ((src.id * 127 + 53) & 0xFF) : 0;
      propagateLight(
        src.x, src.y, src.radius,
        src.r, src.g, src.b,
        blocksLight,
        this,
        src.flicker ? FLICKER_INDEX[src.flicker] : undefined,
        seed,
      );
    }
  }

  /**
   * Add a flat ambient light level to tiles matching a predicate.
   * Values are additive — call after recompute().
   */
  addAmbient(
    r: number, g: number, b: number,
    predicate: (x: number, y: number) => boolean,
  ): void {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (predicate(x, y)) {
          const i = y * this.width + x;
          this.r[i] = Math.max(this.r[i], r);
          this.g[i] = Math.max(this.g[i], g);
          this.b[i] = Math.max(this.b[i], b);
        }
      }
    }
  }

  /**
   * Upload lightmap RGB and visibility data to canvas contexts for GPU texture upload.
   * Light values are encoded as: texByte = clamp(light * LIGHT_TEXTURE_SCALE, 0, 255).
   * Visibility texture channels:
   *   R = visibility: 0=UNSEEN, 128=SEEN, 255=VISIBLE
   *   G = tile type:  0=VOID, 128=FLOOR, 255=WALL
   */
  uploadToCanvas(
    lightCtx: CanvasRenderingContext2D,
    visCtx: CanvasRenderingContext2D,
    visibility: Uint8Array,
    tiles?: Uint8Array,
  ): void {
    const { width, height, r, g, b } = this;

    // Light RGB (alpha stays 255 — flicker is encoded in visibility texture B channel)
    const lightData = lightCtx.createImageData(width, height);
    const ld = lightData.data;
    const size = width * height;
    for (let i = 0; i < size; i++) {
      const pi = i * 4;
      ld[pi] = Math.min(255, Math.round(r[i] * LIGHT_TEXTURE_SCALE));
      ld[pi + 1] = Math.min(255, Math.round(g[i] * LIGHT_TEXTURE_SCALE));
      ld[pi + 2] = Math.min(255, Math.round(b[i] * LIGHT_TEXTURE_SCALE));
      ld[pi + 3] = 255;
    }
    lightCtx.putImageData(lightData, 0, 0);

    // Visibility + tile type
    // Visibility (R) + tile type (G) + flicker (B)
    const visData = visCtx.createImageData(width, height);
    const vd = visData.data;
    for (let i = 0; i < size; i++) {
      const pi = i * 4;
      const v = visibility[i];
      vd[pi] = v === 0 ? 0 : v === 1 ? 128 : 255;       // R: visibility
      if (tiles) {
        const t = tiles[i];
        // G: tile type — 0=VOID, 85=HULL, 128=FLOOR, 255=WALL
        vd[pi + 1] = t === 0 ? 0 : t === 1 ? 128 : t === 3 ? 85 : 255;
      }
      // B: pack flicker type (bits 0–1) + seed (bits 2–7)
      vd[pi + 2] = this.flicker[i] | (this.flickerSeed[i] & 0xFC);
      vd[pi + 3] = 255;
    }
    visCtx.putImageData(visData, 0, 0);
  }
}
