<script lang="ts">
  import { contextMenuStore } from './contextMenuStore';

  let tick = $state(0);
  contextMenuStore.onChange(() => { tick++; });

  let open = $derived.by(() => { tick; return contextMenuStore.open; });
  let x = $derived.by(() => { tick; return contextMenuStore.x; });
  let y = $derived.by(() => { tick; return contextMenuStore.y; });
  let actions = $derived.by(() => { tick; return contextMenuStore.actions; });

  function handleAction(callback: () => void) {
    callback();
    contextMenuStore.close();
  }

  function handleBackdropClick() {
    contextMenuStore.close();
  }
</script>

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="ctx-backdrop" onclick={handleBackdropClick}></div>
  <div class="ctx-menu" style="left: {x}px; top: {y}px;">
    {#each actions as action}
      <button
        class="ctx-action"
        class:ctx-disabled={!action.enabled}
        disabled={!action.enabled}
        onclick={() => handleAction(action.callback)}
      >
        {action.label}
      </button>
    {/each}
  </div>
{/if}

<style>
  .ctx-backdrop {
    position: fixed;
    inset: 0;
    z-index: 2050;
  }
  .ctx-menu {
    position: fixed;
    z-index: 2100;
    background: rgba(10, 10, 18, 0.96);
    border: 1px solid #445;
    border-radius: 3px;
    font-family: monospace;
    font-size: 0.7rem;
    min-width: 120px;
    overflow: hidden;
  }
  .ctx-action {
    display: block;
    width: 100%;
    background: none;
    border: none;
    border-bottom: 1px solid #222;
    color: #aabbbb;
    font-family: monospace;
    font-size: 0.7rem;
    padding: 0.4rem 0.6rem;
    cursor: pointer;
    text-align: left;
  }
  .ctx-action:last-child {
    border-bottom: none;
  }
  .ctx-action:hover:not(:disabled) {
    background: rgba(78, 201, 176, 0.1);
    color: #ccdddd;
  }
  .ctx-disabled {
    color: #445;
    cursor: default;
  }
</style>
