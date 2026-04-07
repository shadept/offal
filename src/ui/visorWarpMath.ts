export interface VisorWarpConfig {
  amplitude: number;
  scale: number;
  vignette: number;
  scanlines: number;
  chroma: number;
  safePadding: number;
  contentScale: number;
  layoutScale: number;
}

export const GAME_VISOR_WARP_CONFIG: VisorWarpConfig = {
  amplitude: -1.0,
  scale: 0.05,
  vignette: 0.35,
  scanlines: 0.2,
  chroma: 0.12,
  safePadding: 0,
  contentScale: 1,
  layoutScale: 1,
};

export const UI_VISOR_WARP_CONFIG: VisorWarpConfig = {
  amplitude: -1.45,
  scale: 0.08,
  vignette: 0.5,
  scanlines: 0.38,
  chroma: 0.45,
  safePadding: 0.001,
  contentScale: 0.96,
  layoutScale: 1.25,
};

export const DOM_VISOR_WARP_CONFIG: VisorWarpConfig = {
  ...UI_VISOR_WARP_CONFIG,
  contentScale: 1,
  layoutScale: 1,
};

export interface ViewInsetsLike {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface ViewRectLike {
  left: number;
  top: number;
  width: number;
  height: number;
}

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

export function mapVisualPointToWarpSource(
  x: number,
  y: number,
  width: number,
  height: number,
  config: VisorWarpConfig,
): { x: number; y: number } {
  if (width <= 0 || height <= 0) return { x, y };

  const nx = x / width;
  const ny = y / height;
  const dx = nx - 0.5;
  const dy = ny - 0.5;
  const dist2 = (dx * dx) + (dy * dy);
  const factor = dist2 * 2.0;

  const srcX = clamp01(nx + (dx * factor * config.amplitude * config.scale));
  const srcY = clamp01(ny + (dy * factor * config.amplitude * config.scale));

  return {
    x: srcX * width,
    y: srcY * height,
  };
}

export function mapClientPointToWarpSource(
  clientX: number,
  clientY: number,
  rect: ViewRectLike,
  config: VisorWarpConfig,
): { x: number; y: number } {
  const local = mapVisualPointToWarpSource(
    clientX - rect.left,
    clientY - rect.top,
    rect.width,
    rect.height,
    config,
  );

  return {
    x: rect.left + local.x,
    y: rect.top + local.y,
  };
}

/**
 * The warped image pulls edge content outward, so UI needs a matching safe inset.
 * This samples the distortion along the screen edges and reserves the visible loss.
 */
export function getWarpSafeInsets(
  width: number,
  height: number,
  config: VisorWarpConfig,
): ViewInsetsLike {
  if (width <= 0 || height <= 0) {
    return { left: 0, right: 0, top: 0, bottom: 0 };
  }

  const samplePoints = [0, 0.25, 0.5, 0.75, 1];
  let left = 0;
  let right = 0;
  let top = 0;
  let bottom = 0;

  for (const t of samplePoints) {
    const leftPoint = mapVisualPointToWarpSource(0, t * height, width, height, config);
    const rightPoint = mapVisualPointToWarpSource(width, t * height, width, height, config);
    const topPoint = mapVisualPointToWarpSource(t * width, 0, width, height, config);
    const bottomPoint = mapVisualPointToWarpSource(t * width, height, width, height, config);

    left = Math.max(left, leftPoint.x);
    right = Math.max(right, width - rightPoint.x);
    top = Math.max(top, topPoint.y);
    bottom = Math.max(bottom, height - bottomPoint.y);
  }

  const extra = Math.max(width, height) * config.safePadding;

  return {
    left: left + extra,
    right: right + extra,
    top: top + extra,
    bottom: bottom + extra,
  };
}
