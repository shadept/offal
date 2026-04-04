<script lang="ts">
  import type { TooltipData } from './tooltipTypes';

  let {
    visible = false,
    x = 0,
    y = 0,
    data = null,
  }: {
    visible: boolean;
    x: number;
    y: number;
    data: TooltipData | null;
  } = $props();

  // Edge-clamp: keep tooltip within viewport
  let finalX = $derived.by(() => {
    const w = 260; // approx max tooltip width
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1920;
    return (x + w + 16 > vw) ? x - w - 8 : x + 16;
  });

  let finalY = $derived.by(() => {
    const h = 140; // approx max tooltip height
    const vh = typeof window !== 'undefined' ? window.innerHeight : 1080;
    return (y + h + 16 > vh) ? y - h - 8 : y + 16;
  });

  const CONDITION_ICONS: Record<string, string> = {
    bleeding: '\u{1FA78}',   // drop of blood
    burning: '\u{1F525}',    // fire
    oxidising: '\u{1F7E0}',  // orange circle
    infected: '\u{1F9A0}',   // microbe
    rejected: '\u{26A0}',    // warning
    sparking: '\u{26A1}',    // lightning
  };
</script>

{#if visible && data}
<div class="tt-root" style="left: {finalX}px; top: {finalY}px;">
  <div class="tt-header">
    {#if data.iconUrl}
      <img class="tt-icon" src={data.iconUrl} alt="" />
    {/if}
    <div class="tt-header-text">
      <span class="tt-name">{data.name}</span>
      {#if data.conditions.length > 0}
        <span class="tt-conditions">
          {#each data.conditions as cond}
            <span class="tt-cond" title={cond}>{CONDITION_ICONS[cond] ?? cond}</span>
          {/each}
        </span>
      {/if}
    </div>
  </div>
  <div class="tt-divider"></div>
  <div class="tt-stats">{data.stats}</div>
  {#if data.coverage}
    <div class="tt-coverage">{data.coverage}</div>
  {/if}
  {#if data.capacities}
    <div class="tt-capacities">{data.capacities}</div>
  {/if}
  {#if data.description}
    <div class="tt-divider"></div>
    <div class="tt-desc">{data.description}</div>
  {/if}
</div>
{/if}

<style>
  .tt-root {
    position: fixed;
    z-index: 2000;
    background: rgba(10, 10, 18, 0.96);
    border: 1px solid #445;
    border-radius: 3px;
    font-family: monospace;
    font-size: 0.7rem;
    color: #889999;
    padding: 0.4rem 0.5rem;
    max-width: 260px;
    pointer-events: none;
    white-space: normal;
  }
  .tt-header {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  .tt-icon {
    width: 24px;
    height: 24px;
    image-rendering: pixelated;
    flex-shrink: 0;
    filter: brightness(0.8);
  }
  .tt-header-text {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }
  .tt-name {
    color: #ccdddd;
    font-size: 0.8rem;
    font-weight: bold;
  }
  .tt-conditions {
    display: flex;
    gap: 0.25rem;
    font-size: 0.7rem;
  }
  .tt-cond {
    cursor: default;
  }
  .tt-divider {
    height: 1px;
    background: #334;
    margin: 0.3rem 0;
  }
  .tt-stats {
    color: #778888;
    font-size: 0.65rem;
  }
  .tt-coverage {
    color: #887766;
    font-size: 0.65rem;
    margin-top: 0.15rem;
  }
  .tt-capacities {
    color: #5a8a7a;
    font-size: 0.65rem;
    margin-top: 0.15rem;
  }
  .tt-desc {
    color: #667;
    font-size: 0.6rem;
    font-style: italic;
    line-height: 1.3;
  }
</style>
