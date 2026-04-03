<script lang="ts">
  import type { SandboxStore } from './sandboxStore.svelte';
  import ComponentSection from './ComponentSection.svelte';

  let { store }: { store: SandboxStore } = $props();

  let tileInfo = $derived(
    store.selectedTile
      ? store.ctrl.getTileInfo(store.selectedTile.x, store.selectedTile.y)
      : null
  );

  let entityInfos = $derived(
    store.selectedEntities
      .map(eid => store.ctrl.getEntityInfo(eid))
      .filter((info): info is NonNullable<typeof info> => info !== null)
  );

  let entityInspectors = $derived(
    store.selectedEntities.map(eid => ({
      eid,
      inspectors: store.ctrl.debugRegistry.getFor(store.ctrl.getWorld(), eid),
    }))
  );

  // Track which entities are expanded (by EID)
  let expandedEntities = $state(new Set<number>());

  function toggleEntity(eid: number) {
    const next = new Set(expandedEntities);
    if (next.has(eid)) next.delete(eid);
    else next.add(eid);
    expandedEntities = next;
  }

  function formatMap(obj: Record<string, number>): string {
    const entries = Object.entries(obj);
    if (entries.length === 0) return 'None';
    return entries.map(([id, c]) => `${id}: ${c.toFixed(2)}`).join(', ');
  }

  function entityLabel(info: { eid: number; isPlayer: boolean }): string {
    return `${info.isPlayer ? 'Player' : 'NPC'} EID ${info.eid}`;
  }
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
      <div><span class="sb-inspect-label">Fluids: </span><span class="sb-inspect-value">{formatMap(tileInfo.fluids)}</span></div>
      <div><span class="sb-inspect-label">Gases: </span><span class="sb-inspect-value">{formatMap(tileInfo.gases)}</span></div>
      <div><span class="sb-inspect-label">Temperature: </span><span class="sb-inspect-value">{tileInfo.temperature}</span></div>
      <div><span class="sb-inspect-label">States: </span><span class="sb-inspect-value">{tileInfo.surfaceStates.length > 0 ? tileInfo.surfaceStates.join(', ') : 'None'}</span></div>
    </div>
  {/if}

  {#each entityInfos as entityInfo, i (entityInfo.eid)}
    {@const entry = entityInspectors[i]}
    {@const expanded = expandedEntities.has(entityInfo.eid)}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="sb-entity-header" onclick={() => toggleEntity(entityInfo.eid)}>
      <span class="sb-entity-toggle">{expanded ? '\u25be' : '\u25b8'}</span>
      <span class="sb-entity-title">Entity ({entityLabel(entityInfo)})</span>
    </div>

    {#if expanded}
      {#each entry.inspectors as inspector (inspector.name)}
        <ComponentSection {store} {inspector} eid={entityInfo.eid} />
      {/each}

      <button
        class="sb-delete-btn"
        disabled={entityInfo.isPlayer}
        onclick={() => store.ctrl.deleteEntity(entityInfo.eid)}
      >Delete Entity</button>
    {/if}
  {/each}

  {#if entityInfos.length === 0 && tileInfo}
    <div class="sb-no-selection" style="margin-top: 8px">No entities on this tile</div>
  {/if}

  {#if store.ctrl.hasAnyOverlays()}
    <button
      class="sb-clear-btn"
      onclick={() => store.ctrl.clearAllOverlays()}
    >Clear All Overlays</button>
  {/if}
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
  .sb-inspect {
    font-size: 0.7rem;
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
  .sb-entity-header {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    cursor: pointer;
    padding: 0.3rem 0 0.15rem;
    margin-top: 6px;
    border-top: 1px solid #1a1a2e;
  }
  .sb-entity-toggle {
    font-size: 0.6rem;
    color: #556666;
    width: 0.65rem;
  }
  .sb-entity-title {
    font-size: 0.65rem;
    color: #aabbbb;
    text-transform: uppercase;
    letter-spacing: 1px;
    font-weight: bold;
  }
  .sb-delete-btn {
    background: #3a1520;
    border: 1px solid #e94560;
    color: #e94560;
    font-family: monospace;
    font-size: 0.7rem;
    padding: 0.2rem 0.6rem;
    cursor: pointer;
    border-radius: 2px;
    margin-top: 0.35rem;
  }
  .sb-delete-btn:hover { background: #5a2030; }
  .sb-delete-btn:disabled { opacity: 0.35; cursor: not-allowed; }
  .sb-clear-btn {
    background: #1a1a2e;
    border: 1px solid #334;
    color: #889999;
    font-family: monospace;
    font-size: 0.7rem;
    padding: 0.25rem 0.5rem;
    cursor: pointer;
    border-radius: 2px;
    margin-top: 0.35rem;
    width: 100%;
  }
  .sb-clear-btn:hover { background: #252540; border-color: #558; }
</style>
