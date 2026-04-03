<script lang="ts">
  import { bringToFront } from './windowManager';

  let {
    title,
    open = $bindable(false),
    defaultX = 100,
    defaultY = 100,
    width = '22rem',
    onClose,
    children,
  }: {
    title: string;
    open: boolean;
    defaultX?: number;
    defaultY?: number;
    width?: string;
    onClose: () => void;
    children: import('svelte').Snippet;
  } = $props();

  let posX = $state(0);
  let posY = $state(0);
  let zIndex = $state(1200);
  let focused = $state(true);
  let dragging = $state(false);
  let dragOffsetX = 0;
  let dragOffsetY = 0;

  // Reset position when panel opens
  $effect(() => {
    if (open) {
      posX = defaultX;
      posY = defaultY;
      zIndex = bringToFront();
      focused = true;
    }
  });

  function handleFocus() {
    zIndex = bringToFront();
    focused = true;
  }

  function handleBlur() {
    focused = false;
  }

  function onHeaderDown(e: PointerEvent) {
    if ((e.target as HTMLElement).closest('.dw-close')) return;
    dragging = true;
    dragOffsetX = e.clientX - posX;
    dragOffsetY = e.clientY - posY;
    handleFocus();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerEvent) {
    if (!dragging) return;
    posX = e.clientX - dragOffsetX;
    posY = e.clientY - dragOffsetY;
  }

  function onPointerUp() {
    dragging = false;
  }
</script>

{#if open}
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="dw-root"
  class:dw-unfocused={!focused}
  style="left: {posX}px; top: {posY}px; z-index: {zIndex}; width: {width};"
  onpointerdown={handleFocus}
  onfocusin={handleFocus}
  onfocusout={handleBlur}
>
  <header
    class="dw-header"
    onpointerdown={onHeaderDown}
    onpointermove={onPointerMove}
    onpointerup={onPointerUp}
    onpointercancel={onPointerUp}
  >
    <h3 class="dw-title">{title}</h3>
    <button class="dw-close" onclick={onClose}>&times;</button>
  </header>
  <div class="dw-body">
    {@render children()}
  </div>
</div>
{/if}

<style>
  .dw-root {
    position: fixed;
    background: rgba(10, 10, 18, 0.96);
    border: 1px solid #334;
    border-radius: 4px;
    font-family: monospace;
    font-size: 0.75rem;
    color: #889999;
    display: flex;
    flex-direction: column;
    max-height: 80vh;
    transition: opacity 0.15s ease;
    user-select: none;
  }
  .dw-unfocused {
    opacity: 0.7;
  }
  .dw-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.4rem 0.6rem;
    background: #0a0a12;
    border-bottom: 1px solid #334;
    cursor: grab;
    flex-shrink: 0;
    touch-action: none;
  }
  .dw-header:active {
    cursor: grabbing;
  }
  .dw-title {
    margin: 0;
    font-size: 0.8rem;
    color: #ccdddd;
    letter-spacing: 2px;
    pointer-events: none;
  }
  .dw-close {
    background: none;
    border: none;
    color: #667;
    font-size: 1.1rem;
    cursor: pointer;
    font-family: monospace;
    padding: 0 0.2rem;
  }
  .dw-close:hover {
    color: #e94560;
  }
  .dw-body {
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
</style>
