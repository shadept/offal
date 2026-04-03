<script lang="ts">
  let {
    playerX = $bindable(0),
    playerY = $bindable(0),
    turnCount = $bindable(0),
    phase = $bindable(''),
    fps = $bindable(0),
  }: {
    playerX: number;
    playerY: number;
    turnCount: number;
    phase: string;
    fps: number;
  } = $props();
</script>

<div class="hud">
  <div class="hud-top-left">({playerX}, {playerY})</div>
  <div class="hud-top-center">{phase}</div>
  <div class="hud-top-right">
    <div>Turn {turnCount}</div>
    <div class="hud-dim">{Math.round(fps)} fps</div>
  </div>
  <div class="hud-bottom">WASD: move | Space: wait | Shift: skip | Tab: sandbox</div>
</div>

<style>
  .hud {
    position: fixed;
    inset: 0;
    pointer-events: none;
    font-family: monospace;
    font-size: 0.85rem;
    z-index: 5;
  }
  .hud-top-left {
    position: absolute;
    top: 0.4rem;
    left: 0.5rem;
    color: #ccdddd;
  }
  .hud-top-center {
    position: absolute;
    top: 0.4rem;
    left: 50%;
    transform: translateX(-50%);
    color: #889999;
  }
  .hud-top-right {
    position: absolute;
    top: 0.4rem;
    right: 0.5rem;
    text-align: right;
    color: #889999;
  }
  .hud-dim {
    font-size: 0.75rem;
    color: #556666;
  }
  .hud-bottom {
    position: absolute;
    bottom: 0.5rem;
    left: 50%;
    transform: translateX(-50%);
    font-size: 0.75rem;
    color: #556666;
    white-space: nowrap;
  }
</style>
