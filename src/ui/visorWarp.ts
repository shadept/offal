/**
 * visorWarp — applies a global pincushion distortion to the entire HUD layer.
 *
 * A single SVG displacement map filter on #hud-root pulls all UI elements
 * toward the screen center. Screen edges stay anchored, inner edges of
 * panels curve inward — like UI painted on the inside of a visor.
 *
 * Displacement map formula (per pixel at normalized position x,y):
 *   Pull direction = toward center (0.5, 0.5)
 *   Pull magnitude = sin(π·x) · sin(π·y)  (zero at edges, peak at center)
 *
 * feDisplacementMap samples: P'(x,y) = P(x + scale·(R/255 - 0.5), y + scale·(G/255 - 0.5))
 *   R < 128 → content shifts RIGHT,  R > 128 → content shifts LEFT
 *   G < 128 → content shifts DOWN,   G > 128 → content shifts UP
 */

/** Max displacement in pixels at the peak of the sine curve. */
const WARP_SCALE = 120;

/** Amplitude of the displacement (0-1, maps to channel range around 128). */
const AMPLITUDE = 0.22;

const MAP_SIZE = 128;

function generateGlobalDisplacementMap(): string {
  const canvas = document.createElement('canvas');
  canvas.width = MAP_SIZE;
  canvas.height = MAP_SIZE;
  const ctx = canvas.getContext('2d')!;
  const imgData = ctx.createImageData(MAP_SIZE, MAP_SIZE);
  const d = imgData.data;

  for (let py = 0; py < MAP_SIZE; py++) {
    const y = py / (MAP_SIZE - 1); // 0=top, 1=bottom
    const sinY = Math.sin(Math.PI * y);
    const dirY = Math.sign(y - 0.5); // +1 bottom half, -1 top half

    for (let px = 0; px < MAP_SIZE; px++) {
      const x = px / (MAP_SIZE - 1); // 0=left, 1=right
      const sinX = Math.sin(Math.PI * x);
      const dirX = Math.sign(x - 0.5); // +1 right half, -1 left half

      // Horizontal: pull toward center
      // Left half (dirX < 0): need R < 128 to shift right (toward center)
      // Right half (dirX > 0): need R > 128 to shift left (toward center)
      // Magnitude follows sin(πx) — zero at edges, peak at center
      const red = 128 + dirX * sinX * sinY * AMPLITUDE * 127;

      // Vertical: pull toward center
      // Top half (dirY < 0): need G < 128 to shift down (toward center)
      // Bottom half (dirY > 0): need G > 128 to shift up (toward center)
      const green = 128 + dirY * sinY * sinX * AMPLITUDE * 127;

      const idx = (py * MAP_SIZE + px) * 4;
      d[idx + 0] = Math.round(Math.max(0, Math.min(255, red)));
      d[idx + 1] = Math.round(Math.max(0, Math.min(255, green)));
      d[idx + 2] = 128;
      d[idx + 3] = 255;
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas.toDataURL('image/png');
}

export function injectVisorWarpFilters(): void {
  const map = generateGlobalDisplacementMap();

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.style.position = 'absolute';
  svg.style.pointerEvents = 'none';

  svg.innerHTML = `
    <defs>
      <filter id="visor-warp" x="-5%" y="-5%" width="110%" height="110%"
              color-interpolation-filters="sRGB">
        <feImage href="${map}" result="map"
                 x="0%" y="0%" width="100%" height="100%"
                 preserveAspectRatio="none"/>
        <feDisplacementMap in="SourceGraphic" in2="map"
                           xChannelSelector="R" yChannelSelector="G"
                           scale="${WARP_SCALE}"/>
      </filter>
    </defs>
  `;

  document.body.prepend(svg);
}
