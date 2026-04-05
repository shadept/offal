<script lang="ts">
  import './hud.css';
  import { hudStore } from './hudStore.svelte';

  let hpRatio = $derived(hudStore.maxHp > 0 ? hudStore.hp / hudStore.maxHp : 0);
  let hpColor = $derived(hpRatio > 0.6 ? '#4ec9b0' : hpRatio > 0.3 ? '#c9a84e' : '#e94560');

  // Damage flash — track HP drops
  let damageFlash = $state(false);
  let damageGhostWidth = $state(0);
  let panelEl: HTMLDivElement;

  let lastSeenHp = $state(-1);

  $effect(() => {
    const hp = hudStore.hp;
    const prevHp = hudStore.prevHp;
    if (hp < prevHp && prevHp > 0 && lastSeenHp !== hp) {
      lastSeenHp = hp;
      // Show ghost segment where HP was lost
      damageGhostWidth = hudStore.maxHp > 0 ? ((prevHp - hp) / hudStore.maxHp) * 100 : 0;
      damageFlash = true;

      // Pulse the panel border
      if (panelEl) {
        panelEl.classList.remove('hud-panel-damage');
        void panelEl.offsetWidth;
        panelEl.classList.add('hud-panel-damage');
      }

      setTimeout(() => {
        damageFlash = false;
        damageGhostWidth = 0;
      }, 400);
    }
  });

  // Capacity helpers
  type CapState = 'healthy' | 'impaired' | 'critical' | 'failed';

  function capState(value: number): CapState {
    if (value <= 0) return 'failed';
    if (value < 20) return 'critical';
    if (value < 60) return 'impaired';
    return 'healthy';
  }

  function capColor(state: CapState): string {
    switch (state) {
      case 'healthy': return '#4ec9b0';
      case 'impaired': return '#c9a84e';
      case 'critical': return '#e94560';
      case 'failed': return '#e94560';
    }
  }

  let mobState = $derived(capState(hudStore.mobility));
  let manState = $derived(capState(hudStore.manipulation));
  let conState = $derived(capState(hudStore.consciousness));
  let cirState = $derived(capState(hudStore.circulation));

  let anyDegraded = $derived(
    mobState !== 'healthy' || manState !== 'healthy' ||
    conState !== 'healthy' || cirState !== 'healthy'
  );
</script>

<div class="hud-panel hud-panel-bl" class:hud-intro-bl={hudStore.intro} bind:this={panelEl}>
  <!-- HP bar -->
  <div class="hp-row">
    <span class="hp-label">HP</span>
    <div class="hp-track">
      {#if damageFlash}
        <div
          class="hp-ghost"
          style="width: {(hpRatio + damageGhostWidth / 100) * 100}%; left: 0;"
        ></div>
      {/if}
      <div class="hp-fill" style="width: {hpRatio * 100}%; background: {hpColor};"></div>
    </div>
    <span class="hp-text">{hudStore.hp}/{hudStore.maxHp}</span>
  </div>

  <!-- Capacity row — hidden when all healthy -->
  {#if anyDegraded}
    <div class="cap-row">
      <span class="cap" style="color: {capColor(mobState)}">MOB</span>
      <span class="cap" style="color: {capColor(manState)}">MAN</span>
      <span class="cap" style="color: {capColor(conState)}">CON</span>
      <span class="cap" style="color: {capColor(cirState)}">CIR</span>
    </div>
  {/if}
</div>

<style>
  .hp-row {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  .hp-label {
    color: #556666;
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 1px;
    width: 1.8rem;
    flex-shrink: 0;
  }
  .hp-track {
    position: relative;
    width: 10rem;
    height: 8px;
    background: rgba(26, 26, 46, 0.6);
    border-radius: 4px;
    overflow: hidden;
    border: 1px solid rgba(51, 68, 68, 0.3);
  }
  .hp-fill {
    position: relative;
    height: 100%;
    border-radius: 3px;
    transition: width 0.25s ease;
    z-index: 1;
  }
  .hp-ghost {
    position: absolute;
    top: 0;
    height: 100%;
    background: rgba(233, 69, 96, 0.6);
    border-radius: 2px;
    animation: ghost-fade 0.4s ease-out forwards;
    z-index: 0;
  }
  @keyframes ghost-fade {
    0%   { opacity: 1; background: rgba(255, 255, 255, 0.7); }
    30%  { background: rgba(233, 69, 96, 0.6); }
    100% { opacity: 0; }
  }
  .hp-text {
    color: #778888;
    font-size: 0.8rem;
    min-width: 3.5rem;
    flex-shrink: 0;
  }

  .cap-row {
    display: flex;
    gap: 0.8rem;
    margin-top: 0.35rem;
    animation: cap-fade-in 0.3s ease;
  }
  .cap {
    font-size: 0.75rem;
    font-weight: bold;
    letter-spacing: 0.5px;
    transition: color 0.3s ease;
  }
  @keyframes cap-fade-in {
    from { opacity: 0; transform: translateY(4px); }
    to   { opacity: 1; transform: translateY(0); }
  }
</style>
