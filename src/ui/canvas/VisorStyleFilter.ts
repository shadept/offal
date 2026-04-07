/**
 * VisorStyleFilter — post-barrel screen-space visor styling.
 */
import Phaser from 'phaser';
import { UI_VISOR_WARP_CONFIG, type VisorWarpConfig } from '../visorWarpMath';
import { getVisorRuntimeState } from '../visorRuntimeSettings';

const FilterController = (Phaser as any).Filters.Controller;

export class VisorStyleFilter extends FilterController {
  private readonly baseConfig: VisorWarpConfig;
  public vignette: number = UI_VISOR_WARP_CONFIG.vignette;
  public scanlines: number = UI_VISOR_WARP_CONFIG.scanlines;
  public chroma: number = UI_VISOR_WARP_CONFIG.chroma;
  public viewportScale = 1;
  public time = 0;

  constructor(camera: any, config?: { vignette?: number, scanlines?: number, chroma?: number }) {
    super(camera, 'FilterVisorStyle');
    this.baseConfig = {
      ...UI_VISOR_WARP_CONFIG,
      ...config,
    };
    this.vignette = this.baseConfig.vignette;
    this.scanlines = this.baseConfig.scanlines;
    this.chroma = this.baseConfig.chroma;
  }

  refreshTextures(): void {
    // No extra textures for this shader
  }

  update(time: number): void {
    this.time = time / 1000.0;
    const runtime = getVisorRuntimeState();

    this.vignette = runtime.vignetteEnabled ? this.baseConfig.vignette : 0;
    this.scanlines = runtime.scanlinesEnabled ? this.baseConfig.scanlines : 0;
    this.chroma = runtime.distortionEnabled ? this.baseConfig.chroma : 0;

    const canvas = this.camera?.scene?.game?.canvas as HTMLCanvasElement | undefined;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width / 1280;
    const scaleY = rect.height / 720;
    this.viewportScale = Math.min(Math.max(Math.min(scaleX, scaleY), 0.35), 1);
  }
}
