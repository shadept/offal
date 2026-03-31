<script lang="ts">
  import type { SandboxStore } from './sandboxStore.svelte';
  import ComponentSection from './ComponentSection.svelte';

  let { store }: { store: SandboxStore } = $props();

  let tileInfo = $derived(
    store.selectedTile
      ? store.ctrl.getTileInfo(store.selectedTile.x, store.selectedTile.y)
      : null
  );

  let entityInfo = $derived(
    store.selectedEntity !== null
      ? store.ctrl.getEntityInfo(store.selectedEntity)
      : null
  );

  let inspectors = $derived(
    store.selectedEntity !== null
      ? store.ctrl.debugRegistry.getFor(store.ctrl.getWorld(), store.selectedEntity)
      : []
  );
</script>

<div class="sb-section">
  <div class="sb-section-title">Inspector</div>

  {#if !tileInfo}
    <div class="sb-no-selection">Click a tile to inspect</div>
  {:else}
    <!-- Tile info -->
    <div class="sb-section-title" style="margin-top: 0">Tile</div>
    <div class="sb-inspect">
      <div><span class="sb-inspect-label">Position: </span><span class="sb-inspect-value">({tileInfo.x}, {tileInfo.y})</span></div>
      <div><span class="sb-inspect-label">Tile: </span><span class="sb-inspect-value">{tileInfo.tileType}</span></div>
      <div><span class="sb-inspect-label">Material: </span><span class="sb-inspect-value">{tileInfo.materialName}</span></div>
      <div><span class="sb-inspect-label">Visibility: </span><span class="sb-inspect-value">{tileInfo.visibility}</span></div>
      <div><span class="sb-inspect-label">Light: </span><span class="sb-inspect-value">{tileInfo.light}</span></div>
      <div><span class="sb-inspect-label">Fluids: </span><span class="sb-inspect-value">N/A</span></div>
      <div><span class="sb-inspect-label">Gases: </span><span class="sb-inspect-value">N/A</span></div>
      <div><span class="sb-inspect-label">Temperature: </span><span class="sb-inspect-value">N/A</span></div>
    </div>
  {/if}

  {#if entityInfo}
    <!-- Entity info -->
    <div class="sb-section-title" style="margin-top: 8px">
      Entity ({entityInfo.isPlayer ? 'Player' : 'NPC'}) EID {entityInfo.eid}
    </div>

    {#each inspectors as inspector (inspector.name)}
      <ComponentSection {store} {inspector} eid={entityInfo.eid} />
    {/each}

    <button
      class="sb-delete-btn"
      disabled={entityInfo.isPlayer}
      onclick={() => store.ctrl.deleteEntity(entityInfo!.eid)}
    >Delete Entity</button>

    {#if store.ctrl.hasAnyOverlays()}
      <button
        class="sb-clear-btn"
        onclick={() => store.ctrl.clearAllOverlays()}
      >Clear All Overlays</button>
    {/if}
  {/if}
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
  .sb-inspect {
    font-size: 11px;
    line-height: 1.6;
  }
  .sb-inspect-label {
    color: #556666;
  }
  .sb-inspect-value {
    color: #ccdddd;
  }
  .sb-no-selection {
    color: #445;
    font-style: italic;
  }
  .sb-delete-btn {
    background: #3a1520;
    border: 1px solid #e94560;
    color: #e94560;
    font-family: monospace;
    font-size: 11px;
    padding: 3px 10px;
    cursor: pointer;
    border-radius: 2px;
    margin-top: 6px;
  }
  .sb-delete-btn:hover { background: #5a2030; }
  .sb-delete-btn:disabled { opacity: 0.35; cursor: not-allowed; }
  .sb-clear-btn {
    background: #1a1a2e;
    border: 1px solid #334;
    color: #889999;
    font-family: monospace;
    font-size: 11px;
    padding: 4px 8px;
    cursor: pointer;
    border-radius: 2px;
    margin-top: 6px;
    width: 100%;
  }
  .sb-clear-btn:hover { background: #252540; border-color: #558; }
</style>
