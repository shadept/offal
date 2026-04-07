export interface VisorRuntimeState {
  distortionEnabled: boolean;
  scanlinesEnabled: boolean;
  vignetteEnabled: boolean;
}

type Listener = (state: VisorRuntimeState) => void;

const state: VisorRuntimeState = {
  distortionEnabled: true,
  scanlinesEnabled: true,
  vignetteEnabled: true,
};

const listeners = new Set<Listener>();

export function getVisorRuntimeState(): VisorRuntimeState {
  return state;
}

export function applyDomVisorState(root: HTMLElement | null = document.getElementById('hud-root')): void {
  if (root) {
    root.classList.toggle('visor-distortion-disabled', !state.distortionEnabled);
  }

  const overlay = document.getElementById('hud-visor-overlay');
  if (overlay) {
    overlay.classList.toggle('visor-vignette-disabled', !state.vignetteEnabled);
  }
}

function notify(): void {
  applyDomVisorState();
  for (const listener of listeners) {
    listener(state);
  }
}

export function onVisorRuntimeChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setVisorDistortionEnabled(value: boolean): void {
  if (state.distortionEnabled === value) return;
  state.distortionEnabled = value;
  notify();
}

export function setVisorScanlinesEnabled(value: boolean): void {
  if (state.scanlinesEnabled === value) return;
  state.scanlinesEnabled = value;
  notify();
}

export function setVisorVignetteEnabled(value: boolean): void {
  if (state.vignetteEnabled === value) return;
  state.vignetteEnabled = value;
  notify();
}
