<script lang="ts">
  import { SandboxStore } from './sandboxStore.svelte';
  import type { SandboxController } from '../sandbox/SandboxController';
  import ToolBar from './ToolBar.svelte';
  import Inspector from './Inspector.svelte';
  import SimControls from './SimControls.svelte';

  const { ctrl }: { ctrl: SandboxController } = $props();
  const store = new SandboxStore(ctrl);
</script>

<div id="sandbox-panel" class:open={store.active}>
  <header class="sb-header">
    <h3>SANDBOX</h3>
    <button class="sb-close" onclick={() => ctrl.toggle()}>&times;</button>
  </header>

  <ToolBar {store} />
  <Inspector {store} />
  <SimControls {store} />
</div>

<style>
  #sandbox-panel {
    position: fixed;
    top: 0;
    right: 0;
    width: 18rem;
    height: 100vh;
    background: #111118;
    color: #889999;
    font-family: monospace;
    font-size: 0.8rem;
    z-index: 1000;
    overflow-y: auto;
    transform: translateX(100%);
    transition: transform 0.2s ease;
    border-left: 1px solid #334;
    user-select: none;
    pointer-events: auto;
  }
  #sandbox-panel.open {
    transform: translateX(0);
  }
  .sb-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.5rem 0.75rem;
    background: #0a0a12;
    border-bottom: 1px solid #334;
  }
  .sb-header h3 {
    margin: 0;
    font-size: 0.85rem;
    color: #ccdddd;
    letter-spacing: 2px;
  }
  .sb-close {
    background: none;
    border: none;
    color: #667;
    font-size: 1.1rem;
    cursor: pointer;
    padding: 0 0.25rem;
    font-family: monospace;
  }
  .sb-close:hover { color: #e94560; }
</style>
