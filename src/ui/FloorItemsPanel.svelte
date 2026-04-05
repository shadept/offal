<script lang="ts">
  import './hud.css';
  import { hudStore } from './hudStore.svelte';

  const MAX_VISIBLE = 4;
  let overflow = $derived(hudStore.floorItems.length > MAX_VISIBLE ? hudStore.floorItems.length - MAX_VISIBLE : 0);
  let visibleItems = $derived(hudStore.floorItems.slice(0, MAX_VISIBLE));
</script>

{#if hudStore.floorItems.length > 0}
  <div class="floor-panel hud-panel hud-panel-bl floor-pos" class:hud-intro-bl={hudStore.intro}>
    {#each visibleItems as thing, i (thing.eid)}
      <div
        class="floor-item"
        class:floor-selected={hudStore.floorSelectedIndex === i}
        class:floor-corpse={thing.kind === 'corpse'}
      >
        <span class="floor-marker">{thing.kind === 'corpse' ? '†' : '♦'}</span>
        <span class="floor-name">{thing.name}</span>
      </div>
      {#if i < visibleItems.length - 1}
        <div class="floor-divider"></div>
      {/if}
    {/each}
    {#if overflow > 0}
      <div class="floor-overflow">+{overflow} more</div>
    {/if}
    <div class="floor-hint">[E]</div>
  </div>
{/if}

<style>
  .floor-pos {
    position: fixed;
    bottom: 3.2rem;
    left: 0;
    clip-path: polygon(0% 0%, 94% 0%, 100% 40%, 100% 100%, 0% 100%);
    padding: 0.4rem 1.5rem 0.4rem 0.8rem;
    min-width: 12rem;
  }

  .floor-item {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.75rem;
    color: #667777;
    padding: 0.15rem 0;
    transition: color 0.15s ease, opacity 0.15s ease;
    opacity: 0.7;
  }
  .floor-selected {
    color: #ccdddd;
    opacity: 1;
  }
  .floor-corpse {
    color: #887766;
  }
  .floor-corpse.floor-selected {
    color: #ccbbaa;
  }

  .floor-marker {
    flex-shrink: 0;
    width: 0.8rem;
    text-align: center;
  }
  .floor-name {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .floor-divider {
    height: 1px;
    background: rgba(78, 201, 176, 0.06);
    margin: 0.05rem 0;
  }

  .floor-overflow {
    font-size: 0.65rem;
    color: #556666;
    padding-top: 0.1rem;
  }

  .floor-hint {
    position: absolute;
    right: 0.7rem;
    bottom: 0.25rem;
    font-size: 0.65rem;
    color: #445566;
  }
</style>
