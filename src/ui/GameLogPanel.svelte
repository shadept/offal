<script lang="ts">
  import './hud.css';
  import { hudStore } from './hudStore.svelte';
  import { gameLog, type LogEntry } from './gameLog';

  let entries = $state<readonly LogEntry[]>(gameLog.getAll());
  let scrollEl: HTMLDivElement;
  let panelEl: HTMLDivElement;
  let autoScroll = $state(true);
  let expanded = $state(false);

  const CRITICAL_PATTERNS = [
    /severed/i, /unconscious/i, /bleeding/i, /on fire/i,
    /died/i, /killed/i, /destroyed/i,
  ];

  function isCritical(entry: LogEntry): boolean {
    if (entry.category === 'death') return true;
    return CRITICAL_PATTERNS.some(p => p.test(entry.text));
  }

  const CATEGORY_COLORS: Record<string, string> = {
    combat: '#c9a84e',
    environment: '#cc8833',
    death: '#e94560',
    system: '#556666',
  };

  function entryColor(entry: LogEntry): string {
    if (isCritical(entry)) return '#e94560';
    return CATEGORY_COLORS[entry.category] ?? '#778888';
  }

  function entryOpacity(entry: LogEntry): number {
    const age = hudStore.currentTurn - entry.turn;
    if (age <= 0) return 1;
    if (age === 1) return 0.6;
    if (age === 2) return 0.4;
    return 0.25;
  }

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

  function toggleExpand() {
    expanded = !expanded;
  }

  function onWindowClick(e: MouseEvent) {
    if (expanded && panelEl && !panelEl.contains(e.target as Node)) {
      expanded = false;
    }
  }

  function onWindowKeydown(e: KeyboardEvent) {
    if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;
    if (e.key === 'l' || e.key === 'L') {
      expanded = !expanded;
    } else if (e.key === 'Escape' && expanded) {
      expanded = false;
    }
  }
</script>

<svelte:window onclick={onWindowClick} onkeydown={onWindowKeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="hud-panel hud-panel-br log-panel"
  class:log-expanded={expanded}
  class:hud-intro-br={hudStore.intro}
  bind:this={panelEl}
  onclick={toggleExpand}
>
  <div class="log-scroll" bind:this={scrollEl} onscroll={onScroll}>
    {#each entries as entry, i (i)}
      {@const critical = isCritical(entry)}
      <div
        class="log-entry"
        class:log-critical={critical}
        style="opacity: {entryOpacity(entry)};"
      >
        <span class="log-turn">T{entry.turn}</span>
        <span
          class="log-text"
          class:log-critical-text={critical}
          style="color: {entryColor(entry)}"
        >{critical ? entry.text.toUpperCase() : entry.text}</span>
      </div>
    {/each}
    {#if entries.length === 0}
      <div class="log-empty">No events yet</div>
    {/if}
  </div>
</div>

<style>
  .log-panel {
    width: 24rem;
    height: 10rem;
    transition: height 0.25s cubic-bezier(0.16, 1, 0.3, 1),
                width 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    cursor: pointer;
    display: flex;
    flex-direction: column;
  }
  .log-expanded {
    height: 40vh;
    width: 30rem;
    cursor: default;
  }

  .log-scroll {
    flex: 1;
    overflow-y: auto;
    padding: 0.4rem 0.5rem;
    mask-image: linear-gradient(to bottom, transparent 0%, black 12%);
    -webkit-mask-image: linear-gradient(to bottom, transparent 0%, black 12%);
  }
  .log-scroll::-webkit-scrollbar { width: 3px; }
  .log-scroll::-webkit-scrollbar-track { background: transparent; }
  .log-scroll::-webkit-scrollbar-thumb { background: rgba(78, 201, 176, 0.15); border-radius: 2px; }

  .log-entry {
    display: flex;
    gap: 0.5rem;
    line-height: 1.5;
    font-size: 0.8rem;
    transition: opacity 0.3s ease;
  }
  .log-turn {
    color: #334455;
    flex-shrink: 0;
    min-width: 2.5rem;
    text-align: right;
    font-size: 0.75rem;
  }
  .log-text {
    color: #778888;
  }

  .log-critical-text {
    font-weight: bold;
    text-shadow: 0 0 6px rgba(233, 69, 96, 0.4);
    animation: critical-flash 0.6s ease-out;
  }
  @keyframes critical-flash {
    0%   { text-shadow: 0 0 12px rgba(233, 69, 96, 0.8); }
    100% { text-shadow: 0 0 6px rgba(233, 69, 96, 0.4); }
  }

  .log-empty {
    color: #334;
    font-style: italic;
    font-size: 0.8rem;
    padding-top: 1rem;
    text-align: center;
  }
</style>
