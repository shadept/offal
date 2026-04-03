/**
 * HUD — mounts a Svelte overlay for position, turn count, phase, FPS, controls.
 * Lives in the DOM layer above the Phaser canvas, unaffected by camera zoom/scroll.
 */
import { mount, unmount } from 'svelte';
import HudOverlay from './HudOverlay.svelte';
import { Position } from '../ecs/components';
import { TurnPhase } from '../types';

const PHASE_LABELS: Record<number, string> = {
  [TurnPhase.PLAYER_INPUT]: 'YOUR TURN',
  [TurnPhase.PROCESSING]: 'PROCESSING',
  [TurnPhase.ANIMATION]: 'ANIMATING',
  [TurnPhase.ENEMY_TURN]: 'ENEMY TURN',
  [TurnPhase.ENEMY_ANIMATION]: 'ANIMATING',
  [-1]: 'SANDBOX',
};

export class HUD {
  private handle: Record<string, unknown>;
  private el: HTMLDivElement;

  constructor() {
    this.el = document.createElement('div');
    document.body.appendChild(this.el);
    this.handle = mount(HudOverlay, {
      target: this.el,
      props: {
        playerX: 0,
        playerY: 0,
        turnCount: 0,
        phase: '',
        fps: 0,
      },
    });
  }

  update(playerEid: number, turnCount: number, phase: TurnPhase, sandboxActive = false, fps = 0): void {
    // Direct DOM update — Svelte 5 mount returns the component instance
    // but we can't set props on it easily from plain TS.
    // Instead, update the DOM container's dataset and let a MutationObserver
    // or simpler: just manipulate the DOM elements directly.
    const root = this.el.querySelector('.hud') as HTMLElement | null;
    if (!root) return;

    const topLeft = root.querySelector('.hud-top-left');
    const topCenter = root.querySelector('.hud-top-center');
    const topRight = root.querySelector('.hud-top-right');

    if (topLeft) topLeft.textContent = `(${Position.x[playerEid]}, ${Position.y[playerEid]})`;
    if (topCenter) topCenter.textContent = sandboxActive ? PHASE_LABELS[-1] : (PHASE_LABELS[phase] ?? '');
    if (topRight) {
      topRight.innerHTML = `<div>Turn ${turnCount}</div><div class="hud-dim">${Math.round(fps)} fps</div>`;
    }
  }

  destroy(): void {
    unmount(this.handle as ReturnType<typeof mount>);
    this.el.remove();
  }
}
