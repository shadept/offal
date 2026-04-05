/**
 * HUD — coordinates all HUD overlay components.
 * Mounts Svelte components and updates hudStore with game state.
 */
import { mount, unmount } from 'svelte';
import HudOverlay from './HudOverlay.svelte';
import PlayerStatusPanel from './PlayerStatusPanel.svelte';
import GameLogPanel from './GameLogPanel.svelte';
import FloorItemsPanel from './FloorItemsPanel.svelte';
import KeysOverlay from './KeysOverlay.svelte';
import { hudStore } from './hudStore.svelte';
import type { FloorThing } from './floorTypes';
import { hasComponent } from 'bitecs';
import { Health, Body, Dead, Position } from '../ecs/components';
import { findItemsAtPosition, getItemData } from '../ecs/inventory';
import { getPartData } from '../ecs/body';
import type { RoomInfo } from '../map/dungeonGen';
import { injectVisorWarpFilters } from './visorWarp';

export class HUD {
  private el: HTMLDivElement;
  private world: object | null = null;

  // Component mount handles
  private handles: ReturnType<typeof mount>[] = [];

  // Room lookup cache
  private rooms: RoomInfo[] = [];
  private lastPlayerTileKey = '';

  // Damage tracking
  private lastHp = -1;

  // Entity species lookup (for corpse names)
  private entitySpeciesLookup: ((eid: number) => string | undefined) | null = null;

  constructor() {
    injectVisorWarpFilters();

    this.el = document.createElement('div');
    this.el.id = 'hud-root';
    document.body.appendChild(this.el);

    this.handles.push(
      mount(HudOverlay, { target: this.el }) as ReturnType<typeof mount>,
      mount(PlayerStatusPanel, { target: this.el }) as ReturnType<typeof mount>,
      mount(GameLogPanel, { target: this.el }) as ReturnType<typeof mount>,
      mount(FloorItemsPanel, { target: this.el }) as ReturnType<typeof mount>,
      mount(KeysOverlay, { target: this.el }) as ReturnType<typeof mount>,
    );
  }

  bindWorld(world: object): void { this.world = world; }
  bindRooms(rooms: RoomInfo[]): void { this.rooms = rooms; }
  bindShipType(name: string): void { hudStore.shipType = name; }
  bindEntitySpecies(fn: (eid: number) => string | undefined): void { this.entitySpeciesLookup = fn; }

  /** Toggle the ? keys overlay */
  toggleKeys(): void { hudStore.keysOpen = !hudStore.keysOpen; }
  get keysOpen(): boolean { return hudStore.keysOpen; }

  /** Floor item selection index (-1 = none) */
  get floorSelectedIndex(): number { return hudStore.floorSelectedIndex; }
  set floorSelectedIndex(v: number) { hudStore.floorSelectedIndex = v; }
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

    // ── Player status ──
    const hp = Health.hp[playerEid];
    const maxHp = Health.maxHp[playerEid];

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

    // ── Floor items ──
    this.updateFloorItems(playerEid, entitySprites);
  }

  private updateFloorItems(playerEid: number, entitySprites?: Map<number, unknown>): void {
    const px = Position.x[playerEid];
    const py = Position.y[playerEid];
    const things: FloorThing[] = [];

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
      const partData = getPartData(eid);
      things.push({
        eid,
        name: data?.name ?? 'item',
        kind: partData ? 'part' : 'item',
      });
    }

    hudStore.floorItems = things;
    // Reset selection if items changed
    if (hudStore.floorSelectedIndex >= things.length) {
      hudStore.floorSelectedIndex = -1;
    }
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
    for (const h of this.handles) unmount(h);
    this.el.remove();
  }
}
