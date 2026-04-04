<script lang="ts">
  let {
    playerX = $bindable(0),
    playerY = $bindable(0),
    turnCount = $bindable(0),
    phase = $bindable(''),
    fps = $bindable(0),
    hp = $bindable(0),
    maxHp = $bindable(1),
    conditions = $bindable<string[]>([]),
  }: {
    playerX: number;
    playerY: number;
    turnCount: number;
    phase: string;
    fps: number;
    hp: number;
    maxHp: number;
    conditions: string[];
  } = $props();

  let hpRatio = $derived(maxHp > 0 ? hp / maxHp : 0);
  let hpColor = $derived(hpRatio > 0.6 ? '#4ec9b0' : hpRatio > 0.3 ? '#c9a84e' : '#e94560');
</script>

<div class="hud">
  <div class="hud-top-left">({playerX}, {playerY})</div>
  <div class="hud-top-center">{phase}</div>
  <div class="hud-top-right">
    <div>Turn {turnCount}</div>
    <div class="hud-dim">{Math.round(fps)} fps</div>
  </div>

  <!-- Player status panel -->
  <div class="hud-player-status">
    <div class="hud-hp-row">
      <span class="hud-hp-label">HP</span>
      <div class="hud-hp-track">
        <div class="hud-hp-fill" style="width: {hpRatio * 100}%; background: {hpColor};"></div>
      </div>
      <span class="hud-hp-text">{hp}/{maxHp}</span>
    </div>
    {#if conditions.length > 0}
      <div class="hud-conditions">
        {#each conditions as cond}
          <span class="hud-condition">{cond}</span>
        {/each}
      </div>
    {/if}
  </div>

  <div class="hud-bottom">WASD: move | Space: wait | E: interact | I: inventory | B: body | R: reveal | Tab: sandbox</div>
</div>

<style>
  .hud {
    position: fixed;
    inset: 0;
    pointer-events: none;
    font-family: monospace;
    font-size: 0.85rem;
    z-index: 5;
  }
  .hud-top-left {
    position: absolute;
    top: 0.4rem;
    left: 0.5rem;
    color: #ccdddd;
  }
  .hud-top-center {
    position: absolute;
    top: 0.4rem;
    left: 50%;
    transform: translateX(-50%);
    color: #889999;
  }
  .hud-top-right {
    position: absolute;
    top: 0.4rem;
    right: 0.5rem;
    text-align: right;
    color: #889999;
  }
  .hud-dim {
    font-size: 0.75rem;
    color: #556666;
  }

  /* Player status */
  .hud-player-status {
    position: absolute;
    bottom: 2rem;
    left: 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }
  .hud-hp-row {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  .hud-hp-label {
    color: #667;
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 1px;
    width: 1.5rem;
  }
  .hud-hp-track {
    width: 8rem;
    height: 6px;
    background: #1a1a2e;
    border-radius: 3px;
    overflow: hidden;
    border: 1px solid #223;
  }
  .hud-hp-fill {
    height: 100%;
    border-radius: 2px;
    transition: width 0.2s ease;
  }
  .hud-hp-text {
    color: #889;
    font-size: 0.7rem;
    min-width: 3.5rem;
  }
  .hud-conditions {
    display: flex;
    gap: 0.3rem;
    flex-wrap: wrap;
  }
  .hud-condition {
    font-size: 0.6rem;
    color: #c9a84e;
    background: rgba(201, 168, 78, 0.1);
    border: 1px solid rgba(201, 168, 78, 0.2);
    border-radius: 2px;
    padding: 0 0.3rem;
  }

  .hud-bottom {
    position: absolute;
    bottom: 0.5rem;
    left: 50%;
    transform: translateX(-50%);
    font-size: 0.75rem;
    color: #556666;
    white-space: nowrap;
  }
</style>
