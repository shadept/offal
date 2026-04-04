/**
 * LightmapFilter — Phaser 4 Filter Controller for lightmap-based scene lighting.
 * Holds references to lightmap and visibility textures and shader config.
 */
import { LIGHT_TEXTURE_SCALE } from './Lightmap';

const FilterController = (Phaser as any).Filters.Controller;

export interface LightmapFilterConfig {
  mapWidth: number;
  mapHeight: number;
  tileSize: number;
  lightmapTextureKey: string;
  visibilityTextureKey: string;
}

export class LightmapFilter extends FilterController {
  lightmapGlTexture: any = null;
  visibilityGlTexture: any = null;

  mapSize: [number, number];
  tileSize: number;
  time = 0;
  seenTint: [number, number, number] = [0.35, 0.38, 0.45];
  lightScale: number;
  revealAll = 0.0;
  debugMode = 0.0;  // 0=normal, 1=lightmap RGB, 2=visibility, 3=heat map

  private scene: Phaser.Scene;
  private lightmapKey: string;
  private visibilityKey: string;

  constructor(camera: Phaser.Cameras.Scene2D.Camera, config: LightmapFilterConfig) {
    super(camera, 'FilterLightmap');
    this.scene = camera.scene;
    this.mapSize = [config.mapWidth, config.mapHeight];
    this.tileSize = config.tileSize;
    this.lightmapKey = config.lightmapTextureKey;
    this.visibilityKey = config.visibilityTextureKey;
    this.lightScale = 255 / LIGHT_TEXTURE_SCALE;
    this.refreshTextures();
  }

  /** Re-fetch GL texture references after uploading new canvas data. */
  refreshTextures(): void {
    const textures = this.scene.sys.textures;
    const lightFrame = textures.getFrame(this.lightmapKey);
    const visFrame = textures.getFrame(this.visibilityKey);
    if (lightFrame) this.lightmapGlTexture = (lightFrame as any).glTexture;
    if (visFrame) this.visibilityGlTexture = (visFrame as any).glTexture;
  }
}
