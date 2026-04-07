/**
 * visorWarp — applies a Master Chief style barrel distortion.
 */

import {
  DOM_VISOR_WARP_CONFIG,
  getWarpSafeInsets,
  mapClientPointToWarpSource,
  mapVisualPointToWarpSource,
  type VisorWarpConfig,
} from './visorWarpMath';
import { getVisorRuntimeState } from './visorRuntimeSettings';

const MAP_SIZE = 256;
const SVG_FILTER_ID = 'visor-warp-svg';

function getSvgDisplacementScale(): number {
  const viewport = Math.max(window.innerWidth, window.innerHeight);
  return viewport * 2 * DOM_VISOR_WARP_CONFIG.scale;
}

export function injectVisorWarpFilters(): void {
  const { amplitude } = DOM_VISOR_WARP_CONFIG;
  const scale = getSvgDisplacementScale();
  const canvas = document.createElement('canvas');
  canvas.width = MAP_SIZE;
  canvas.height = MAP_SIZE;
  const ctx = canvas.getContext('2d')!;
  const imgData = ctx.createImageData(MAP_SIZE, MAP_SIZE);
  const d = imgData.data;

  // Generate the displacement map
  for (let py = 0; py < MAP_SIZE; py++) {
    const y = py / (MAP_SIZE - 1);
    const dy = y - 0.5;

    for (let px = 0; px < MAP_SIZE; px++) {
      const x = px / (MAP_SIZE - 1);
      const dx = x - 0.5;

      const distance = Math.sqrt(dx * dx + dy * dy);
      // Quadratic curve for smooth, accelerating distortion towards the edges
      const factor = distance * distance * 2.0;

      const dispX = dx * factor;
      const dispY = dy * factor;

      // Displacement map expects 0..255 where 128 is neutral.
      const red = 128 + (dispX * amplitude) * 127;
      const green = 128 + (dispY * amplitude) * 127;

      const idx = (py * MAP_SIZE + px) * 4;
      d[idx + 0] = Math.max(0, Math.min(255, Math.round(red)));
      d[idx + 1] = Math.max(0, Math.min(255, Math.round(green)));
      d[idx + 2] = 128; // Blue channel unused
      d[idx + 3] = 255; // Alpha
    }
  }

  ctx.putImageData(imgData, 0, 0);
  const mapUrl = canvas.toDataURL('image/png');

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.id = SVG_FILTER_ID;
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.style.position = 'absolute';
  svg.style.pointerEvents = 'none';

  svg.innerHTML = `
    <defs>
        <filter id="visor-warp" x="-20%" y="-20%" width="140%" height="140%" 
                primitiveUnits="objectBoundingBox" 
                color-interpolation-filters="sRGB">
          <feImage href="${mapUrl}" result="map" x="0" y="0" width="1" height="1" preserveAspectRatio="none"/>
          <feDisplacementMap in="SourceGraphic" in2="map" 
                             xChannelSelector="R" yChannelSelector="G"
                             scale="${scale}"/>
        </filter>
      </defs>
    `;

  document.getElementById(SVG_FILTER_ID)?.remove();
  document.body.prepend(svg);
}

/**
 * Calculates the undistorted (source) coordinate for a given visual (distorted) coordinate.
 * This is used to map mouse clicks back to the actual DOM element positions.
 */
export function getUndistortedPoint(sx: number, sy: number): { x: number, y: number } {
  if (!getVisorRuntimeState().distortionEnabled) {
    return { x: sx, y: sy };
  }

  return mapClientPointToWarpSource(sx, sy, {
    left: 0,
    top: 0,
    width: window.innerWidth,
    height: window.innerHeight,
  }, DOM_VISOR_WARP_CONFIG);
}

export function installPhaserInputWarp(
  inputManager: any,
  canvas: HTMLCanvasElement,
  config: VisorWarpConfig,
): void {
  const key = '__visorWarpTransformState';
  const state = inputManager[key] as
    | { original: (pointer: any, pageX: number, pageY: number, wasMove: boolean) => void; canvas: HTMLCanvasElement; config: VisorWarpConfig }
    | undefined;

  if (state) {
    state.canvas = canvas;
    state.config = config;
    return;
  }

  const original = inputManager.transformPointer.bind(inputManager);
  const nextState = { original, canvas, config };
  inputManager[key] = nextState;

  inputManager.transformPointer = (pointer: any, pageX: number, pageY: number, wasMove: boolean) => {
    if (!getVisorRuntimeState().distortionEnabled) {
      return nextState.original(pointer, pageX, pageY, wasMove);
    }

    const rect = nextState.canvas.getBoundingClientRect();
    const clientX = pageX - window.scrollX;
    const clientY = pageY - window.scrollY;
    const source = mapClientPointToWarpSource(clientX, clientY, rect, nextState.config);

    return nextState.original(
      pointer,
      source.x + window.scrollX,
      source.y + window.scrollY,
      wasMove,
    );
  };
}

