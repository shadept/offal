/**
 * HUD — coordinates all HUD overlay components.
 * Updates HUD state and manages DOM-only visor overlays.
 */
import './hud.css';
import { hudStore } from './hudStore.svelte';
import type { FloorThing } from './floorTypes';
import { hasComponent } from 'bitecs';
import { Health, Body, Dead, Position } from '../ecs/components';
import { findItemsAtPosition, getItemData } from '../ecs/inventory';
import { getPartData, findPartsAtPosition } from '../ecs/body';
import type { RoomInfo } from '../map/dungeonGen';
import { injectVisorWarpFilters, setupWarpInteraction } from './visorWarp';
import { applyDomVisorState } from './visorRuntimeSettings';
import Phaser from 'phaser';
import { uiEventBus } from './uiEventBus';

export class HUD {
  private el: HTMLDivElement;
  private overlayEl: HTMLDivElement;
  private world: object | null = null;
  private game: Phaser.Game;
  private readonly resizeHandler: () => void;

  // Room lookup cache
  private rooms: RoomInfo[] = [];
  private lastPlayerTileKey = '';

  // Damage tracking
  private lastHp = -1;

  // Entity species lookup (for corpse names)
  private entitySpeciesLookup: ((eid: number) => string | undefined) | null = null;

  constructor(game: Phaser.Game) {
    this.game = game;
    injectVisorWarpFilters();
    setupWarpInteraction();
    this.resizeHandler = () => injectVisorWarpFilters();
    window.addEventListener('resize', this.resizeHandler);

    this.el = document.createElement('div');
    this.el.id = 'hud-root';
    document.body.appendChild(this.el);

    this.overlayEl = document.createElement('div');
    this.overlayEl.id = 'hud-visor-overlay';
    document.body.appendChild(this.overlayEl);

    applyDomVisorState(this.el);
    hudStore.keysOpen = false;
  }

  bindWorld(world: object): void { this.world = world; }
  bindRooms(rooms: RoomInfo[]): void { this.rooms = rooms; }
  bindShipType(name: string): void { hudStore.shipType = name; }
  bindEntitySpecies(fn: (eid: number) => string | undefined): void { this.entitySpeciesLookup = fn; }

  /** Keys overlay is not ported to Phaser yet. */
  toggleKeys(): void {}
  get keysOpen(): boolean { return false; }

  /** Floor item selection index (-1 = none) */
  get floorSelectedIndex(): number { return hudStore.floorSelectedIndex; }
  set floorSelectedIndex(v: number) { hudStore.floorSelectedIndex = v; }
  get interactHoldProgress(): number { return hudStore.interactHoldProgress; }
  set interactHoldProgress(v: number) { hudStore.interactHoldProgress = v; }
  get floorItems(): FloorThing[] { return hudStore.floorItems; }

