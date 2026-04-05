<script lang="ts">
  import { hudStore } from './hudStore.svelte';

  interface KeyBind { key: string; action: string; }

  const GAMEPLAY_KEYS: KeyBind[] = [
    { key: 'WASD / Arrows', action: 'Move' },
    { key: 'Space', action: 'Wait' },
    { key: 'E', action: 'Interact / Pick up' },
    { key: 'I', action: 'Inventory' },
    { key: 'B', action: 'Body' },
    { key: 'L', action: 'Expand log' },
    { key: '?', action: 'This overlay' },
  ];

  const SANDBOX_KEYS: KeyBind[] = [
    { key: 'Tab', action: 'Toggle sandbox' },
    { key: 'N', action: 'Advance turn' },
    { key: 'R', action: 'Reveal all' },
    { key: 'G', action: 'Ship graph' },
  ];

  let keys = $derived(hudStore.sandboxActive ? [...GAMEPLAY_KEYS, ...SANDBOX_KEYS] : GAMEPLAY_KEYS);

  function onKeydown(e: KeyboardEvent) {
    if (!hudStore.keysOpen) return;
    if (e.key !== '?' && e.key !== 'Shift') {
      hudStore.keysOpen = false;
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

{#if hudStore.keysOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="keys-backdrop" onclick={() => hudStore.keysOpen = false}>
    <div class="keys-panel" onclick={(e) => e.stopPropagation()}>
      <div class="keys-title">CONTROLS</div>
      <div class="keys-list">
        {#each keys as kb (kb.key)}
          <div class="keys-row">
            <span class="keys-key">{kb.key}</span>
            <span class="keys-action">{kb.action}</span>
          </div>
        {/each}
      </div>
      <div class="keys-dismiss">press any key to close</div>
    </div>
  </div>
{/if}

<style>
  .keys-backdrop {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.15);
  }

  .keys-panel {
    background: rgba(8, 8, 16, 0.6);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid rgba(78, 201, 176, 0.1);
    border-radius: 6px;
    padding: 1.2rem 1.6rem;
    font-family: monospace;
    min-width: 16rem;
  }

  .keys-title {
    color: #556666;
    font-size: 0.8rem;
    letter-spacing: 2px;
    margin-bottom: 1rem;
    text-align: center;
  }

  .keys-list {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .keys-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 2rem;
  }

  .keys-key {
    color: #4ec9b0;
    font-size: 0.85rem;
    min-width: 9rem;
  }

  .keys-action {
    color: #889999;
    font-size: 0.85rem;
    text-align: right;
  }

  .keys-dismiss {
    color: #445566;
    font-size: 0.7rem;
    text-align: center;
    margin-top: 0.8rem;
  }
</style>
