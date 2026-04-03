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
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid #1a1a2e;
  }
  .sb-section-title {
    font-size: 0.65rem;
    color: #556666;
    text-transform: uppercase;
    letter-spacing: 1px;
    margin-bottom: 0.35rem;
  }
  .sb-sim-btn {
    background: #1a1a2e;
    border: 1px solid #334;
    color: #889999;
    font-family: monospace;
    font-size: 0.7rem;
    padding: 0.25rem 0.6rem;
    cursor: pointer;
    border-radius: 2px;
    width: 100%;
  }
  .sb-sim-btn:hover { background: #252540; }
  .sb-sim-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.25rem;
  }
  .sb-checkbox-label {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    cursor: pointer;
    font-size: 0.7rem;
  }
  .sb-slider-row {
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }
  .sb-slider-row input[type="range"] {
    flex: 1;
    accent-color: #e94560;
  }
  .sb-slider-value {
    color: #ccdddd;
    min-width: 2rem;
    text-align: right;
  }
  .sb-tools {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }
  .sb-tool-btn {
    background: #1a1a2e;
    border: 1px solid #334;
    color: #889999;
    font-family: monospace;
    font-size: 0.7rem;
    padding: 0.25rem 0.5rem;
    cursor: pointer;
    border-radius: 2px;
  }
  .sb-tool-btn:disabled { opacity: 0.35; cursor: not-allowed; }
  .sb-phase-label {
    font-size: 0.65rem;
    color: #445;
    margin-left: 0.25rem;
  }
  .sb-seed-row {
    margin-bottom: 0.35rem;
  }
  .sb-seed-input {
    width: 100%;
    background: #0a0a12;
    border: 1px solid #334;
    color: #ccdddd;
    font-family: monospace;
    font-size: 0.7rem;
    padding: 0.25rem 0.5rem;
    border-radius: 2px;
  }
  .sb-seed-input::placeholder { color: #445; }
  .sb-gen-btn {
    background: #2a1a3e;
    border: 1px solid #5a3a7a;
    color: #cc99ff;
    font-family: monospace;
    font-size: 0.7rem;
    padding: 0.35rem 0.6rem;
    cursor: pointer;
    border-radius: 2px;
    width: 100%;
    font-weight: bold;
  }
  .sb-gen-btn:hover { background: #3a2a5e; }
</style>
