<script lang="ts">
  import './hud.css';
  import { hudStore } from './hudStore.svelte';
</script>

<div class="hud-overlay">
  <!-- Top-left: location + turn -->
  <div class="hud-naked hud-tl" class:hud-intro-fade={hudStore.intro}>
    <div class="hud-location">{hudStore.shipType}{hudStore.roomName ? ` — ${hudStore.roomName}` : ''}</div>
    <div class="hud-turn">TURN {hudStore.turnCount}</div>
  </div>

  <!-- Top-right: keys hint + FPS -->
  <div class="hud-naked hud-tr" class:hud-intro-fade={hudStore.intro}>
    <button class="hud-keys-btn" onclick={() => hudStore.keysOpen = !hudStore.keysOpen}>
      [?] keys
    </button>
    <div class="hud-fps">{Math.round(hudStore.fps)} fps</div>
  </div>
</div>

<style>
  .hud-overlay {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 10;
  }

  .hud-tl {
    top: 0.4rem;
    left: 0.6rem;
  }
  .hud-location {
    color: #889999;
    font-size: 0.85rem;
  }
  .hud-turn {
    color: #556666;
    font-size: 0.8rem;
    letter-spacing: 1px;
    margin-top: 0.15rem;
  }

  .hud-tr {
    top: 0.4rem;
    right: 0.6rem;
    text-align: right;
  }
  .hud-keys-btn {
    background: none;
    border: none;
    color: #556666;
    font-family: monospace;
    font-size: 0.8rem;
    cursor: pointer;
    pointer-events: auto;
    padding: 0;
  }
  .hud-keys-btn:hover {
    color: #889999;
  }
  .hud-fps {
    color: #445566;
    font-size: 0.75rem;
    margin-top: 0.15rem;
  }
</style>