export {
  DOM_VISOR_WARP_CONFIG,
  GAME_VISOR_WARP_CONFIG,
  getWarpSafeInsets,
  mapClientPointToWarpSource,
  mapVisualPointToWarpSource,
  UI_VISOR_WARP_CONFIG,
} from './visorWarpMath';

/**
 * Performs a 'Flash Hit-Test': temporarily enables pointer events on the HUD
 * to find the top-most element at the given coordinates using the browser's
 * native engine, then disables them again.
 */
function hitTestHUD(x: number, y: number): HTMLElement | null {
  const hudRoot = document.getElementById('hud-root');
  if (!hudRoot) return null;

  // 1. Flash pointer-events to find the element
  hudRoot.classList.add('hit-test-mode');
  const elements = document.elementsFromPoint(x, y);
  hudRoot.classList.remove('hit-test-mode');

  // 2. Filter for the first element that is inside our HUD root
  return elements.find(el => hudRoot.contains(el)) as HTMLElement || null;
}

/**
 * Set up a global event interceptor that redirects pointer events
 * to the correct elements after accounting for visor distortion.
 */
let interactionSetupDone = false;
export function setupWarpInteraction(): void {
  if (interactionSetupDone) return;
  interactionSetupDone = true;

  const events = ['pointerdown', 'pointerup', 'pointermove', 'click', 'dblclick', 'contextmenu'];

  const handleEvent = (e: Event) => {
    // @ts-ignore - custom flag to prevent recursion
    if (e._visor_redirect) return;

    const pe = e as PointerEvent;
    const { x, y } = getUndistortedPoint(pe.clientX, pe.clientY);

    // Perform virtual hit test
    const hudTarget = hitTestHUD(x, y);

    // If we hit a HUD element, we intercept.
    // We ALSO intercept if the mouse is physically over a HUD element (ghost hit),
    // because all HUD interaction must go through our visual redirection.
    const hudRoot = document.getElementById('hud-root');
    const physicalHitHud = hudRoot?.contains(pe.target as Node);

    if (hudTarget || physicalHitHud) {
      // Intercept and stop original event
      e.stopImmediatePropagation();
      if (pe.type === 'click' || pe.type === 'contextmenu') e.preventDefault();

      if (hudTarget) {
        // Create synthetic event and redirect to visual target
        const init: PointerEventInit = {
          bubbles: true,
          cancelable: true,
          composed: true,
          detail: pe.detail,
          view: window,
          clientX: x,
          clientY: y,
          screenX: x + (window.screenX || 0),
          screenY: y + (window.screenY || 0),
          ctrlKey: pe.ctrlKey,
          altKey: pe.altKey,
          shiftKey: pe.shiftKey,
          metaKey: pe.metaKey,
          button: pe.button,
          buttons: pe.buttons,
          pointerId: pe.pointerId,
          width: pe.width,
          height: pe.height,
          pressure: pe.pressure,
          tangentialPressure: pe.tangentialPressure,
          tiltX: pe.tiltX,
          tiltY: pe.tiltY,
          twist: pe.twist,
          pointerType: pe.pointerType,
          isPrimary: pe.isPrimary,
        };

        const redirected = new PointerEvent(pe.type, init);
        // @ts-ignore
        redirected._visor_redirect = true;
        hudTarget.dispatchEvent(redirected);
      }
    }
  };

  events.forEach(type => {
    window.addEventListener(type, handleEvent, true); // Capture phase
  });

  // Handle hover and cursor style manually
  let lastHovered: HTMLElement | null = null;
  window.addEventListener('pointermove', (e) => {
    // @ts-ignore
    if (e._visor_redirect) return;

    const { x, y } = getUndistortedPoint(e.clientX, e.clientY);
    const hudTarget = hitTestHUD(x, y);

    if (hudTarget !== lastHovered) {
      if (lastHovered) lastHovered.classList.remove('visor-hover');
      if (hudTarget) hudTarget.classList.add('visor-hover');
      lastHovered = hudTarget;

      // Update body cursor style
      const isPointer = hudTarget && (
        hudTarget.tagName === 'BUTTON' || 
        hudTarget.classList.contains('ctx-action') ||
        hudTarget.classList.contains('inv-item') ||
        hudTarget.classList.contains('dw-close') ||
        hudTarget.classList.contains('sb-close') ||
        hudTarget.hasAttribute('onclick') ||
        window.getComputedStyle(hudTarget).cursor === 'pointer'
      );
      document.body.classList.toggle('visor-pointer', !!isPointer);
    }
  }, true);
}
