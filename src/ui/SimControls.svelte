<script lang="ts">
  import type { SandboxStore } from './sandboxStore.svelte';

  let { store }: { store: SandboxStore } = $props();
  let seedInput = $state('');
</script>

<!-- Ship Generation -->
<div class="sb-section">
  <div class="sb-section-title">Ship Generation</div>

  <div class="sb-seed-row">
    <input
      type="text"
      class="sb-seed-input"
      placeholder="Seed (blank = random)"
      bind:value={seedInput}
    />
  </div>

  <button class="sb-gen-btn" onclick={() => {
    store.ctrl.generateNewShip(seedInput || undefined);
    seedInput = '';
  }}>
    New Ship
  </button>
</div>

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
    <button class="sb-tool-btn" onclick={() => {
      if (store.selectedTile) {
        store.ctrl.igniteTile(store.selectedTile.x, store.selectedTile.y);
      }
    }}>Ignite</button>
    <button class="sb-tool-btn" disabled>
      Charge <span class="sb-phase-label">(Icebox)</span>
    </button>
    <button class="sb-tool-btn" disabled>
      Breach <span class="sb-phase-label">(Icebox)</span>
    </button>
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
  .sb-seed-row {
    margin-bottom: 6px;
  }
  .sb-seed-input {
    width: 100%;
    background: #0a0a12;
    border: 1px solid #334;
    color: #ccdddd;
    font-family: monospace;
    font-size: 11px;
    padding: 4px 8px;
    border-radius: 2px;
    box-sizing: border-box;
  }
  .sb-seed-input::placeholder { color: #445; }
  .sb-gen-btn {
    background: #2a1a3e;
    border: 1px solid #5a3a7a;
    color: #cc99ff;
    font-family: monospace;
    font-size: 11px;
    padding: 6px 10px;
    cursor: pointer;
    border-radius: 2px;
    width: 100%;
    font-weight: bold;
  }
  .sb-gen-btn:hover { background: #3a2a5e; }
</style>
