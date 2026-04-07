/**
 * VisorWarpFilter — barrel distortion controller.
 */
import Phaser from 'phaser';
import { UI_VISOR_WARP_CONFIG, type VisorWarpConfig } from '../visorWarpMath';
import { getVisorRuntimeState } from '../visorRuntimeSettings';

const FilterController = (Phaser as any).Filters.Controller;

export class VisorWarpFilter extends FilterController {
  private readonly baseConfig: VisorWarpConfig;
  public amplitude: number = UI_VISOR_WARP_CONFIG.amplitude;
  public scale: number = UI_VISOR_WARP_CONFIG.scale;

  constructor(camera: any, config?: { amplitude?: number, scale?: number }) {
    super(camera, 'FilterVisorWarp');
    this.baseConfig = {
      ...UI_VISOR_WARP_CONFIG,
      ...config,
    };
    this.amplitude = this.baseConfig.amplitude;
    this.scale = this.baseConfig.scale;
  }

  // Mandatory for Phaser 4 filters
  refreshTextures(): void {
    // No extra textures for this shader
  }

  update(_time: number): void {
    const runtime = getVisorRuntimeState();

    this.amplitude = runtime.distortionEnabled ? this.baseConfig.amplitude : 0;
    this.scale = runtime.distortionEnabled ? this.baseConfig.scale : 0;
  }
}