  update(
    playerEid: number,
    turnCount: number,
    fps = 0,
    sandboxActive = false,
    entitySprites?: Map<number, unknown>,
  ): void {
    // ── Top overlay ──
    hudStore.turnCount = turnCount;
    hudStore.fps = fps;
    hudStore.sandboxActive = sandboxActive;

    // Room name (only recompute on tile change)
    const px = Position.x[playerEid];
    const py = Position.y[playerEid];
    const tileKey = `${px},${py}`;
    if (tileKey !== this.lastPlayerTileKey) {
      this.lastPlayerTileKey = tileKey;
      hudStore.roomName = this.getRoomNameAt(px, py);
    }

    // ── Floor items ──
    this.updateFloorItems(playerEid, entitySprites);

    // ── Emit to UIScene ──
    const hp = Health.hp[playerEid];
    const maxHp = Health.maxHp[playerEid];
    let mob = 1, man = 1, con = 100, cir = 100;
    if (this.world && hasComponent(this.world, playerEid, Body)) {
      mob = Body.mobility[playerEid];
      man = Body.manipulation[playerEid];
      con = Body.consciousness[playerEid];
      cir = Body.circulation[playerEid];
    }

    uiEventBus.emit('update-hud', {
      shipType: hudStore.shipType,
      location: hudStore.roomName,
      turn: turnCount,
      fps: fps,
      hp, maxHp,
      mobility: mob,
      manipulation: man,
      consciousness: con,
      circulation: cir,
      floorItems: hudStore.floorItems,
      floorSelectedIndex: hudStore.floorSelectedIndex,
      interactHoldProgress: hudStore.interactHoldProgress,
    });

    // ── Player status ──
    // Track prevHp for damage flash (only on actual damage, not on init)
    if (this.lastHp >= 0 && hp < this.lastHp) {
      hudStore.prevHp = this.lastHp;
    }
    this.lastHp = hp;

    hudStore.hp = hp;
    hudStore.maxHp = maxHp;

    if (this.world && hasComponent(this.world, playerEid, Body)) {
      hudStore.mobility = Body.mobility[playerEid];
      hudStore.manipulation = Body.manipulation[playerEid];
      hudStore.consciousness = Body.consciousness[playerEid];
      hudStore.circulation = Body.circulation[playerEid];
    }

    // ── Game log ──
    hudStore.currentTurn = turnCount;

  }

  private updateFloorItems(playerEid: number, entitySprites?: Map<number, unknown>): void {
    const px = Position.x[playerEid];
    const py = Position.y[playerEid];
    const things: FloorThing[] = [];
    const previousThings = hudStore.floorItems;
    const previousSelectedThing =
      hudStore.floorSelectedIndex >= 0 ? previousThings[hudStore.floorSelectedIndex] : undefined;

    // Corpses
    if (entitySprites && this.world) {
      for (const [eid] of entitySprites) {
        if (eid === playerEid) continue;
        if (!hasComponent(this.world, eid, Dead) || !hasComponent(this.world, eid, Body)) continue;
        if (Position.x[eid] === px && Position.y[eid] === py) {
          let name = 'corpse';
          if (this.entitySpeciesLookup) {
            const speciesId = this.entitySpeciesLookup(eid);
            if (speciesId) name = `${speciesId} corpse`;
          }
          things.push({ eid, name, kind: 'corpse' });
        }
      }
    }

    // Items
    const itemEids = findItemsAtPosition(px, py, 10000);
    for (const eid of itemEids) {
      const data = getItemData(eid);
      things.push({
        eid,
        name: data?.name ?? 'item',
        kind: 'item',
      });
    }

    if (this.world) {
      const partEids = findPartsAtPosition(this.world, px, py, 10000);
      for (const eid of partEids) {
        const data = getPartData(eid);
        things.push({
          eid,
          name: data?.name ?? 'part',
          kind: 'part',
        });
      }
    }

    hudStore.floorItems = things;

    if (things.length === 0) {
      hudStore.floorSelectedIndex = -1;
      return;
    }

    if (previousSelectedThing) {
      const preservedIndex = things.findIndex((thing) => thing.eid === previousSelectedThing.eid);
      if (preservedIndex >= 0) {
        hudStore.floorSelectedIndex = preservedIndex;
        return;
      }
    }

    const preferredIndex = things.findIndex((thing) => thing.kind !== 'corpse');
    hudStore.floorSelectedIndex = preferredIndex >= 0 ? preferredIndex : 0;
  }

  private getRoomNameAt(x: number, y: number): string {
    for (const room of this.rooms) {
      const r = room.rect;
      if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) {
        return room.function?.name ?? '';
      }
    }
    return '';
  }

  /** Clear intro animation flags (call after intro completes) */
  clearIntro(): void {
    hudStore.intro = false;
  }

  destroy(): void {
    this.el.remove();
    this.overlayEl.remove();
    window.removeEventListener('resize', this.resizeHandler);
  }
}
