/**
 * HUD reactive store — holds all data that HUD components read.
 * Updated imperatively from GameScene via HUD.ts, components react via $state.
 */

import type { FloorThing } from './floorTypes';

class HudStore {
  // Top overlay
  turnCount = $state(0);
  fps = $state(0);
  shipType = $state('');
  roomName = $state('');
  keysOpen = $state(false);
  sandboxActive = $state(false);
  intro = $state(true);

  // Player status
  hp = $state(0);
  maxHp = $state(1);
  prevHp = $state(0);
  mobility = $state(100);
  manipulation = $state(100);
  consciousness = $state(100);
  circulation = $state(100);

  // Game log
  currentTurn = $state(0);

  // Floor items
  floorItems = $state<FloorThing[]>([]);
  floorSelectedIndex = $state(-1);
  interactHoldProgress = $state(0);
}

export const hudStore = new HudStore();
