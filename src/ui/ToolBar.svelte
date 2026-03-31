<script lang="ts">
  import type { SandboxStore } from './sandboxStore.svelte';
  import type { SandboxTool } from '../sandbox/types';

  let { store }: { store: SandboxStore } = $props();

  const toolDefs: { id: SandboxTool; label: string; disabled?: boolean; phase?: string }[] = [
    { id: 'inspect', label: 'Inspect' },
    { id: 'tile_paint', label: 'Paint Tile' },
    { id: 'entity_spawn', label: 'Spawn Entity' },
    { id: 'fluid_place', label: 'Place Fluid', disabled: true, phase: '4' },
    { id: 'gas_place', label: 'Place Gas', disabled: true, phase: '4' },
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
    {:else if store.activeTool === 'fluid_place' || store.activeTool === 'gas_place'}
      <div class="sb-placeholder">Coming in Phase 4.</div>
    {/if}
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
  .sb-tool-btn:hover { background: #252540; border-color: #558; }
  .sb-tool-btn.active { background: #2a2a4e; border-color: #e94560; color: #ccdddd; }
  .sb-tool-btn:disabled { opacity: 0.35; cursor: not-allowed; }
  .sb-tool-options { min-height: 28px; }
  .sb-paint-types {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .sb-paint-btn {
    background: #1a1a2e;
    border: 1px solid #334;
    color: #889999;
    font-family: monospace;
    font-size: 10px;
    padding: 3px 6px;
    cursor: pointer;
    border-radius: 2px;
  }
  .sb-paint-btn:hover { background: #252540; }
  .sb-paint-btn.active { border-color: #e94560; color: #ccdddd; }
  .sb-phase-label {
    font-size: 10px;
    color: #445;
    margin-left: 4px;
  }
  .sb-placeholder {
    color: #445;
    font-style: italic;
  }
</style>
