<script lang="ts">
  import { gameLog, type LogEntry } from './gameLog';

  let entries = $state<readonly LogEntry[]>(gameLog.getAll());
  let scrollEl: HTMLDivElement;
  let autoScroll = $state(true);

  const CATEGORY_COLORS: Record<string, string> = {
    combat: '#e94560',
    environment: '#cc8833',
    death: '#aa4488',
    system: '#556666',
  };

  gameLog.onChange(() => {
    entries = gameLog.getAll();
    if (autoScroll) {
      requestAnimationFrame(() => {
        if (scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight;
      });
    }
  });

  function onScroll() {
    if (!scrollEl) return;
    const atBottom = scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight < 24;
    autoScroll = atBottom;
  }
</script>

<div class="log-panel">
  <div class="log-header">
    <span class="log-title">Log</span>
    <button class="log-clear" onclick={() => gameLog.clear()}>clear</button>
  </div>
  <div class="log-scroll" bind:this={scrollEl} onscroll={onScroll}>
    {#each entries as entry, i (i)}
      <div class="log-entry">
        <span class="log-turn">T{entry.turn}</span>
        <span class="log-text" style="color: {CATEGORY_COLORS[entry.category] ?? '#889999'}">{entry.text}</span>
      </div>
    {/each}
    {#if entries.length === 0}
      <div class="log-empty">No events yet</div>
    {/if}
  </div>
</div>

<style>
  .log-panel {
    position: fixed;
    bottom: 2rem;
    left: 0;
    width: 22rem;
    height: 12rem;
    background: rgba(10, 10, 18, 0.92);
    border-right: 1px solid #1a1a2e;
    border-top: 1px solid #1a1a2e;
    font-family: monospace;
    font-size: 0.7rem;
    z-index: 6;
    display: flex;
    flex-direction: column;
  }
  .log-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.25rem 0.5rem;
    border-bottom: 1px solid #1a1a2e;
    flex-shrink: 0;
  }
  .log-title {
    color: #556666;
    text-transform: uppercase;
    letter-spacing: 1px;
    font-size: 0.6rem;
  }
  .log-clear {
    background: none;
    border: 1px solid #334;
    color: #556666;
    font-family: monospace;
    font-size: 0.6rem;
    padding: 0.05rem 0.3rem;
    cursor: pointer;
    border-radius: 2px;
  }
  .log-clear:hover { color: #889999; border-color: #558; }
  .log-scroll {
    flex: 1;
    overflow-y: auto;
    padding: 0.25rem 0.5rem;
  }
  .log-scroll::-webkit-scrollbar { width: 4px; }
  .log-scroll::-webkit-scrollbar-track { background: transparent; }
  .log-scroll::-webkit-scrollbar-thumb { background: #334; border-radius: 2px; }
  .log-entry {
    display: flex;
    gap: 0.4rem;
    line-height: 1.5;
  }
  .log-turn {
    color: #334455;
    flex-shrink: 0;
    min-width: 2.2rem;
    text-align: right;
  }
  .log-text {
    color: #889999;
  }
  .log-empty {
    color: #334;
    font-style: italic;
    padding-top: 1rem;
    text-align: center;
  }
</style>
