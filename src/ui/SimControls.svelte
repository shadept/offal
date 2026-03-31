<script lang="ts">
  import type { SandboxStore } from './sandboxStore.svelte';

  let { store }: { store: SandboxStore } = $props();
</script>

<!-- Simulation -->
<div class="sb-section">
  <div class="sb-section-title">Simulation</div>

  <button class="sb-sim-btn" onclick={() => store.ctrl.advanceTurn()}>
    Advance Turn (N)
  </button>

  <div class="sb-sim-row">
    <label class="sb-checkbox-label">
      <input type="checkbox" checked={store.autoPlay}
        onchange={(e) => store.ctrl.setAutoPlay(e.currentTarget.checked)} />
      Auto-play
    </label>
  </div>

  <div class="sb-slider-row">
    Speed
    <input type="range" min="1" max="10" value={store.autoPlaySpeed}
      oninput={(e) => store.ctrl.setAutoPlaySpeed(parseInt(e.currentTarget.value, 10))} />
    <span class="sb-slider-value">{store.autoPlaySpeed} tps</span>
  </div>

  <div class="sb-sim-row">
    <label class="sb-checkbox-label">
      <input type="checkbox" checked={store.revealAll}
        onchange={(e) => store.ctrl.setRevealAll(e.currentTarget.checked)} />
      Reveal All
    </label>
  </div>

  <div class="sb-sim-row">
    <label class="sb-checkbox-label">
      <input type="checkbox" checked={store.aiOnly}
        onchange={(e) => store.ctrl.setAiOnly(e.currentTarget.checked)} />
      AI Only
    </label>
  </div>
</div>

<!-- Event Triggers -->
<div class="sb-section">
  <div class="sb-section-title">Event Triggers</div>
  <div class="sb-tools">
    {#each ['Fire', 'Charge', 'Breach'] as name}
      <button class="sb-tool-btn" disabled>
        {name} <span class="sb-phase-label">(Phase 4)</span>
      </button>
    {/each}
  </div>
</div>

<style>
  .sb-section {
    padding: 8px 12px;
    border-bottom: 1px solid #1a1a2e;
  }
  .sb-section-title {
    font-size: 10px;
    color: #556666;
    text-transform: uppercase;
    letter-spacing: 1px;
    margin-bottom: 6px;
  }
  .sb-sim-btn {
    background: #1a1a2e;
    border: 1px solid #334;
    color: #889999;
    font-family: monospace;
    font-size: 11px;
    padding: 4px 10px;
    cursor: pointer;
    border-radius: 2px;
    width: 100%;
  }
  .sb-sim-btn:hover { background: #252540; }
  .sb-sim-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;
  }
  .sb-checkbox-label {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    font-size: 11px;
  }
  .sb-slider-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .sb-slider-row input[type="range"] {
    flex: 1;
    accent-color: #e94560;
  }
  .sb-slider-value {
    color: #ccdddd;
    min-width: 32px;
    text-align: right;
  }
  .sb-tools {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .sb-tool-btn {
    background: #1a1a2e;
    border: 1px solid #334;
    color: #889999;
    font-family: monospace;
    font-size: 11px;
    padding: 4px 8px;
    cursor: pointer;
    border-radius: 2px;
  }
  .sb-tool-btn:disabled { opacity: 0.35; cursor: not-allowed; }
  .sb-phase-label {
    font-size: 10px;
    color: #445;
    margin-left: 4px;
  }
</style>
