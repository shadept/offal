<script lang="ts">
  import type { SandboxStore } from './sandboxStore.svelte';
  import type { SandboxTool } from '../sandbox/types';

  let { store }: { store: SandboxStore } = $props();

  const toolDefs: { id: SandboxTool; label: string; disabled?: boolean; phase?: string }[] = [
    { id: 'inspect', label: 'Inspect' },
    { id: 'tile_paint', label: 'Paint Tile' },
    { id: 'entity_spawn', label: 'Spawn Entity' },
    { id: 'fluid_place', label: 'Place Fluid' },
    { id: 'gas_place', label: 'Place Gas' },
  ];
</script>

<!-- Tools -->
<div class="sb-section">
  <div class="sb-section-title">Tools</div>
  <div class="sb-tools">
    {#each toolDefs as def}
      <button
        class="sb-tool-btn"
        class:active={store.activeTool === def.id}
        disabled={def.disabled}
        onclick={() => { if (!def.disabled) store.ctrl.setTool(def.id); }}
      >
        {def.label}
        {#if def.phase}<span class="sb-phase-label">(Phase {def.phase})</span>{/if}
      </button>
    {/each}
  </div>
</div>

<!-- Tool options -->
<div class="sb-section">
  <div class="sb-tool-options">
    {#if store.activeTool === 'tile_paint'}
      <div class="sb-paint-types">
        {#each store.ctrl.getPaintableTiles() as t}
          <button
            class="sb-paint-btn"
            class:active={store.paintTileIndex === t.index}
            onclick={() => store.ctrl.setPaintType(t.index)}
          >{t.name}</button>
        {/each}
      </div>
    {:else if store.activeTool === 'entity_spawn'}
      <div class="sb-paint-types">
        {#each store.ctrl.getSpawnableSpecies() as sp}
          <button
            class="sb-paint-btn"
            class:active={store.selectedSpeciesId === sp.id}
            title={sp.description}
            onclick={() => store.ctrl.setSelectedSpecies(sp.id)}
          >{sp.name}</button>
        {/each}
      </div>
    {:else if store.activeTool === 'fluid_place'}
      <div class="sb-paint-types">
        {#each store.ctrl.getPlaceableFluids() as f}
          <button
            class="sb-paint-btn"
            class:active={store.ctrl.selectedFluidId === f.id}
            onclick={() => store.ctrl.setSelectedFluid(f.id)}
          >{f.name}</button>
        {/each}
      </div>
    {:else if store.activeTool === 'gas_place'}
      <div class="sb-paint-types">
        {#each store.ctrl.getPlaceableGases() as g}
          <button
            class="sb-paint-btn"
            class:active={store.ctrl.selectedGasId === g.id}
            onclick={() => store.ctrl.setSelectedGas(g.id)}
          >{g.name}</button>
        {/each}
      </div>
    {/if}
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
  .sb-tool-btn:hover { background: #252540; border-color: #558; }
  .sb-tool-btn.active { background: #2a2a4e; border-color: #e94560; color: #ccdddd; }
  .sb-tool-btn:disabled { opacity: 0.35; cursor: not-allowed; }
  .sb-tool-options { min-height: 1.75rem; }
  .sb-paint-types {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }
  .sb-paint-btn {
    background: #1a1a2e;
    border: 1px solid #334;
    color: #889999;
    font-family: monospace;
    font-size: 0.65rem;
    padding: 0.2rem 0.4rem;
    cursor: pointer;
    border-radius: 2px;
  }
  .sb-paint-btn:hover { background: #252540; }
  .sb-paint-btn.active { border-color: #e94560; color: #ccdddd; }
  .sb-phase-label {
    font-size: 0.65rem;
    color: #445;
    margin-left: 0.25rem;
  }
</style>
