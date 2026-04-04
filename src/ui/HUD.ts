/**
 * HUD — mounts a Svelte overlay for position, turn count, phase, FPS, player HP, conditions.
 * Lives in the DOM layer above the Phaser canvas, unaffected by camera zoom/scroll.
 */
import { mount, unmount } from 'svelte';
import HudOverlay from './HudOverlay.svelte';
import { hasComponent } from 'bitecs';
import { Position, Health, Body, Dead } from '../ecs/components';
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
  private world: object | null = null;

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
        hp: 0,
        maxHp: 1,
        conditions: [],
      },
    });
  }

  bindWorld(world: object): void { this.world = world; }

  update(playerEid: number, turnCount: number, phase: TurnPhase, sandboxActive = false, fps = 0): void {
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

    // Player HP bar
    const hp = Health.hp[playerEid];
    const maxHp = Health.maxHp[playerEid];
    const hpRatio = maxHp > 0 ? hp / maxHp : 0;
    const hpColor = hpRatio > 0.6 ? '#4ec9b0' : hpRatio > 0.3 ? '#c9a84e' : '#e94560';

    const hpFill = root.querySelector('.hud-hp-fill') as HTMLElement | null;
    const hpText = root.querySelector('.hud-hp-text') as HTMLElement | null;
    if (hpFill) {
      hpFill.style.width = `${hpRatio * 100}%`;
      hpFill.style.background = hpColor;
    }
    if (hpText) hpText.textContent = `${hp}/${maxHp}`;

    // Conditions
    const conditions: string[] = [];
    if (this.world && hasComponent(this.world, playerEid, Body)) {
      const consciousness = Body.consciousness[playerEid];
      const mobility = Body.mobility[playerEid];
      const manipulation = Body.manipulation[playerEid];
      const circulation = Body.circulation[playerEid];

      if (consciousness < 10) conditions.push('UNCONSCIOUS');
      else if (consciousness < 50) conditions.push('DAZED');
      if (mobility === 0) conditions.push('IMMOBILE');
      else if (mobility < 50) conditions.push('HOBBLED');
      if (manipulation === 0) conditions.push('NO HANDS');
      if (circulation === 0) conditions.push('NO PULSE');
      else if (circulation < 50) conditions.push('WEAK PULSE');
    }

    const condEl = root.querySelector('.hud-conditions') as HTMLElement | null;
    if (condEl) {
      if (conditions.length > 0) {
        condEl.innerHTML = conditions.map(c => `<span class="hud-condition">${c}</span>`).join('');
        condEl.style.display = '';
      } else {
        condEl.innerHTML = '';
      }
    }
  }

  destroy(): void {
    unmount(this.handle as ReturnType<typeof mount>);
    this.el.remove();
  }
}
