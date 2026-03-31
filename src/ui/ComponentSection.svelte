<script lang="ts">
  import type { SandboxStore } from './sandboxStore.svelte';
  import type { ComponentInspector } from '../sandbox/debugOverlays';

  let { store, inspector, eid }: {
    store: SandboxStore;
    inspector: ComponentInspector;
    eid: number;
  } = $props();

  let collapsed = $state(false);

  function commitField(label: string, value: string) {
    inspector.setField?.(store.ctrl.getWorld(), eid, label, value);
    store.ctrl.emit('field_edited', { eid, component: inspector.name, label });
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
  }
</script>

<!-- Section header -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="sb-comp-header" onclick={() => collapsed = !collapsed}>
  <span class="sb-comp-toggle">{collapsed ? '\u25b8' : '\u25be'}</span>
  <span class="sb-comp-name">{inspector.name}</span>
</div>

<!-- Debug overlay pin toggle -->
{#if inspector.hasOverlay}
  <label class="sb-debug-label">
    <input
      type="checkbox"
      checked={store.ctrl.isOverlayEnabled(inspector.name)}
      onchange={() => store.ctrl.toggleOverlay(inspector.name)}
    />
    pin debug overlay
  </label>
{/if}

<!-- Fields -->
{#if !collapsed}
  <div class="sb-comp-body">
    {#each inspector.getFields(store.ctrl.getWorld(), eid, store.ctrl.getMap()) as [label, value]}
      <div class="field-row">
        <span class="sb-inspect-label">{label}: </span>
        {#if inspector.editableFields?.has(label)}
          <input
            class="field-input"
            type="text"
            {value}
            onchange={(e) => commitField(label, e.currentTarget.value)}
            onkeydown={onKeydown}
          />
        {:else}
          <span class="sb-inspect-value">{value}</span>
        {/if}
      </div>
    {/each}
  </div>
{/if}

<style>
  .sb-comp-header {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    padding: 3px 0;
  }
  .sb-comp-toggle {
    font-size: 9px;
    color: #556666;
    width: 10px;
  }
  .sb-comp-name {
    font-size: 11px;
    color: #aabbbb;
    font-weight: bold;
  }
  .sb-comp-body {
    padding-left: 16px;
    margin-bottom: 2px;
  }
  .sb-debug-label {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 10px;
    color: #7799aa;
    cursor: pointer;
    margin-bottom: 2px;
    padding-left: 16px;
  }
  .sb-debug-label input {
    accent-color: #e94560;
  }
  .sb-inspect-label {
    color: #556666;
  }
  .sb-inspect-value {
    color: #ccdddd;
  }
  .field-row {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .field-input {
    background: #1a1a2e;
    border: 1px solid #334;
    color: #ccdddd;
    font-family: monospace;
    font-size: 11px;
    padding: 1px 4px;
    width: 60px;
    border-radius: 2px;
  }
  .field-input:focus {
    border-color: #e94560;
    outline: none;
  }
</style>
