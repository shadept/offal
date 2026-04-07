/**
 * GameScene — main game orchestration.
 *
 * Responsibilities:
 * - Render tile map based on FOV
 * - Manage entity sprites (sync ECS → Phaser)
 * - Handle player input (WASD/arrows)
 * - Drive turn state machine
 * - Drain visual event queue
 * - Camera follow
 * - Ambient visual layer
 * - Sandbox mode (Phase 2)
 * - AI combat, death visual events (Phase 3)
 * - Fire & physics systems (Phase 4)
 */
import { Scene } from 'phaser';
import { createGameWorld, spawnPlayer, spawnDoor, spawnTeleporter, linkTeleporters } from '../ecs/world';
import type { ShipGraph } from '../map/shipGen';
import { addEntity, addComponent, removeEntity, removeComponent, hasComponent, query } from 'bitecs';
import {
  Position, Renderable, FOV, Turn, AI, BlocksMovement,
  Health, Faction, CombatStats, Dead, Door, Teleporter, Body,
  Item, HeldBy, Inventory, PartIdentity,
} from '../ecs/components';
import { initFactions, getFactionIndex, areHostile } from '../ecs/factions';
import { Lightmap, type LightSource } from '../lighting/Lightmap';
import { LightmapFilter } from '../lighting/LightmapFilter';
import { createLightmapFilterNode } from '../lighting/LightmapFilterNode';
import { createVisorWarpFilterNode } from '../ui/canvas/VisorWarpFilterNode';
import { VisorWarpFilter } from '../ui/canvas/VisorWarpFilter';
import { createVisorStyleFilterNode } from '../ui/canvas/VisorStyleFilterNode';
import { VisorStyleFilter } from '../ui/canvas/VisorStyleFilter';
import { initBodyIndices, spawnBodyForCreature, getPartsOf, clearPartIndex, attachPart, detachPart, getPartData, getMovementCostMultiplier } from '../ecs/body';
import { initItemIndices, bindInventoryWorld, pickUp, drop, findItemsAtPosition, getItemData, spawnItemOnFloor, canPickUp, getItemsOf, transferItem, takePartFromBody } from '../ecs/inventory';
import { inventoryStore } from '../ui/inventoryStore';
import { bodyStore } from '../ui/bodyStore';
import { lootStore } from '../ui/lootStore';
import { TurnSystem } from '../ecs/systems/turnSystem';
import { tryMove, getBlockingEntity, syncDoorOverlays } from '../ecs/systems/movementSystem';
import { processFireSystem } from '../ecs/systems/fireSystem';
import { processFluidSystem } from '../ecs/systems/fluidSystem';
import { processGasSystem } from '../ecs/systems/gasSystem';
import { processBodySystem } from '../ecs/systems/bodySystem';
import { TilePhysicsMap } from '../ecs/systems/tilePhysics';
import { EntityPhysicsMap } from '../ecs/systems/entityPhysics';
import { VisualEventQueue } from '../visual/EventQueue';
import { TileMap, TILE_SIZE } from '../map/TileMap';
import { loadMap } from '../map/mapLoader';
import { generateShip } from '../map/dungeonGen';
import type { ArrivalEvent, RoomInfo } from '../map/dungeonGen';
import { computeFOV } from '../map/fov';
import { TurnPhase, TileType, Visibility } from '../types';
import type { VisualEvent } from '../types';
import { TEX, speciesTexKey, archFloorTex, archWallTex } from './BootScene';
import { HUD } from '../ui/HUD';
import { SandboxController } from '../sandbox/SandboxController';
import { mount, unmount } from 'svelte';
import { setDamageLogContext } from '../ecs/damage';
import { gameLog } from '../ui/gameLog';
import SandboxPanel from '../ui/SandboxPanel.svelte';
import { processAITurns, performAttack, clearEntityAICache } from '../ecs/systems/aiSystem';
import { executeCraft, executeCrudeCraft, type RecipeMatch } from '../ecs/crafting';
import { getRegistry } from '../data/loader';
import { setUIInitPayload, uiEventBus } from '../ui/uiEventBus';
import {
  GAME_VISOR_WARP_CONFIG,
  installPhaserInputWarp,
  mapClientPointToWarpSource,
} from '../ui/visorWarp';

/** Movement tween duration in ms */
const MOVE_DURATION = 120;

/** Door open animation duration in ms */
const DOOR_DURATION = 150;

/** Hit flash duration in ms */
const HIT_FLASH_DURATION = 200;

/** Death animation duration in ms */
const DEATH_DURATION = 300;

/** Default camera zoom when the scene starts. */
const DEFAULT_GAME_ZOOM = 1.5;

export class GameScene extends Scene {
  // ── ECS ──
  private world!: ReturnType<typeof createGameWorld>;
  private turnSystem!: TurnSystem;
  private playerEid!: number;

  // ── Map ──
  private tileMap!: TileMap;
  private tilePhysics!: TilePhysicsMap;
  private entityPhysics = new EntityPhysicsMap();

  // ── Visual ──
  private eventQueue!: VisualEventQueue;
  private tileSprites: (Phaser.GameObjects.Image | null)[] = [];
  private entitySprites = new Map<number, Phaser.GameObjects.Image>();
  /** Maps entity ID → species ID for texture lookup */
  private entitySpecies = new Map<number, string>();
  private tileContainer!: Phaser.GameObjects.Container;
  private overlayContainer!: Phaser.GameObjects.Container;
  private objectContainer!: Phaser.GameObjects.Container;  // items, corpses, severed parts
  private entityContainer!: Phaser.GameObjects.Container;  // living creatures
  /** Fire overlay sprites indexed by tile flat index */
  private fireOverlays = new Map<number, Phaser.GameObjects.Image>();
  /** Fluid overlay sprites indexed by tile flat index */
  private fluidOverlays = new Map<number, Phaser.GameObjects.Image>();
  /** Fire particle emitters indexed by tile flat index */
  private fireEmitters = new Map<number, Phaser.GameObjects.Particles.ParticleEmitter>();
  /** Gas overlay sprites indexed by tile flat index */
  private gasOverlays = new Map<number, Phaser.GameObjects.Image>();
  /** Entity HP bar graphics overlay (redrawn each frame) */
  private hpBarGraphics!: Phaser.GameObjects.Graphics;

  // ── Lighting ──
  private lightmap!: Lightmap;
  private lightmapFilter!: LightmapFilter;
  private lightmapCanvas!: HTMLCanvasElement;
  private lightmapCtx!: CanvasRenderingContext2D;
  private visCanvas!: HTMLCanvasElement;
  private visCtx!: CanvasRenderingContext2D;
  // private playerLightSource!: LightSource; // removed for now
  private fireLightSources = new Map<number, LightSource>(); // keyed by tile index
  private roomLightSources: LightSource[] = [];
  /** Gas particle emitters indexed by tile flat index */
  private gasEmitters = new Map<number, Phaser.GameObjects.Particles.ParticleEmitter>();

  // ── Background ──
  private nebulaBg!: Phaser.GameObjects.TileSprite;

  // ── Ambient ──
  private sparkEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;

  // ── Input ──
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<string, Phaser.Input.Keyboard.Key>;
  private skipKey!: Phaser.Input.Keyboard.Key;
  private waitKey!: Phaser.Input.Keyboard.Key;
  private inputCooldown = 0;
  /** True once all keys have been released after the player's last action.
   *  Prevents held keys from immediately interrupting enemy animations. */
  private inputReleasedSinceAction = true;

  // ── HUD ──
  private hud!: HUD;

  // ── Idle animation ──
  private idleTime = 0;

  // ── Sandbox ──
  private sandbox!: SandboxController;
  private sandboxPanelHandle: Record<string, unknown> | null = null;
  private tabKey!: Phaser.Input.Keyboard.Key;
  private advanceKey!: Phaser.Input.Keyboard.Key;
  private graphKey!: Phaser.Input.Keyboard.Key;
  private inventoryKey!: Phaser.Input.Keyboard.Key;
  private bodyKey!: Phaser.Input.Keyboard.Key;
  private interactKey!: Phaser.Input.Keyboard.Key;
  private revealKey!: Phaser.Input.Keyboard.Key;
  // ── Floor interaction (E-key hold) ──
  private interactHoldStart = 0;
  private interactHoldActive = false;
  private interactSelectionMode = false;
  private selectionHighlight!: Phaser.GameObjects.Rectangle;
  /** Tracks click-drag panning in sandbox mode */
  private dragPanning = false;
  private dragLastX = 0;
  private dragLastY = 0;
  private autoPlayTimer = 0;

  // ── Sandbox animation state ──
  private sandboxDraining = false;

  // ── Debug overlays (one Graphics object per enabled component overlay) ──
  private debugOverlays = new Map<string, Phaser.GameObjects.Graphics>();

  // ── Dungeon generation ──
  private currentSeed = '';
  private currentArchitectureId = '';
  private currentRooms: RoomInfo[] = [];
  private shipGraphOverlay: Phaser.GameObjects.Graphics | null = null;
  private shipGraphData: ShipGraph | null = null;

  private visorFilter!: VisorWarpFilter;
  private visorStyleFilter!: VisorStyleFilter;

  constructor() {
    super({ key: 'GameScene' });
  }

  create(): void {
    // ── Init faction index mapping ──
    initFactions();
    initBodyIndices(getRegistry());
    initItemIndices(getRegistry());

    // ── ECS setup ──
    this.world = createGameWorld();
    bindInventoryWorld(this.world);
    inventoryStore.bindWorld(this.world);
    lootStore.bindWorld(this.world);
    this.turnSystem = new TurnSystem();
    this.eventQueue = new VisualEventQueue();

    // ── Map (procedural dungeon generation) ──
    const shipResult = generateShip();
    this.tileMap = shipResult.tileMap;
    this.currentSeed = shipResult.seed;
    this.currentArchitectureId = shipResult.graph.architecture;
    this.currentRooms = shipResult.rooms;
    this.shipGraphData = shipResult.graph;
    console.log(`[dungeon] Generated ship with seed "${this.currentSeed}", arch="${this.currentArchitectureId}", ${shipResult.rooms.length} rooms`);

    // ── Nebula background (tiled, parallax scroll behind everything) ──
    const worldW = this.tileMap.width * TILE_SIZE;
    const worldH = this.tileMap.height * TILE_SIZE;
    this.nebulaBg = this.add.tileSprite(0, 0, worldW * 2, worldH * 2, TEX.NEBULA);
    this.nebulaBg.setOrigin(0, 0);
    this.nebulaBg.setPosition(-worldW * 0.5, -worldH * 0.5);
    this.nebulaBg.setScrollFactor(0.3);
    this.nebulaBg.setDepth(-1);

    // ── Containers (bottom→top: tiles, overlays, objects, entities) ──
    this.tileContainer = this.add.container(0, 0);
    this.overlayContainer = this.add.container(0, 0);
    this.objectContainer = this.add.container(0, 0);  // items, corpses, severed parts
    this.entityContainer = this.add.container(0, 0);  // living creatures
    this.hpBarGraphics = this.add.graphics();
    this.hpBarGraphics.setDepth(3); // above entities

    // ── Tile physics state ──
    this.tilePhysics = new TilePhysicsMap(this.tileMap.width, this.tileMap.height);

    // Initialize tile HP from tile data
    {
      const reg = getRegistry();
      for (let y = 0; y < this.tileMap.height; y++) {
        for (let x = 0; x < this.tileMap.width; x++) {
          const idx = this.tileMap.idx(x, y);
          const tileData = reg.tilesByIndex.get(this.tileMap.tiles[idx]);
          if (tileData?.hp != null) {
            this.tilePhysics.tileHp[idx] = tileData.hp;
          }
        }
      }
    }

    // ── Spawn door entities and project onto tile overlay ──
    for (const door of shipResult.doors) {
      const eid = spawnDoor(this.world, { x: door.x, y: door.y });
      const idx = this.tileMap.idx(door.x, door.y);
      this.tileMap.entityBlocksMovement[idx] = 1;
      this.tileMap.entityBlocksLight[idx] = 1;
    }

    // ── Spawn teleporter entities ──
    for (const pair of shipResult.teleporters) {
      const eidA = spawnTeleporter(this.world, pair.a.x, pair.a.y);
      const eidB = spawnTeleporter(this.world, pair.b.x, pair.b.y);
      linkTeleporters(eidA, eidB);
    }

    // ── Apply arrival events (pre-existing fire, gas leaks) ──
    this.applyArrivalEvents(shipResult.arrivalEvents);

    // ── Spawn player at map-defined position ──
    const registry = getRegistry();
    const playerSpecies = registry.species.get('salvager');
    this.playerEid = spawnPlayer(this.world, {
      x: shipResult.playerSpawn.x,
      y: shipResult.playerSpawn.y,
      speed: playerSpecies?.speed ?? 100,
      viewRange: playerSpecies?.fovRange ?? 8,
      maxHp: playerSpecies?.maxHp ?? 25,
      attackDamage: playerSpecies?.attackDamage ?? [5, 5],
      faction: playerSpecies?.faction ?? 'player',
    });
    if (playerSpecies) {
      spawnBodyForCreature(this.world, this.playerEid, playerSpecies, registry);
    }
    Turn.energy[this.playerEid] = 100;

    // Give player an inventory (base capacity = 20 volume units)
    addComponent(this.world, this.playerEid, Inventory);
    Inventory.capacity[this.playerEid] = 20;
    Inventory.usedVolume[this.playerEid] = 0;

    // ── Create tile sprites ──
    this.createTileSprites();

    // ── Create door entity sprites ──
    for (const eid of query(this.world, [Door, Position])) {
      this.createEntitySprite(eid, undefined, TEX.DOOR_CLOSED);
    }

    // ── Create teleporter entity sprites ──
    for (const eid of query(this.world, [Teleporter, Position])) {
      this.createEntitySprite(eid, undefined, TEX.TELEPORTER);
    }

    // ── Create player sprite ──
    this.createEntitySprite(this.playerEid, 'salvager');

    // ── Spawn map-defined entities ──
    this.spawnMapEntities(shipResult.spawns);

    // ── Lighting system ──
    this.lightmap = new Lightmap(this.tileMap.width, this.tileMap.height);
    this.lightmapCanvas = document.createElement('canvas');
    this.lightmapCanvas.width = this.tileMap.width;
    this.lightmapCanvas.height = this.tileMap.height;
    this.lightmapCtx = this.lightmapCanvas.getContext('2d')!;
    this.visCanvas = document.createElement('canvas');
    this.visCanvas.width = this.tileMap.width;
    this.visCanvas.height = this.tileMap.height;
    this.visCtx = this.visCanvas.getContext('2d')!;
    this.textures.addCanvas('_lightmap', this.lightmapCanvas);
    this.textures.addCanvas('_visibility', this.visCanvas);
    // Disable UNPACK_FLIP_Y so canvas data maps 1:1 to tile UV (row 0 → v=0)
    (this.textures.get('_lightmap') as any)._source.flipY = false;
    (this.textures.get('_visibility') as any)._source.flipY = false;

    // Room ceiling lights
    this.addRoomLights();

    // Hull and space are always pre-revealed (player approached from outside)
    this.revealExterior();

    // ── Initial FOV ──
    this.updateFOV();
    this.renderTiles();

    // ── Camera — always centered on player, no bounds ──
    const playerSprite = this.entitySprites.get(this.playerEid)!;
    this.cameras.main.startFollow(playerSprite, true, 0.15, 0.15,
      -TILE_SIZE / 2, -TILE_SIZE / 2);

    // ── Intro animation — camera zoom in + HUD slide ──
    {
      const cam = this.cameras.main;
      const targetZoom = DEFAULT_GAME_ZOOM;
      cam.setZoom(targetZoom * 0.85); // Start zoomed out
      cam.setAlpha(0.7);
      this.tweens.add({
        targets: cam,
        zoom: targetZoom,
        alpha: 1,
        duration: 500,
        ease: 'Cubic.easeOut',
        onComplete: () => {
          // Clear HUD intro flags after panels have slid in
          this.time.delayedCall(100, () => this.hud.clearIntro());
        },
      });
    }

    installPhaserInputWarp(this.input.manager, this.game.canvas, GAME_VISOR_WARP_CONFIG);

    // ── Lightmap shader filter ──
    try {
      const renderer = this.game.renderer;
      if (renderer && 'renderNodes' in renderer) {
        const webglRenderer = renderer as any;
        const filterNode = createLightmapFilterNode(webglRenderer.renderNodes);
        webglRenderer.renderNodes.addNode('FilterLightmap', filterNode);

        if (!webglRenderer.renderNodes.getNode('FilterVisorWarp')) {
          const visorNode = createVisorWarpFilterNode(webglRenderer.renderNodes);
          webglRenderer.renderNodes.addNode('FilterVisorWarp', visorNode);
        }
        if (!webglRenderer.renderNodes.getNode('FilterVisorStyle')) {
          const visorStyleNode = createVisorStyleFilterNode(webglRenderer.renderNodes);
          webglRenderer.renderNodes.addNode('FilterVisorStyle', visorStyleNode);
        }

        this.lightmapFilter = new LightmapFilter(this.cameras.main, {
          mapWidth: this.tileMap.width,
          mapHeight: this.tileMap.height,
          tileSize: TILE_SIZE,
          lightmapTextureKey: '_lightmap',
          visibilityTextureKey: '_visibility',
        });
        (this.cameras.main.filters as any).external.add(this.lightmapFilter);

        // Apply VisorWarp to GameScene camera
        this.visorFilter = new VisorWarpFilter(this.cameras.main, GAME_VISOR_WARP_CONFIG);
        (this.cameras.main.filters as any).external.add(this.visorFilter);
        this.visorStyleFilter = new VisorStyleFilter(this.cameras.main, GAME_VISOR_WARP_CONFIG);
        (this.cameras.main.filters as any).external.add(this.visorStyleFilter);

        // Override NEAREST (from pixelArt:true) with LINEAR on the lightmap
        // wrapper so bilinear interpolation persists through texture updates.
        const gl = (webglRenderer as any).gl as WebGLRenderingContext;
        if (gl && this.lightmapFilter.lightmapGlTexture) {
          this.lightmapFilter.lightmapGlTexture.minFilter = gl.LINEAR;
          this.lightmapFilter.lightmapGlTexture.magFilter = gl.LINEAR;
        }

        console.log('[lighting] Shader filter enabled');
      }
    } catch (e) {
      console.warn('[lighting] Shader setup failed, using CPU fallback', e);
      this.lightmapFilter = null as any;
    }

    // ── Register visual event handlers ──
    this.registerEventHandlers();

    // ── Input ──
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = {
      W: this.input.keyboard!.addKey('W'),
      A: this.input.keyboard!.addKey('A'),
      S: this.input.keyboard!.addKey('S'),
      D: this.input.keyboard!.addKey('D'),
    };
    this.skipKey = this.input.keyboard!.addKey('SHIFT');
    this.waitKey = this.input.keyboard!.addKey('SPACE');
    this.tabKey = this.input.keyboard!.addKey('TAB');
    this.advanceKey = this.input.keyboard!.addKey('N');
    this.graphKey = this.input.keyboard!.addKey('G');
    this.inventoryKey = this.input.keyboard!.addKey('I');
    this.bodyKey = this.input.keyboard!.addKey('B');
    this.interactKey = this.input.keyboard!.addKey('E');
    this.revealKey = this.input.keyboard!.addKey('R');
    // ? key handled via DOM keydown (Shift+/ = ?)
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === '?' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        this.hud.toggleKeys();
      }
    });

    // ── Ambient: spark emitter on wall edges ──
    this.setupAmbientEffects();

    // ── HUD ──
    this.hud = new HUD(this.game);
    this.hud.bindWorld(this.world);
    this.hud.bindRooms(this.currentRooms);
    this.hud.bindEntitySpecies((eid: number) => this.entitySpecies.get(eid));
    {
      const reg = getRegistry();
      const shipTypeData = reg.shipTypes.get(shipResult.graph.shipType);
      this.hud.bindShipType(shipTypeData?.name ?? shipResult.graph.shipType);
    }
    setUIInitPayload({ playerEid: this.playerEid, world: this.world });
    this.hud.update(this.playerEid, this.turnSystem.turnCount, 0, false, this.entitySprites);
    uiEventBus.on('toggle-keys', () => this.hud.toggleKeys());
    uiEventBus.on('drop-item', ({ itemEid }: { itemEid: number }) => this.handleInventoryDrop(itemEid));
    uiEventBus.on('pick-up-item', ({ itemEid }: { itemEid: number }) => this.handleInventoryPickUp(itemEid));
    uiEventBus.on('craft-items', ({ match }: { match: RecipeMatch }) => this.handleInventoryCraft(match));
    uiEventBus.on('crude-craft-items', ({ itemEids }: { itemEids: number[] }) => this.handleInventoryCrudeCraft(itemEids));
    uiEventBus.on('take-corpse-item', ({ ownerEid, itemEid }: { ownerEid: number; itemEid: number }) => this.handleCorpseTakeItem(ownerEid, itemEid));
    uiEventBus.on('take-corpse-part', ({ ownerEid, partEid }: { ownerEid: number; partEid: number }) => this.handleCorpseTakePart(ownerEid, partEid));

    // ── Sandbox ──
    this.sandbox = new SandboxController();
    this.sandbox.bind(this.tileMap, this.world, this.turnSystem, this.eventQueue, this.tilePhysics, this.lightmap);

    // Register entity surface state inspector (contamination from fluids etc.)
    this.sandbox.debugRegistry.register({
      name: 'Surface States',
      hasComponent: (_w, eid) => this.entityPhysics.getStates(eid).length > 0,
      getFields: (_w, eid) => {
        const states = this.entityPhysics.getStates(eid);
        return states.map(({ state, turns }) => [state, `${turns} turns`]);
      },
      hasOverlay: false,
    });

    this.sandboxPanelHandle = mount(SandboxPanel, { target: document.body, props: { ctrl: this.sandbox } });

    // ── Game log is now managed by HUD ──

    setDamageLogContext(
      (eid: number) => {
        if (eid === this.playerEid) return 'You';
        const speciesId = this.entitySpecies.get(eid);
        const dead = hasComponent(this.world, eid, Dead) ? ' (dead)' : '';
        if (speciesId) {
          const species = getRegistry().species.get(speciesId);
          return `${species?.name ?? speciesId} #${eid}${dead}`;
        }
        return `entity #${eid}${dead}`;
      },
      () => this.turnSystem.turnCount,
    );

    // ── Right-click: suppress browser menu + open game context menu ──
    this.game.canvas.addEventListener('contextmenu', (e: MouseEvent) => {
      e.preventDefault();

      // Convert screen coords → world → tile
      const rect = this.game.canvas.getBoundingClientRect();
      const sourcePoint = mapClientPointToWarpSource(e.clientX, e.clientY, rect, GAME_VISOR_WARP_CONFIG);
      const canvasX = (sourcePoint.x - rect.left) * (this.game.canvas.width / rect.width);
      const canvasY = (sourcePoint.y - rect.top) * (this.game.canvas.height / rect.height);
      const worldPoint = this.cameras.main.getWorldPoint(canvasX, canvasY);
      const tileX = Math.floor(worldPoint.x / TILE_SIZE);
      const tileY = Math.floor(worldPoint.y / TILE_SIZE);

      // In normal mode: must be adjacent or same tile as player
      if (!this.sandbox.active) {
        const px = Position.x[this.playerEid];
        const py = Position.y[this.playerEid];
        if (Math.abs(tileX - px) > 1 || Math.abs(tileY - py) > 1) return;
      }

      // Find entities with Body at that tile
      const targets: number[] = [];
      for (const [eid] of this.entitySprites) {
        if (eid === this.playerEid && !this.sandbox.active) continue;
        if (!hasComponent(this.world, eid, Body)) continue;
        if (Position.x[eid] === tileX && Position.y[eid] === tileY) {
          targets.push(eid);
        }
      }
      if (targets.length === 0) return;

      const targetEid = targets[0];
      if (hasComponent(this.world, targetEid, Dead)) {
        lootStore.loot(targetEid);
      }
    });

    // ── Auto-attach from inventory double-click ──
    const handleAutoAttach = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.partEid) return;
      if (this.turnSystem.phase !== TurnPhase.PLAYER_INPUT && !this.sandbox.active) return;
      const success = attachPart(this.world, detail.partEid, this.playerEid);
      if (!success) {
        gameLog.push(this.turnSystem.turnCount, 'system', 'Cannot attach part');
        return;
      }
      this.removeEntitySprite(detail.partEid);
      gameLog.push(this.turnSystem.turnCount, 'system', `Attached ${getPartData(detail.partEid)?.name ?? 'part'}`);
      bodyStore.notify();
      inventoryStore.notify();
      if (!this.sandbox.active) {
        this.turnSystem.deductEnergy(this.playerEid, 100);
        this.turnSystem.advance(this.world);
        this.drainAndRefresh(() => this.turnSystem.onPlayerAnimationComplete(this.world));
      }
    };
    window.addEventListener('body-auto-attach', handleAutoAttach);

    // Selection highlight (yellow outline, hidden by default)
    this.selectionHighlight = this.add.rectangle(0, 0, TILE_SIZE, TILE_SIZE);
    this.selectionHighlight.setOrigin(0, 0);
    this.selectionHighlight.setStrokeStyle(1.5, 0xffdd44);
    this.selectionHighlight.setFillStyle(0xffdd44, 0.1);
    this.selectionHighlight.setDepth(50);
    this.selectionHighlight.setVisible(false);

    // ── Reveal all + graph overlay by default (dev) ──
    this.sandbox.revealAll = true;
    this.updateFOV();
    this.renderTiles();
    this.toggleShipGraphOverlay();

    // Pointer click for sandbox (left-click only — right-click is context menu)
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (!this.sandbox.active) return;
      if (pointer.rightButtonDown()) return;
      this.handleSandboxClick(pointer);
    });

    // Scroll wheel zoom
    this.input.on('wheel', (_pointer: Phaser.Input.Pointer, _gos: unknown[], _dx: number, dy: number) => {
      const cam = this.cameras.main;
      const newZoom = Phaser.Math.Clamp(cam.zoom + (dy > 0 ? -0.1 : 0.1), 0.3, 3);
      cam.setZoom(newZoom);
    });

    // Click-drag camera panning (middle mouse in sandbox)
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (!this.sandbox.active) return;
      if (pointer.middleButtonDown()) {
        this.dragPanning = true;
        this.dragLastX = pointer.x;
        this.dragLastY = pointer.y;
      }
    });
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!this.dragPanning) return;
      const cam = this.cameras.main;
      cam.scrollX -= (pointer.x - this.dragLastX) / cam.zoom;
      cam.scrollY -= (pointer.y - this.dragLastY) / cam.zoom;
      this.dragLastX = pointer.x;
      this.dragLastY = pointer.y;
    });
    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (pointer.middleButtonReleased()) {
        this.dragPanning = false;
      }
    });

    // React to sandbox controller events
    this.sandbox.on((event, data) => {
      if (event === 'toggle') this.onSandboxToggle();
      if (event === 'tile_painted') this.onTilePainted(data as { x: number; y: number; type: number });
      if (event === 'entity_spawned') this.onEntitySpawned(data as { eid: number; x: number; y: number; speciesId: string });
      if (event === 'entity_removed') this.onEntityRemoved(data as { eid: number });
      if (event === 'reveal_changed') this.onRevealChanged();
      if (event === 'light_debug_changed') this.updateFOV();
      if (event === 'physics_changed') {
        const d = data as { x: number; y: number };
        this.updateFireOverlay(d.x, d.y);
        this.updateFluidOverlay(d.x, d.y);
      }
      if (event === 'advance_turn') this.runSandboxTurn();
      if (event === 'selection_changed') this.updateDebugOverlays();
      if (event === 'overlays_changed') this.updateDebugOverlays();
      if (event === 'field_edited') this.onFieldEdited(data as { eid: number; component: string });
      if (event === 'generate_ship') this.regenerateShip(data as { seed?: string } | undefined);
    });
  }

  shutdown(): void {
    if (this.sandboxPanelHandle) {
      unmount(this.sandboxPanelHandle as ReturnType<typeof mount>);
      this.sandboxPanelHandle = null;
    }
  }

  update(time: number, delta: number): void {
    // ── Skip mode (hold Shift) ──
    this.eventQueue.skipMode = this.skipKey.isDown;

    // ── Input cooldown ──
    if (this.inputCooldown > 0) {
      this.inputCooldown -= delta;
    }

    // ── Tab toggle ──
    if (Phaser.Input.Keyboard.JustDown(this.tabKey)) {
      this.sandbox.toggle();
    }

    // ── Graph overlay toggle (G key) ──
    if (Phaser.Input.Keyboard.JustDown(this.graphKey)) {
      this.toggleShipGraphOverlay();
    }

    // ── Inventory toggle (I key) ──
    if (Phaser.Input.Keyboard.JustDown(this.inventoryKey)) {
      inventoryStore.toggle();
    }

    // ── Body panel toggle (B key) ──
    if (Phaser.Input.Keyboard.JustDown(this.bodyKey)) {
      gameLog.push(this.turnSystem.turnCount, 'system', 'Body panel not ported yet');
    }

    // ── Interact (E key) — tap/hold/selection ──
    this.handleInteractInput(delta);

    // ── Toggle reveal all (R key) ──
    if (Phaser.Input.Keyboard.JustDown(this.revealKey)) {
      this.sandbox.setRevealAll(!this.sandbox.revealAll);
    }

    // ── Sandbox mode ──
    if (this.sandbox.active) {
      // Don't advance while draining visual events
      if (this.sandboxDraining) return;

      // Camera panning with WASD/arrows
      const panSpeed = 300 / this.cameras.main.zoom;
      const dt = delta / 1000;
      const cam = this.cameras.main;
      if (this.cursors.left.isDown || this.wasd.A.isDown) cam.scrollX -= panSpeed * dt;
      if (this.cursors.right.isDown || this.wasd.D.isDown) cam.scrollX += panSpeed * dt;
      if (this.cursors.up.isDown || this.wasd.W.isDown) cam.scrollY -= panSpeed * dt;
      if (this.cursors.down.isDown || this.wasd.S.isDown) cam.scrollY += panSpeed * dt;

      // Manual turn advance
      if (Phaser.Input.Keyboard.JustDown(this.advanceKey)) {
        this.runSandboxTurn();
      }

      // Auto-play
      if (this.sandbox.autoPlay) {
        this.autoPlayTimer += delta;
        const interval = 1000 / this.sandbox.autoPlaySpeed;
        if (this.autoPlayTimer >= interval) {
          this.autoPlayTimer -= interval;
          this.runSandboxTurn();
        }
      }
    } else {
      // ── Normal turn state machine ──
      switch (this.turnSystem.phase) {
        case TurnPhase.PLAYER_INPUT:
          this.handlePlayerInput();
          break;

        case TurnPhase.PROCESSING:
          this.processPlayerAction();
          break;

        case TurnPhase.ANIMATION:
          // Queue is draining — handled by callbacks
          break;

        case TurnPhase.ENEMY_TURN:
          this.processEnemyTurn();
          break;

        case TurnPhase.ENEMY_ANIMATION:
          // Track when all keys are released after the player's last action.
          // Only allow interrupt once keys have been released and pressed again.
          if (!this.inputReleasedSinceAction && !this.hasPlayerInput()) {
            this.inputReleasedSinceAction = true;
          }
          if (this.inputReleasedSinceAction && this.hasPlayerInput()) {
            this.interruptAnimations();
          }
          break;
      }
    }

    // ── Idle animation (player bobs gently) ──
    this.idleTime += delta;
    if (this.lightmapFilter) {
      this.lightmapFilter.time = time * 0.001; // ms → seconds
    }
    if (this.visorFilter) {
      this.visorFilter.update(time);
    }
    if (this.visorStyleFilter) {
      this.visorStyleFilter.update(time);
    }
    const pointer = this.input.activePointer;
    if (pointer.active) {
      const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      (pointer as any).worldX = worldPoint.x;
      (pointer as any).worldY = worldPoint.y;
    }
    this.updateIdleAnimations();

    // ── HUD + HP bars ──
    const fps = this.game.loop.actualFps;
    this.hud.update(this.playerEid, this.turnSystem.turnCount, fps, this.sandbox.active, this.entitySprites);
    this.renderEntityHpBars();
  }

  /** Draw HP bars above visible entities with Body component (not the player). */
  private renderEntityHpBars(): void {
    this.hpBarGraphics.clear();
    const barW = 20;
    const barH = 3;
    const barYOffset = -3; // above the sprite

    for (const [eid, sprite] of this.entitySprites) {
      if (eid === this.playerEid) continue;
      if (!hasComponent(this.world, eid, Body)) continue;
      if (hasComponent(this.world, eid, Dead)) continue;
      if (!sprite.visible) continue;

      const hp = Health.hp[eid];
      const maxHp = Health.maxHp[eid];
      if (maxHp <= 0) continue;

      const ratio = hp / maxHp;
      if (ratio >= 1) continue; // don't show at full HP

      const x = sprite.x + (TILE_SIZE - barW) / 2;
      const y = sprite.y + barYOffset;

      // Background
      this.hpBarGraphics.fillStyle(0x111122, 0.8);
      this.hpBarGraphics.fillRect(x, y, barW, barH);

      // Fill
      const color = ratio > 0.6 ? 0x4ec9b0 : ratio > 0.3 ? 0xc9a84e : 0xe94560;
      this.hpBarGraphics.fillStyle(color, 0.9);
      this.hpBarGraphics.fillRect(x, y, Math.round(barW * ratio), barH);
    }
  }

  // ════════════════════════════════════════════════════════════
  // TILE RENDERING
  // ════════════════════════════════════════════════════════════

  /** Get the texture key for a tile, using architecture-specific textures for floor/wall. */
  private getTileTexture(tileType: number): string {
    if (tileType === TileType.FLOOR) return archFloorTex(this.currentArchitectureId);
    if (tileType === TileType.WALL || tileType === TileType.HULL) return archWallTex(this.currentArchitectureId);
    return TEX.VOID;
  }

  private createTileSprites(): void {
    const { width, height } = this.tileMap;
    this.tileSprites = new Array(width * height).fill(null);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = this.tileMap.idx(x, y);
        const tex = this.getTileTexture(this.tileMap.tiles[idx]);
        const sprite = this.add.image(x * TILE_SIZE, y * TILE_SIZE, tex);
        sprite.setOrigin(0, 0);
        sprite.setVisible(false);
        this.tileContainer.add(sprite);
        this.tileSprites[idx] = sprite;
      }
    }
  }

  /** Update tile sprite textures and visibility based on FOV + lightmap. */
  private renderTiles(): void {
    const { width, height } = this.tileMap;
    const revealAll = this.sandbox?.revealAll;
    const useShader = !!this.lightmapFilter;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = this.tileMap.idx(x, y);
        const sprite = this.tileSprites[idx];
        if (!sprite) continue;

        sprite.setTexture(this.getTileTexture(this.tileMap.tiles[idx]));

        if (revealAll) {
          sprite.setVisible(true);
          sprite.setAlpha(1);
          sprite.setTint(0xffffff);
          continue;
        }

        const vis = this.tileMap.visibility[idx] as Visibility;

        if (vis === Visibility.UNSEEN) {
          sprite.setVisible(false);
          continue;
        }

        sprite.setVisible(true);
        sprite.setAlpha(1);

        if (useShader) {
          // Shader handles lighting — just render white
          sprite.setTint(0xffffff);
        } else if (vis === Visibility.VISIBLE) {
          // CPU fallback: apply lightmap as tint
          const lr = Math.min(255, Math.round(Math.max(0.06, this.lightmap.r[idx]) * 255));
          const lg = Math.min(255, Math.round(Math.max(0.06, this.lightmap.g[idx]) * 255));
          const lb = Math.min(255, Math.round(Math.max(0.06, this.lightmap.b[idx]) * 255));
          sprite.setTint((lr << 16) | (lg << 8) | lb);
        } else {
          // SEEN — solid desaturated gray
          sprite.setTint(0x607080);
        }
      }
    }
  }

  // ════════════════════════════════════════════════════════════
  // ENTITY SPRITES
  // ════════════════════════════════════════════════════════════

  private createEntitySprite(
    eid: number,
    speciesId?: string,
    textureKey?: string,
    container?: Phaser.GameObjects.Container,
  ): Phaser.GameObjects.Image {
    if (speciesId) this.entitySpecies.set(eid, speciesId);
    const tex = textureKey ?? speciesTexKey(this.entitySpecies.get(eid) ?? 'salvager');
    const px = Position.x[eid] * TILE_SIZE;
    const py = Position.y[eid] * TILE_SIZE;
    const sprite = this.add.image(px, py, tex);
    sprite.setOrigin(0, 0);
    const target = container ?? (Renderable.layer[eid] <= 1 ? this.objectContainer : this.entityContainer);
    target.add(sprite);
    this.entitySprites.set(eid, sprite);

    return sprite;
  }

  private destroyEntitySprite(eid: number): void {
    const sprite = this.entitySprites.get(eid);
    if (sprite) {
      sprite.destroy();
      this.entitySprites.delete(eid);
      this.entitySpecies.delete(eid);
    }
  }

  /** Create a sprite for an item entity on the floor. */
  private createItemSprite(eid: number): void {
    if (this.entitySprites.has(eid)) return;
    this.createEntitySprite(eid, undefined, TEX.ITEM, this.objectContainer);
  }

  /** Move an entity sprite to objectContainer if not already there (used on death). */
  private demoteToObjectLayer(sprite: Phaser.GameObjects.Image): void {
    if (this.objectContainer.exists(sprite)) return;
    this.entityContainer.remove(sprite);
    this.objectContainer.add(sprite);
  }

  /** Remove an entity sprite by eid. */
  private removeEntitySprite(eid: number): void {
    this.destroyEntitySprite(eid);
  }

  /** Sync entity sprite position with ECS (for non-animated updates) */
  private syncEntitySprite(eid: number): void {
    const sprite = this.entitySprites.get(eid);
    if (!sprite) return;
    const px = Position.x[eid] * TILE_SIZE;
    const py = Position.y[eid] * TILE_SIZE;
    sprite.setPosition(px, py);
  }

  // ════════════════════════════════════════════════════════════
  // INPUT
  // ════════════════════════════════════════════════════════════

  /**
   * E-key interaction state machine:
   * - Tap E (<300ms): open the relevant inventory for the selected floor target
   * - Hold E (≥1s): pick up all loose items (skip corpses)
   * - Hold E + W/S: selection mode — move the highlighted floor target
   * - Movement cancels hold
   */
  private handleInteractInput(delta: number): void {
    // Only allow interaction during player input phase (or in sandbox mode)
    if (this.turnSystem.phase !== TurnPhase.PLAYER_INPUT && !this.sandbox.active) {
      this.interactHoldActive = false;
      this.interactSelectionMode = false;
      this.hud.floorSelectedIndex = -1;
      this.hud.interactHoldProgress = 0;
      return;
    }

    const items = this.hud.floorItems;

    // Fast path: if there's nothing on the floor, E only opens inventory on tap
    if (items.length === 0) {
      this.interactSelectionMode = false;
      this.hud.floorSelectedIndex = -1;
      this.hud.interactHoldProgress = 0;

      if (Phaser.Input.Keyboard.JustDown(this.interactKey)) {
        this.interactHoldStart = this.time.now;
        this.interactHoldActive = true;
      }
      if (this.interactHoldActive && Phaser.Input.Keyboard.JustUp(this.interactKey)) {
        const holdDuration = this.time.now - this.interactHoldStart;
        if (holdDuration <= 300) inventoryStore.openPanel();
        this.interactHoldActive = false;
      } else if (!this.interactKey.isDown) {
        this.interactHoldActive = false;
      }
      return;
    }

    if (this.hud.floorSelectedIndex < 0 || this.hud.floorSelectedIndex >= items.length) {
      const preferredIndex = items.findIndex((thing) => thing.kind !== 'corpse');
      this.hud.floorSelectedIndex = preferredIndex >= 0 ? preferredIndex : 0;
    }

    // Dismiss keys overlay on E press
    if (this.hud.keysOpen && this.interactKey.isDown) {
      return; // KeysOverlay handles its own dismiss
    }

    // E just pressed — start tracking hold
    if (Phaser.Input.Keyboard.JustDown(this.interactKey)) {
      this.interactHoldStart = this.time.now;
      this.interactHoldActive = true;
      this.interactSelectionMode = false;
      this.hud.interactHoldProgress = 0;
    }

    // E is held
    if (this.interactHoldActive && this.interactKey.isDown) {
      // Check for movement keys — cancel hold if player moves
      const movingUp = this.cursors.up.isDown || this.wasd.W.isDown;
      const movingDown = this.cursors.down.isDown || this.wasd.S.isDown;
      const movingLeft = this.cursors.left.isDown || this.wasd.A.isDown;
      const movingRight = this.cursors.right.isDown || this.wasd.D.isDown;

      if (movingLeft || movingRight) {
        // Horizontal movement cancels hold entirely
        this.interactHoldActive = false;
        this.interactSelectionMode = false;
        this.hud.interactHoldProgress = 0;
        return;
      }

      // Up/down while holding E = selection mode
      if (movingUp || movingDown) {
        if (!this.interactSelectionMode) {
          this.interactSelectionMode = true;
          this.hud.interactHoldProgress = 0; // Cancel animation
        } else {
          // Move selection — use JustDown for step-by-step
          if (Phaser.Input.Keyboard.JustDown(this.cursors.up) || Phaser.Input.Keyboard.JustDown(this.wasd.W)) {
            this.hud.floorSelectedIndex = Math.max(0, this.hud.floorSelectedIndex - 1);
          }
          if (Phaser.Input.Keyboard.JustDown(this.cursors.down) || Phaser.Input.Keyboard.JustDown(this.wasd.S)) {
            this.hud.floorSelectedIndex = Math.min(items.length - 1, this.hud.floorSelectedIndex + 1);
          }
        }
      }

      // Update hold progress if not in selection mode
      if (!this.interactSelectionMode) {
        const holdDuration = this.time.now - this.interactHoldStart;

        this.hud.interactHoldProgress = Math.min(1, holdDuration / 1000);

        if (holdDuration >= 1000) {
          // Hold complete: loot all items + corpse inventories
          this.pickUpAllFloorItems();
          this.interactHoldActive = false;
          this.hud.interactHoldProgress = 0;
        }
      }
    }

    // E released — determine action
    if (this.interactHoldActive && Phaser.Input.Keyboard.JustUp(this.interactKey)) {
      const holdDuration = this.time.now - this.interactHoldStart;
      this.interactHoldActive = false;
      this.hud.interactHoldProgress = 0;

      if (this.interactSelectionMode) {
        // Act on selected item
        const idx = this.hud.floorSelectedIndex;
        if (idx >= 0 && idx < items.length) {
          this.interactWithSelectedFloorThing(items[idx]);
        }
        this.interactSelectionMode = false;
      } else if (holdDuration <= 300) {
        const idx = this.hud.floorSelectedIndex;
        if (idx >= 0 && idx < items.length) {
          this.interactWithSelectedFloorThing(items[idx]);
        } else {
          inventoryStore.openPanel();
        }
      }
    } else if (!this.interactKey.isDown) {
      // Ensure progress is reset if key is not down but we missed the JustUp event
      this.interactHoldActive = false;
      this.hud.interactHoldProgress = 0;
    }
  }

  private interactWithSelectedFloorThing(thing: { eid: number; kind: string }): void {
    this.interactWithFloorThing(thing);
  }

  private handleInventoryDrop(itemEid: number): void {
    if (this.turnSystem.phase !== TurnPhase.PLAYER_INPUT && !this.sandbox.active) return;
    if (!hasComponent(this.world, itemEid, HeldBy) || HeldBy.ownerEid[itemEid] !== this.playerEid) return;

    const x = Position.x[this.playerEid];
    const y = Position.y[this.playerEid];
    const name = getItemData(itemEid)?.name ?? getPartData(itemEid)?.name ?? 'item';

    drop(this.world, this.playerEid, itemEid, x, y);
    this.eventQueue.push({
      type: 'item_drop',
      entityId: this.playerEid,
      data: { itemEid },
    });
    gameLog.push(this.turnSystem.turnCount, 'system', `Dropped ${name}`);
    inventoryStore.notify();
    this.completeInventoryUiAction();
  }

  private handleInventoryPickUp(itemEid: number): void {
    if (this.turnSystem.phase !== TurnPhase.PLAYER_INPUT && !this.sandbox.active) return;
    if (!hasComponent(this.world, itemEid, Position)) return;

    const px = Position.x[this.playerEid];
    const py = Position.y[this.playerEid];
    if (Position.x[itemEid] !== px || Position.y[itemEid] !== py) return;

    if (!canPickUp(this.playerEid, itemEid)) {
      gameLog.push(this.turnSystem.turnCount, 'system', 'Inventory full!');
      return;
    }

    const name = getItemData(itemEid)?.name ?? getPartData(itemEid)?.name ?? 'item';
    this.removeEntitySprite(itemEid);
    pickUp(this.world, this.playerEid, itemEid);
    gameLog.push(this.turnSystem.turnCount, 'system', `Picked up ${name}`);
    inventoryStore.notify();
    this.completeInventoryUiAction();
  }

  private handleInventoryCraft(match: RecipeMatch): void {
    if (this.turnSystem.phase !== TurnPhase.PLAYER_INPUT && !this.sandbox.active) return;

    const outputEid = executeCraft(
      this.world,
      this.playerEid,
      match,
      this.eventQueue,
      this.turnSystem.turnCount,
    );

    if (outputEid >= 0 && hasComponent(this.world, outputEid, Position)) {
      this.eventQueue.push({
        type: 'item_drop',
        entityId: this.playerEid,
        data: { itemEid: outputEid },
      });
    }

    inventoryStore.clearSelection();
    this.completeInventoryUiAction();
  }

  private handleInventoryCrudeCraft(itemEids: number[]): void {
    if (this.turnSystem.phase !== TurnPhase.PLAYER_INPUT && !this.sandbox.active) return;
    if (itemEids.length < 2) return;

    executeCrudeCraft(
      this.world,
      this.playerEid,
      itemEids,
      this.eventQueue,
      this.turnSystem.turnCount,
    );

    inventoryStore.clearSelection();
    this.completeInventoryUiAction();
  }

  private handleCorpseTakeItem(ownerEid: number, itemEid: number): void {
    if (this.turnSystem.phase !== TurnPhase.PLAYER_INPUT && !this.sandbox.active) return;

    const success = transferItem(this.world, ownerEid, this.playerEid, itemEid);
    if (!success) {
      gameLog.push(this.turnSystem.turnCount, 'system', 'Inventory full!');
      return;
    }

    const name = getItemData(itemEid)?.name ?? 'item';
    gameLog.push(this.turnSystem.turnCount, 'system', `Took ${name}`);
    lootStore.notify();
    inventoryStore.notify();
    this.completeInventoryUiAction();
  }

  private handleCorpseTakePart(ownerEid: number, partEid: number): void {
    if (this.turnSystem.phase !== TurnPhase.PLAYER_INPUT && !this.sandbox.active) return;

    const success = takePartFromBody(this.world, partEid, ownerEid, this.playerEid);
    if (!success) {
      gameLog.push(this.turnSystem.turnCount, 'system', 'Inventory full!');
      return;
    }

    const name = getPartData(partEid)?.name ?? 'part';
    gameLog.push(this.turnSystem.turnCount, 'system', `Took ${name}`);
    lootStore.notify();
    inventoryStore.notify();
    bodyStore.notify();
    this.completeInventoryUiAction();
  }

  private completeInventoryUiAction(): void {
    if (this.sandbox.active) {
      this.drainAndRefresh();
      return;
    }

    this.turnSystem.deductEnergy(this.playerEid, 100);
    this.turnSystem.advance(this.world);
    this.drainAndRefresh(() => this.turnSystem.onPlayerAnimationComplete(this.world));
  }

  /** Act on a single floor thing — pick up item or loot corpse. */
  private interactWithFloorThing(thing: { eid: number; kind: string }): void {
    if (hasComponent(this.world, this.playerEid, Body) && Body.manipulation[this.playerEid] === 0) {
      gameLog.push(this.turnSystem.turnCount, 'system', 'Cannot interact — no manipulation');
      return;
    }
    if (thing.kind === 'corpse') {
      lootStore.loot(thing.eid);
    } else {
      if (!canPickUp(this.playerEid, thing.eid)) {
        gameLog.push(this.turnSystem.turnCount, 'system', 'Inventory full!');
        return;
      }
      const name = getItemData(thing.eid)?.name ?? getPartData(thing.eid)?.name ?? 'item';
      this.removeEntitySprite(thing.eid);
      pickUp(this.world, this.playerEid, thing.eid);
      gameLog.push(this.turnSystem.turnCount, 'system', `Picked up ${name}`);
      inventoryStore.notify();
      
      if (!this.sandbox.active) {
        this.turnSystem.deductEnergy(this.playerEid, 100);
        this.turnSystem.advance(this.world);
        this.drainAndRefresh(() => this.turnSystem.onPlayerAnimationComplete(this.world));
      }
    }
  }

  /** Pick up all loose items on the player's tile (skip corpses). */
  private pickUpAllFloorItems(): void {
    if (hasComponent(this.world, this.playerEid, Body) && Body.manipulation[this.playerEid] === 0) {
      gameLog.push(this.turnSystem.turnCount, 'system', 'Cannot interact — no manipulation');
      return;
    }

    let count = 0;
    let full = false;

    // 1. Pick up all loose items/parts on the floor
    const looseItems = this.hud.floorItems.filter(t => t.kind !== 'corpse');
    for (const item of looseItems) {
      if (!canPickUp(this.playerEid, item.eid)) {
        full = true;
        break;
      }
      this.removeEntitySprite(item.eid);
      pickUp(this.world, this.playerEid, item.eid);
      count++;
    }

    // 2. Loot all items and parts from corpses on the floor
    if (!full) {
      const corpses = this.hud.floorItems.filter(t => t.kind === 'corpse');
      for (const corpse of corpses) {
        const corpseItems = [...getItemsOf(corpse.eid)];
        for (const itemEid of corpseItems) {
          if (!transferItem(this.world, corpse.eid, this.playerEid, itemEid)) {
            full = true;
            break;
          }
          count++;
        }
        if (full) break;

        const parts = [...getPartsOf(corpse.eid)];
        for (const partEid of parts) {
          if (!takePartFromBody(this.world, partEid, corpse.eid, this.playerEid)) {
            full = true;
            break;
          }
          count++;
        }
        if (full) break;
      }
    }

    if (full && count === 0) {
      gameLog.push(this.turnSystem.turnCount, 'system', 'Inventory full!');
    }

    if (count > 0) {
      gameLog.push(this.turnSystem.turnCount, 'system', `Looted ${count} item${count > 1 ? 's' : ''}`);
      if (full) {
        gameLog.push(this.turnSystem.turnCount, 'system', 'Inventory full!');
      }
      inventoryStore.notify();
      lootStore.notify();
      bodyStore.notify();

      if (!this.sandbox.active) {
        this.turnSystem.deductEnergy(this.playerEid, 100);
        this.turnSystem.advance(this.world);
        this.drainAndRefresh(() => this.turnSystem.onPlayerAnimationComplete(this.world));
      }
    }
  }

  private handlePlayerInput(): void {
    if (this.inputCooldown > 0) return;

    // Unconscious: auto-wait so turns pass (physics/regen still process)
    if (hasComponent(this.world, this.playerEid, Body) && Body.consciousness[this.playerEid] < 10) {
      this.turnSystem.submitAction(0, 0);
      this.inputCooldown = 300;
      this.inputReleasedSinceAction = false;
      return;
    }

    if (inventoryStore.open || lootStore.open) return; // UI panel open — don't move

    let dx = 0;
    let dy = 0;

    if (this.cursors.left.isDown || this.wasd.A.isDown) dx = -1;
    else if (this.cursors.right.isDown || this.wasd.D.isDown) dx = 1;
    else if (this.cursors.up.isDown || this.wasd.W.isDown) dy = -1;
    else if (this.cursors.down.isDown || this.wasd.S.isDown) dy = 1;
    else if (this.waitKey.isDown) { dx = 0; dy = 0; }
    else return; // No input

    // Submit action if we have a direction (or wait)
    if (dx !== 0 || dy !== 0 || this.waitKey.isDown) {
      this.turnSystem.submitAction(dx, dy);
      this.inputCooldown = 150; // ms before next input
      this.inputReleasedSinceAction = false;
    }
  }

  /** Returns true if any movement or wait key is currently held. */
  private hasPlayerInput(): boolean {
    return this.cursors.left.isDown || this.wasd.A.isDown ||
      this.cursors.right.isDown || this.wasd.D.isDown ||
      this.cursors.up.isDown || this.wasd.W.isDown ||
      this.cursors.down.isDown || this.wasd.S.isDown ||
      this.waitKey.isDown;
  }

  /** Snap every entity sprite to its committed ECS position, resetting visual state.
   *  Shader handles lighting/tinting — sprites just need white tint and full alpha. */
  private syncAllEntitySprites(): void {
    for (const [eid, sprite] of this.entitySprites) {
      if (hasComponent(this.world, eid, Dead) && hasComponent(this.world, eid, Body)) {
        sprite.setTint(0x444444);
        sprite.setAlpha(0.7);
        sprite.setScale(1);
        this.demoteToObjectLayer(sprite);
      } else {
        sprite.setTint(0xffffff);
        sprite.setAlpha(1);
        sprite.setScale(1);
      }
      this.syncEntitySprite(eid);
    }
  }

  /**
   * Interrupt all running animations: kill tweens, flush event queue,
   * clean up dead entities, snap sprites to committed state, and
   * return to PLAYER_INPUT phase.
   */
  /**
   * Interrupt running animations: complete all tweens (snap to end + fire
   * onComplete), flush any remaining events, clean up, and run the turn
   * bookkeeping that the drain callback would have performed.
   *
   * Only valid during ENEMY_ANIMATION phase.
   */
  private interruptAnimations(): void {
    if (this.turnSystem.phase !== TurnPhase.ENEMY_ANIMATION) return;

    // Enable skip mode so event handlers triggered by tween completion
    // resolve instantly instead of creating new tweens
    this.eventQueue.skipMode = true;

    // Complete all running tweens — snaps to end values and fires
    // onComplete, which chains through the event queue with skipMode on
    for (const tween of this.tweens.getTweens()) {
      tween.complete();
    }

    // Safety net: flush anything the tween chain didn't reach
    if (this.eventQueue.isDraining || this.eventQueue.length > 0) {
      this.eventQueue.flushAll();
    }

    this.cleanupDeadEntities();
    this.syncAllEntitySprites();
    this.updateFOV();
    this.renderTiles();
    this.updateDebugOverlays();
    this.eventQueue.skipMode = false;

    // Run the turn bookkeeping that the drain callback would have done:
    // tick energy, increment turnCount, determine next actor
    this.turnSystem.onEnemyAnimationComplete(this.world);
  }

  /** Process dead entities: Body entities become corpses, others are removed. */
  private cleanupDeadEntities(): void {
    const dead = query(this.world, [Dead]);
    for (const eid of [...dead]) {
      if (hasComponent(this.world, eid, Body) && hasComponent(this.world, eid, Turn)) {
        // Fresh kill — transition to corpse (strip active components, keep entity)
        this.transitionToCorpse(eid);
      } else if (!hasComponent(this.world, eid, Body)) {
        // Non-body entity — remove entirely
        this.removeDeadEntity(eid);
      }
      // else: already a corpse (Body + Dead, no Turn) — skip
    }
  }

  /** Strip active components from a dead Body entity, turning it into a lootable corpse. */
  private transitionToCorpse(eid: number): void {
    if (hasComponent(this.world, eid, Turn)) removeComponent(this.world, eid, Turn);
    if (hasComponent(this.world, eid, AI)) removeComponent(this.world, eid, AI);
    if (hasComponent(this.world, eid, FOV)) removeComponent(this.world, eid, FOV);
    if (hasComponent(this.world, eid, BlocksMovement)) removeComponent(this.world, eid, BlocksMovement);
    // Update tile blockage map
    const idx = this.tileMap.idx(Position.x[eid], Position.y[eid]);
    this.tileMap.entityBlocksMovement[idx] = 0;
    clearEntityAICache(eid);

    // Desaturated dark tint — corpse looks drained/lifeless
    const sprite = this.entitySprites.get(eid);
    if (sprite) {
      sprite.setTint(0x667788);
      sprite.setAlpha(0.8);
    }
  }

  // ════════════════════════════════════════════════════════════
  // ACTION PROCESSING
  // ════════════════════════════════════════════════════════════

  private processPlayerAction(): void {
    const action = this.turnSystem.pendingAction;
    if (!action) return;
    this.turnSystem.pendingAction = null;

    const { dx, dy } = action;

    // Check for bump-attack (non-wait moves only)
    if (dx !== 0 || dy !== 0) {
      const toX = Position.x[this.playerEid] + dx;
      const toY = Position.y[this.playerEid] + dy;
      const blockingEid = getBlockingEntity(toX, toY, this.playerEid, this.world);
      if (blockingEid >= 0 && !hasComponent(this.world, blockingEid, Dead)) {
        const myFaction = Faction.factionIndex[this.playerEid];
        const theirFaction = Faction.factionIndex[blockingEid];
        if (areHostile(myFaction, theirFaction)) {
          performAttack(this.playerEid, blockingEid, this.world, this.eventQueue);
          this.turnSystem.deductEnergy(this.playerEid, 100);
          this.turnSystem.advance(this.world);
          this.drainAndRefresh(() => this.turnSystem.onPlayerAnimationComplete(this.world));
          return;
        }
      }
    }

    // Block movement if immobile (mobility = 0), but allow wait
    const mobilityMult = getMovementCostMultiplier(this.playerEid);
    if ((dx !== 0 || dy !== 0) && !isFinite(mobilityMult)) {
      gameLog.push(this.turnSystem.turnCount, 'system', 'Cannot move — immobile');
      // Still costs a turn (waiting)
      this.turnSystem.deductEnergy(this.playerEid, 100);
      this.turnSystem.advance(this.world);
      this.drainAndRefresh(() => this.turnSystem.onPlayerAnimationComplete(this.world));
      return;
    }

    // Try to move
    const result = tryMove(this.playerEid, dx, dy, this.tileMap, this.eventQueue, this.world);

    // Auto-pickup: if player moved onto a tile with items, pick up if only one + space
    const canManipulate = !hasComponent(this.world, this.playerEid, Body) || Body.manipulation[this.playerEid] > 0;
    if (result.cost > 0 && canManipulate) {
      const px = Position.x[this.playerEid];
      const py = Position.y[this.playerEid];
      const floorItems = findItemsAtPosition(px, py, 10000);
      if (floorItems.length === 1 && canPickUp(this.playerEid, floorItems[0])) {
        const itemEid = floorItems[0];
        const name = getItemData(itemEid)?.name ?? 'item';
        this.removeEntitySprite(itemEid);
        pickUp(this.world, this.playerEid, itemEid);
        gameLog.push(this.turnSystem.turnCount, 'system', `Picked up ${name}`);
        inventoryStore.notify();
      } else if (floorItems.length > 1) {
        // Multiple items — open inventory to show floor items
        inventoryStore.openPanel();
      }
    }

    // Deduct energy — movement cost scaled by mobility, wall bump/wait is fixed
    const cost = result.cost > 0 ? Math.round(result.cost * mobilityMult) : 100;
    this.turnSystem.deductEnergy(this.playerEid, cost);

    // Advance to animation phase
    this.turnSystem.advance(this.world);
    this.drainAndRefresh(() => this.turnSystem.onPlayerAnimationComplete(this.world));
  }

  /** Run all physics systems for one turn: doors, fluids, fire, gas, contamination. */
  private runPhysics(): void {
    syncDoorOverlays(this.tileMap, this.world);
    processFluidSystem(this.tileMap, this.tilePhysics, this.world, this.entityPhysics, this.eventQueue);
    processFireSystem(this.tileMap, this.tilePhysics, this.world, this.entityPhysics, this.eventQueue);
    processGasSystem(this.tileMap, this.tilePhysics, this.world, this.entitySpecies, this.eventQueue);
    processBodySystem(this.world, this.eventQueue);
    this.entityPhysics.tick();
  }

  /**
   * Drain the visual event queue then run post-turn cleanup.
   * If no events are queued, runs cleanup immediately.
   * @param onComplete Extra callback after cleanup (turn-system transitions etc.)
   */
  private drainAndRefresh(onComplete?: () => void): void {
    const refresh = () => {
      this.cleanupDeadEntities();
      this.updateFOV();
      this.renderTiles();
      this.renderPhysicsOverlays();
      this.updateDebugOverlays();
      onComplete?.();
    };

    if (this.eventQueue.length > 0) {
      this.eventQueue.drain(refresh);
    } else {
      this.renderPhysicsOverlays();
      this.updateDebugOverlays();
      onComplete?.();
    }
  }

  /** Process enemy turn with AI behaviours, combat, and physics. */
  private processEnemyTurn(): void {
    processAITurns(this.world, this.tileMap, this.eventQueue);
    this.runPhysics();
    this.turnSystem.advance(this.world);
    this.drainAndRefresh(() => this.turnSystem.onEnemyAnimationComplete(this.world));
  }

  // ════════════════════════════════════════════════════════════
  // VISUAL EVENT HANDLERS
  // ════════════════════════════════════════════════════════════

  private registerEventHandlers(): void {
    // ── Move event (FOV-aware) ──
    this.eventQueue.registerHandler('move', (event: VisualEvent, onComplete: () => void) => {
      const { fromX, fromY, toX, toY } = event.data as {
        fromX: number; fromY: number; toX: number; toY: number;
      };
      const sprite = this.entitySprites.get(event.entityId);
      if (!sprite) {
        onComplete();
        return;
      }

      const isPlayer = event.entityId === this.playerEid;
      const revealAll = !!this.sandbox?.revealAll;
      const fromVis = isPlayer || revealAll || this.tileMap.getVisibility(fromX, fromY) === Visibility.VISIBLE;
      const toVis = isPlayer || revealAll || this.tileMap.getVisibility(toX, toY) === Visibility.VISIBLE;

      // Both tiles outside FOV — snap instantly, keep hidden
      if (this.eventQueue.skipMode || (!fromVis && !toVis)) {
        sprite.setPosition(toX * TILE_SIZE, toY * TILE_SIZE);
        if (!isPlayer) sprite.setVisible(toVis);
        onComplete();
        return;
      }

      // Entering FOV — snap to destination, show
      if (!fromVis && toVis) {
        sprite.setPosition(toX * TILE_SIZE, toY * TILE_SIZE);
        sprite.setVisible(true);
        onComplete();
        return;
      }

      // Leaving FOV — tween out then hide
      if (fromVis && !toVis) {
        this.tweens.add({
          targets: sprite,
          x: toX * TILE_SIZE,
          y: toY * TILE_SIZE,
          duration: MOVE_DURATION,
          ease: 'Quad.easeInOut',
          onComplete: () => {
            sprite.setVisible(false);
            onComplete();
          },
        });
        return;
      }

      // Both visible — normal tween
      this.tweens.add({
        targets: sprite,
        x: toX * TILE_SIZE,
        y: toY * TILE_SIZE,
        duration: MOVE_DURATION,
        ease: 'Quad.easeInOut',
        onComplete: () => onComplete(),
      });
    });

    // ── Teleport event — fade out at source, snap to dest, fade in ──
    this.eventQueue.registerHandler('teleport', (event: VisualEvent, onComplete: () => void) => {
      const { toX, toY } = event.data as {
        fromX: number; fromY: number; toX: number; toY: number;
      };
      const sprite = this.entitySprites.get(event.entityId);
      if (!sprite || this.eventQueue.skipMode) {
        if (sprite) sprite.setPosition(toX * TILE_SIZE, toY * TILE_SIZE);
        onComplete();
        return;
      }

      // Fade out at source
      this.tweens.add({
        targets: sprite,
        alpha: 0,
        scaleX: 0.3,
        scaleY: 0.3,
        duration: 150,
        ease: 'Quad.easeIn',
        onComplete: () => {
          // Snap to destination
          sprite.setPosition(toX * TILE_SIZE, toY * TILE_SIZE);
          // Fade in at destination
          this.tweens.add({
            targets: sprite,
            alpha: 1,
            scaleX: 1,
            scaleY: 1,
            duration: 150,
            ease: 'Quad.easeOut',
            onComplete: () => onComplete(),
          });
        },
      });
    });

    // ── Door open event ──
    this.eventQueue.registerHandler('door_open', (event: VisualEvent, onComplete: () => void) => {
      const doorEid = event.entityId;
      const sprite = this.entitySprites.get(doorEid);

      if (!sprite || this.eventQueue.skipMode) {
        // Still swap texture even if skipping
        if (sprite) sprite.setTexture(TEX.DOOR_OPEN);
        onComplete();
        return;
      }

      // Flash then swap texture to open
      this.tweens.add({
        targets: sprite,
        alpha: 0.5,
        duration: DOOR_DURATION / 2,
        yoyo: true,
        onComplete: () => {
          sprite.setTexture(TEX.DOOR_OPEN);
          onComplete();
        },
      });
    });

    // ── Door close event ──
    this.eventQueue.registerHandler('door_close', (event: VisualEvent, onComplete: () => void) => {
      onComplete();
    });

    // ── Hit flash event (FOV-aware) ──
    this.eventQueue.registerHandler('hit_flash', (event: VisualEvent, onComplete: () => void) => {
      const sprite = this.entitySprites.get(event.entityId);
      const ex = Position.x[event.entityId];
      const ey = Position.y[event.entityId];
      const visible = this.tileMap.getVisibility(ex, ey) === Visibility.VISIBLE;
      if (!sprite || this.eventQueue.skipMode || !visible) {
        onComplete();
        return;
      }

      // Flash red then restore
      const isCorpse = hasComponent(this.world, event.entityId, Dead) && hasComponent(this.world, event.entityId, Body);
      sprite.setTint(0xff2222);
      this.tweens.add({
        targets: sprite,
        alpha: 0.6,
        duration: HIT_FLASH_DURATION / 2,
        yoyo: true,
        onComplete: () => {
          sprite.setTint(isCorpse ? 0x664422 : 0xffffff);
          sprite.setAlpha(isCorpse ? 0.7 : 1);
          onComplete();
        },
      });
    });

    // ── Death event (FOV-aware) ──
    // Visual only — the commit callback (in performAttack) marks Dead.
    // Actual entity removal happens in cleanupDeadEntities() after drain.
    this.eventQueue.registerHandler('death', (event: VisualEvent, onComplete: () => void) => {
      const eid = event.entityId;
      const sprite = this.entitySprites.get(eid);
      const ex = Position.x[eid];
      const ey = Position.y[eid];
      const visible = this.tileMap.getVisibility(ex, ey) === Visibility.VISIBLE;
      const isBody = hasComponent(this.world, eid, Body);

      if (!sprite || this.eventQueue.skipMode || !visible) {
        if (isBody) {
          // Corpse: apply final appearance immediately
          if (sprite) {
            sprite.setTint(0x664422);
            sprite.setAlpha(0.7);
            this.demoteToObjectLayer(sprite);
          }
        } else {
          this.destroyEntitySprite(eid);
        }
        onComplete();
        return;
      }

      // Clear any lingering tint from hit_flash before death animation
      sprite.setTint(0xffffff);
      sprite.setAlpha(1);

      if (isBody) {
        // Corpse: fade to bloody brown tint
        this.tweens.add({
          targets: sprite,
          alpha: 0.7,
          duration: DEATH_DURATION,
          ease: 'Quad.easeOut',
          onComplete: () => {
            sprite.setTint(0x664422);
            this.demoteToObjectLayer(sprite);
            onComplete();
          },
        });
      } else {
        // Non-body: scale-down death animation + destroy
        this.tweens.add({
          targets: sprite,
          scaleX: 0,
          scaleY: 0,
          alpha: 0,
          duration: DEATH_DURATION,
          ease: 'Quad.easeIn',
          onComplete: () => {
            this.destroyEntitySprite(eid);
            onComplete();
          },
        });
      }
    });

    // ── Fire spread event ──
    this.eventQueue.registerHandler('fire_spread', (event: VisualEvent, onComplete: () => void) => {
      const { x, y } = event.data as { x: number; y: number };
      const visible = this.sandbox?.revealAll ||
        this.tileMap.getVisibility(x, y) === Visibility.VISIBLE;

      // Always update the overlay (fire state is committed)
      this.updateFireOverlay(x, y);

      if (!visible || this.eventQueue.skipMode) {
        onComplete();
        return;
      }

      // Ignition particle burst
      const px = x * TILE_SIZE + TILE_SIZE / 2;
      const py = y * TILE_SIZE + TILE_SIZE / 2;
      const emitter = this.add.particles(px, py, TEX.FIRE_PARTICLE, {
        speed: { min: 20, max: 60 },
        angle: { min: 200, max: 340 },
        lifespan: 400,
        alpha: { start: 1, end: 0 },
        scale: { start: 1.5, end: 0.3 },
        quantity: 6,
        blendMode: 'ADD',
        emitting: false,
      });
      emitter.explode(6);

      // Short delay for visual impact, then complete
      this.time.delayedCall(200, () => {
        emitter.destroy();
        onComplete();
      });
    });

    // ── Fluid spread event ──
    this.eventQueue.registerHandler('fluid_spread', (event: VisualEvent, onComplete: () => void) => {
      const { x, y } = event.data as { x: number; y: number; fluidId: string; color: string };
      const visible = this.sandbox?.revealAll ||
        this.tileMap.getVisibility(x, y) === Visibility.VISIBLE;

      // Update fluid overlay
      this.updateFluidOverlay(x, y);

      if (!visible || this.eventQueue.skipMode) {
        onComplete();
        return;
      }

      // Alpha fade-in for new fluid tile
      const idx = this.tileMap.idx(x, y);
      const overlay = this.fluidOverlays.get(idx);
      if (overlay) {
        overlay.setAlpha(0);
        this.tweens.add({
          targets: overlay,
          alpha: 0.5,
          duration: 200,
          onComplete: () => onComplete(),
        });
      } else {
        onComplete();
      }
    });

    // ── Gas spread event ──
    this.eventQueue.registerHandler('gas_spread', (event: VisualEvent, onComplete: () => void) => {
      const { x, y } = event.data as { x: number; y: number; gasId: string; color: string };
      const visible = this.sandbox?.revealAll ||
        this.tileMap.getVisibility(x, y) === Visibility.VISIBLE;

      // Update gas overlay
      this.updateGasOverlay(x, y);

      if (!visible || this.eventQueue.skipMode) {
        onComplete();
        return;
      }

      // Fade-in for new gas tile
      const idx = this.tileMap.idx(x, y);
      const overlay = this.gasOverlays.get(idx);
      if (overlay) {
        overlay.setAlpha(0);
        this.tweens.add({
          targets: overlay,
          alpha: 0.35,
          duration: 300,
          onComplete: () => onComplete(),
        });
      } else {
        onComplete();
      }
    });

    // ── Tile destroyed event (e.g. door burned down) ──
    this.eventQueue.registerHandler('tile_destroyed', (event: VisualEvent, onComplete: () => void) => {
      const { x, y, newTileIndex } = event.data as { x: number; y: number; newTileIndex: number };
      const idx = this.tileMap.idx(x, y);
      const sprite = this.tileSprites[idx];

      // Update tile sprite texture
      if (sprite) {
        sprite.setTexture(this.getTileTexture(newTileIndex));
      }

      // Clean up any fire/fluid/gas overlays on this tile
      this.updateFireOverlay(x, y);
      this.updateFluidOverlay(x, y);
      this.updateGasOverlay(x, y);

      onComplete();
    });

    // ── Explosion event (gas ignition, etc.) ──
    this.eventQueue.registerHandler('explosion', (event: VisualEvent, onComplete: () => void) => {
      const { x, y, radius } = event.data as { x: number; y: number; radius: number };
      const visible = this.sandbox?.revealAll ||
        this.tileMap.getVisibility(x, y) === Visibility.VISIBLE;

      if (!visible || this.eventQueue.skipMode) {
        onComplete();
        return;
      }

      const px = x * TILE_SIZE + TILE_SIZE / 2;
      const py = y * TILE_SIZE + TILE_SIZE / 2;

      // Camera shake
      this.cameras.main.shake(300, 0.01 * (radius + 1));

      // Central flash
      const flash = this.add.image(px, py, TEX.EXPLOSION_PARTICLE);
      flash.setScale(radius * 2);
      flash.setAlpha(0.9);
      flash.setBlendMode('ADD');
      this.tweens.add({
        targets: flash,
        alpha: 0,
        scale: radius * 3,
        duration: 350,
        ease: 'Quad.easeOut',
        onComplete: () => flash.destroy(),
      });

      // Particle burst
      const emitter = this.add.particles(px, py, TEX.EXPLOSION_PARTICLE, {
        speed: { min: 30, max: 100 },
        angle: { min: 0, max: 360 },
        lifespan: { min: 200, max: 500 },
        alpha: { start: 1, end: 0 },
        scale: { start: 1.5, end: 0.2 },
        quantity: 12,
        blendMode: 'ADD',
        emitting: false,
      });
      emitter.explode(12);

      this.time.delayedCall(400, () => {
        emitter.destroy();
        onComplete();
      });
    });

    // ── Part hit event — flash body red, show part name ──
    this.eventQueue.registerHandler('part_hit', (event: VisualEvent, onComplete: () => void) => {
      const sprite = this.entitySprites.get(event.entityId);
      if (!sprite || this.eventQueue.skipMode) {
        onComplete();
        return;
      }
      sprite.setTint(0xff4444);
      this.time.delayedCall(120, () => {
        sprite.clearTint();
        onComplete();
      });
    });

    // ── Part severed — flash body, create part sprite on floor ──
    this.eventQueue.registerHandler('part_severed', (event: VisualEvent, onComplete: () => void) => {
      const { partEid, x, y } = event.data as { partEid: number; partName: string; x: number; y: number };
      const bodySprite = this.entitySprites.get(event.entityId);

      // Create floor sprite for severed part
      this.createEntitySprite(partEid, undefined, TEX.SEVERED_PART);

      if (!bodySprite || this.eventQueue.skipMode) {
        onComplete();
        return;
      }

      // Flash body white briefly
      bodySprite.setTint(0xffffff);
      this.time.delayedCall(150, () => {
        bodySprite.clearTint();
        onComplete();
      });
    });

    // ── Part deactivated — brief dim on body ──
    this.eventQueue.registerHandler('part_deactivated', (event: VisualEvent, onComplete: () => void) => {
      const sprite = this.entitySprites.get(event.entityId);
      if (!sprite || this.eventQueue.skipMode) {
        onComplete();
        return;
      }
      sprite.setTint(0x666666);
      this.time.delayedCall(100, () => {
        sprite.clearTint();
        onComplete();
      });
    });

    // ── Part destroyed (on floor) — remove sprite ──
    this.eventQueue.registerHandler('part_destroyed', (event: VisualEvent, onComplete: () => void) => {
      this.destroyEntitySprite(event.entityId);
      onComplete();
    });

    // ── Item pickup — brief scale-down on item sprite ──
    this.eventQueue.registerHandler('item_pickup', (_event: VisualEvent, onComplete: () => void) => {
      onComplete();
    });

    // ── Item drop — sprite appears at drop location ──
    this.eventQueue.registerHandler('item_drop', (event: VisualEvent, onComplete: () => void) => {
      const itemEid = event.data.itemEid as number;
      if (hasComponent(this.world, itemEid, Position) && !this.entitySprites.has(itemEid)) {
        const textureKey = hasComponent(this.world, itemEid, PartIdentity) ? TEX.SEVERED_PART : TEX.ITEM;
        this.createEntitySprite(itemEid, undefined, textureKey, this.objectContainer);
      }
      onComplete();
    });

    // ── Craft success — brief flash on crafter ──
    this.eventQueue.registerHandler('craft_success', (event: VisualEvent, onComplete: () => void) => {
      const sprite = this.entitySprites.get(event.entityId);
      if (!sprite || this.eventQueue.skipMode) {
        onComplete();
        return;
      }
      sprite.setTint(0x55ffbb);
      this.time.delayedCall(200, () => {
        sprite.clearTint();
        onComplete();
      });
    });
  }

  /** Remove a dead entity from world and visual layer. */
  private removeDeadEntity(eid: number): void {
    // Clear door overlay if this was a door entity
    if (hasComponent(this.world, eid, Door)) {
      const idx = this.tileMap.idx(Position.x[eid], Position.y[eid]);
      this.tileMap.entityBlocksMovement[idx] = 0;
      this.tileMap.entityBlocksLight[idx] = 0;
    }
    // Clean up attached body parts when a creature dies
    if (hasComponent(this.world, eid, Body)) {
      const parts = getPartsOf(eid);
      for (const partEid of parts) {
        this.destroyEntitySprite(partEid);
        removeEntity(this.world, partEid);
      }
      clearPartIndex(eid);
    }
    this.destroyEntitySprite(eid);
    this.sandbox.pinnedOverlays.delete(eid);
    this.entityPhysics.delete(eid);
    clearEntityAICache(eid);
    removeEntity(this.world, eid);
  }

  // ════════════════════════════════════════════════════════════
  // DUNGEON GENERATION
  // ════════════════════════════════════════════════════════════

  /** Apply pre-placed arrival events (fire, gas leaks) to the tile physics map. */
  private applyArrivalEvents(events: ArrivalEvent[]): void {
    for (const event of events) {
      if (!this.tileMap.inBounds(event.x, event.y)) continue;
      switch (event.type) {
        case 'fire':
          this.tilePhysics.addSurfaceState(event.x, event.y, 'on_fire');
          {
            const state = this.tilePhysics.get(event.x, event.y);
            if (state) state.temperature = Math.min(500, state.temperature + 100);
          }
          break;
        case 'gas_leak':
          this.tilePhysics.addGas(event.x, event.y, 'smoke', 0.4);
          break;
      }
    }
  }

  /** Regenerate the entire ship. Destroys all existing state and rebuilds. */
  private regenerateShip(opts?: { seed?: string }): void {
    // ── Clear existing state ──
    // Destroy all entity sprites
    for (const [eid] of this.entitySprites) {
      this.destroyEntitySprite(eid);
    }
    this.entitySprites.clear();
    this.entitySpecies.clear();
    this.entityPhysics.clear();

    // Destroy nebula background
    if (this.nebulaBg) this.nebulaBg.destroy();

    // Destroy tile sprites and clear containers
    for (const sprite of this.tileSprites) {
      sprite?.destroy();
    }
    this.tileSprites = [];
    this.tileContainer.removeAll(true);
    this.overlayContainer.removeAll(true);
    this.objectContainer.removeAll(true);
    this.entityContainer.removeAll(true);

    // Destroy fire/fluid/gas overlays
    for (const [, sprite] of this.fireOverlays) sprite.destroy();
    this.fireOverlays.clear();
    for (const [, emitter] of this.fireEmitters) emitter.destroy();
    this.fireEmitters.clear();
    for (const [, sprite] of this.fluidOverlays) sprite.destroy();
    this.fluidOverlays.clear();
    for (const [, sprite] of this.gasOverlays) sprite.destroy();
    this.gasOverlays.clear();
    for (const [, emitter] of this.gasEmitters) emitter.destroy();
    this.gasEmitters.clear();

    // Clear debug overlays
    this.clearDebugOverlays();
    if (this.shipGraphOverlay) {
      this.shipGraphOverlay.destroy();
      this.shipGraphOverlay = null;
    }
    for (const t of this.shipGraphLabels) t.destroy();
    this.shipGraphLabels = [];
    this.sandbox.pinnedOverlays.clear();

    // Remove all ECS entities — clean up body parts first
    const bodyEntities = query(this.world, [Body]);
    for (const eid of [...bodyEntities]) {
      const parts = getPartsOf(eid);
      for (const partEid of parts) {
        removeEntity(this.world, partEid);
      }
      clearPartIndex(eid);
    }
    const allEntities = query(this.world, [Position]);
    for (const eid of [...allEntities]) {
      clearEntityAICache(eid);
      removeEntity(this.world, eid);
    }

    // ── Generate new ship ──
    const shipResult = generateShip(opts?.seed);
    this.tileMap = shipResult.tileMap;
    this.currentSeed = shipResult.seed;
    this.currentArchitectureId = shipResult.graph.architecture;
    this.currentRooms = shipResult.rooms;
    this.shipGraphData = shipResult.graph;
    console.log(`[dungeon] Regenerated ship with seed "${this.currentSeed}", arch="${this.currentArchitectureId}", ${shipResult.rooms.length} rooms`);
    gameLog.clear();

    // Update HUD bindings for new ship
    this.hud.bindRooms(this.currentRooms);
    {
      const reg = getRegistry();
      const shipTypeData = reg.shipTypes.get(shipResult.graph.shipType);
      this.hud.bindShipType(shipTypeData?.name ?? shipResult.graph.shipType);
    }

    // ── Rebuild physics ──
    this.tilePhysics = new TilePhysicsMap(this.tileMap.width, this.tileMap.height);

    // ── Spawn door entities ──
    for (const door of shipResult.doors) {
      const eid = spawnDoor(this.world, { x: door.x, y: door.y });
      const idx = this.tileMap.idx(door.x, door.y);
      this.tileMap.entityBlocksMovement[idx] = 1;
      this.tileMap.entityBlocksLight[idx] = 1;
    }

    // ── Spawn teleporter entities ──
    for (const pair of shipResult.teleporters) {
      const eidA = spawnTeleporter(this.world, pair.a.x, pair.a.y);
      const eidB = spawnTeleporter(this.world, pair.b.x, pair.b.y);
      linkTeleporters(eidA, eidB);
    }

    this.applyArrivalEvents(shipResult.arrivalEvents);

    // ── Spawn player ──
    const registry = getRegistry();
    const playerSpecies = registry.species.get('salvager');
    this.playerEid = spawnPlayer(this.world, {
      x: shipResult.playerSpawn.x,
      y: shipResult.playerSpawn.y,
      speed: playerSpecies?.speed ?? 100,
      viewRange: playerSpecies?.fovRange ?? 8,
      maxHp: playerSpecies?.maxHp ?? 25,
      attackDamage: playerSpecies?.attackDamage ?? [5, 5],
      faction: playerSpecies?.faction ?? 'player',
    });
    if (playerSpecies) {
      spawnBodyForCreature(this.world, this.playerEid, playerSpecies, registry);
    }
    Turn.energy[this.playerEid] = 100;

    // Give player an inventory
    addComponent(this.world, this.playerEid, Inventory);
    Inventory.capacity[this.playerEid] = 20;
    Inventory.usedVolume[this.playerEid] = 0;

    // ── Nebula background ──
    const worldW = this.tileMap.width * TILE_SIZE;
    const worldH = this.tileMap.height * TILE_SIZE;
    this.nebulaBg = this.add.tileSprite(0, 0, worldW * 2, worldH * 2, TEX.NEBULA);
    this.nebulaBg.setOrigin(0, 0);
    this.nebulaBg.setPosition(-worldW * 0.5, -worldH * 0.5);
    this.nebulaBg.setScrollFactor(0.3);
    // Send behind containers
    this.nebulaBg.setDepth(-1);

    // ── Rebuild tile sprites ──
    this.createTileSprites();

    // ── Create door sprites ──
    for (const eid of query(this.world, [Door, Position])) {
      this.createEntitySprite(eid, undefined, TEX.DOOR_CLOSED);
    }

    // ── Create teleporter sprites ──
    for (const eid of query(this.world, [Teleporter, Position])) {
      this.createEntitySprite(eid, undefined, TEX.TELEPORTER);
    }

    // ── Create player sprite ──
    this.createEntitySprite(this.playerEid, 'salvager');

    // ── Spawn entities ──
    this.spawnMapEntities(shipResult.spawns);

    // ── Rebuild lightmap for new map dimensions ──
    this.lightmap = new Lightmap(this.tileMap.width, this.tileMap.height);
    this.lightmapCanvas.width = this.tileMap.width;
    this.lightmapCanvas.height = this.tileMap.height;
    this.visCanvas.width = this.tileMap.width;
    this.visCanvas.height = this.tileMap.height;
    this.fireLightSources.clear();
    this.addRoomLights();
    if (this.lightmapFilter) {
      this.lightmapFilter.mapSize = [this.tileMap.width, this.tileMap.height];
    }

    // ── Rebind sandbox refs ──
    this.sandbox.bind(this.tileMap, this.world, this.turnSystem, this.eventQueue, this.tilePhysics, this.lightmap);

    // ── Camera — always centered on player, no bounds ──
    this.cameras.main.removeBounds();
    const playerSprite = this.entitySprites.get(this.playerEid)!;
    this.cameras.main.startFollow(playerSprite, true, 0.15, 0.15,
      -TILE_SIZE / 2, -TILE_SIZE / 2);

    // ── Reset turn system ──
    this.turnSystem.reset();

    // ── FOV + render ──
    this.revealExterior();
    this.updateFOV();
    this.renderTiles();
    this.renderPhysicsOverlays();

    // Re-place spark zones for new map
    this.placeSparkZones();

    this.sandbox.emit('state_changed');
  }

  /** Get current ship seed (for sandbox display). */
  getCurrentSeed(): string { return this.currentSeed; }

  /** Get current rooms (for sandbox display). */
  getCurrentRooms(): RoomInfo[] { return this.currentRooms; }

  // ════════════════════════════════════════════════════════════
  // PHYSICS OVERLAYS
  // ════════════════════════════════════════════════════════════

  /** Create or update fire overlay for a tile. */
  private updateFireOverlay(x: number, y: number): void {
    const idx = this.tileMap.idx(x, y);
    const isOnFire = this.tilePhysics.hasSurfaceState(x, y, 'on_fire');

    if (isOnFire && !this.fireOverlays.has(idx)) {
      // Create fire sprite in entity layer (not overlay)
      const sprite = this.add.image(x * TILE_SIZE, y * TILE_SIZE, TEX.FIRE_SPRITE);
      sprite.setOrigin(0, 0);
      sprite.setBlendMode('ADD');
      sprite.setDepth(1);
      this.entityContainer.add(sprite);
      this.fireOverlays.set(idx, sprite);

      // Flicker tween on the fire sprite
      this.tweens.add({
        targets: sprite,
        alpha: { from: 0.7, to: 1.0 },
        scaleX: { from: 0.9, to: 1.1 },
        scaleY: { from: 0.95, to: 1.05 },
        duration: 300,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });

      // Create fire particle emitter for smoke/sparks
      const emitter = this.add.particles(
        x * TILE_SIZE + TILE_SIZE / 2,
        y * TILE_SIZE + TILE_SIZE / 2,
        TEX.FIRE_PARTICLE,
        {
          speed: { min: 8, max: 25 },
          angle: { min: 250, max: 290 },
          lifespan: { min: 400, max: 800 },
          alpha: { start: 0.8, end: 0 },
          scale: { start: 1, end: 0.2 },
          frequency: 300,
          quantity: 1,
          blendMode: 'ADD',
        },
      );
      this.fireEmitters.set(idx, emitter);

      // Register fire light source
      const lightSrc = this.lightmap.addSource({
        x, y,
        r: 1.3, g: 0.6, b: 0.2, // orange
        radius: 4,
        flicker: 'fire',
      });
      this.fireLightSources.set(idx, lightSrc);
    } else if (!isOnFire && this.fireOverlays.has(idx)) {
      // Remove fire sprite
      const sprite = this.fireOverlays.get(idx)!;
      this.tweens.killTweensOf(sprite);
      sprite.destroy();
      this.fireOverlays.delete(idx);

      const emitter = this.fireEmitters.get(idx);
      if (emitter) {
        emitter.destroy();
        this.fireEmitters.delete(idx);
      }

      // Remove fire light source
      const lightSrc = this.fireLightSources.get(idx);
      if (lightSrc) {
        this.lightmap.removeSource(lightSrc.id);
        this.fireLightSources.delete(idx);
      }
    }
  }

  /** Create or update fluid overlay for a tile. */
  private updateFluidOverlay(x: number, y: number): void {
    const idx = this.tileMap.idx(x, y);
    const state = this.tilePhysics.get(x, y);
    if (!state) return;

    // Find highest-concentration fluid
    let maxFluid = '';
    let maxConc = 0;
    for (const [fluidId, conc] of state.fluids) {
      if (conc > maxConc) {
        maxConc = conc;
        maxFluid = fluidId;
      }
    }

    if (maxConc > 0.01) {
      const material = getRegistry().materials.get(maxFluid);
      const color = material?.color ?? '#4488cc';
      const tint = parseInt(color.replace('#', ''), 16);

      if (!this.fluidOverlays.has(idx)) {
        const sprite = this.add.image(x * TILE_SIZE, y * TILE_SIZE, TEX.FLUID_OVERLAY);
        sprite.setOrigin(0, 0);
        sprite.setDepth(1);
        this.overlayContainer.add(sprite);
        this.fluidOverlays.set(idx, sprite);
      }

      const sprite = this.fluidOverlays.get(idx)!;
      sprite.setTint(tint);
      sprite.setAlpha(Math.min(0.6, maxConc * 0.8));
      sprite.setVisible(true);
    } else if (this.fluidOverlays.has(idx)) {
      const sprite = this.fluidOverlays.get(idx)!;
      sprite.destroy();
      this.fluidOverlays.delete(idx);
    }
  }

  /** Create or update gas overlay for a tile. */
  private updateGasOverlay(x: number, y: number): void {
    const idx = this.tileMap.idx(x, y);
    const state = this.tilePhysics.get(x, y);
    if (!state) return;

    // Find highest-concentration gas
    let maxGas = '';
    let maxConc = 0;
    for (const [gasId, conc] of state.gases) {
      if (conc > maxConc) {
        maxConc = conc;
        maxGas = gasId;
      }
    }

    if (maxConc > 0.01) {
      const material = getRegistry().materials.get(maxGas);
      const color = material?.color ?? '#888888';
      const tint = parseInt(color.replace('#', ''), 16);

      if (!this.gasOverlays.has(idx)) {
        const sprite = this.add.image(x * TILE_SIZE, y * TILE_SIZE, TEX.GAS_OVERLAY);
        sprite.setOrigin(0, 0);
        sprite.setDepth(2);
        this.overlayContainer.add(sprite);
        this.gasOverlays.set(idx, sprite);
      }

      const sprite = this.gasOverlays.get(idx)!;
      sprite.setTint(tint);
      sprite.setAlpha(Math.min(0.5, maxConc * 0.6));
      sprite.setVisible(true);

      // Create drifting smoke particle emitter if not present
      if (!this.gasEmitters.has(idx)) {
        const emitter = this.add.particles(
          x * TILE_SIZE + TILE_SIZE / 2,
          y * TILE_SIZE + TILE_SIZE / 2,
          TEX.SMOKE_PARTICLE,
          {
            speed: { min: 3, max: 10 },
            angle: { min: 240, max: 300 },
            lifespan: { min: 600, max: 1200 },
            alpha: { start: 0.4, end: 0 },
            scale: { start: 0.8, end: 1.5 },
            frequency: 500,
            quantity: 1,
            tint,
          },
        );
        this.gasEmitters.set(idx, emitter);
      }
    } else {
      // Remove gas overlay and emitter
      if (this.gasOverlays.has(idx)) {
        this.gasOverlays.get(idx)!.destroy();
        this.gasOverlays.delete(idx);
      }
      if (this.gasEmitters.has(idx)) {
        this.gasEmitters.get(idx)!.destroy();
        this.gasEmitters.delete(idx);
      }
    }
  }

  /** Refresh all physics overlays (fire + fluid + gas) for the entire map. */
  private renderPhysicsOverlays(): void {
    for (let y = 0; y < this.tileMap.height; y++) {
      for (let x = 0; x < this.tileMap.width; x++) {
        this.updateFireOverlay(x, y);
        this.updateFluidOverlay(x, y);
        this.updateGasOverlay(x, y);
      }
    }
  }

  // ════════════════════════════════════════════════════════════
  // FOV
  // ════════════════════════════════════════════════════════════

  private updateFOV(): void {
    // Update shader revealAll flag
    if (this.lightmapFilter) {
      this.lightmapFilter.revealAll = this.sandbox?.revealAll ? 1.0 : 0.0;
      this.lightmapFilter.debugMode = this.sandbox?.lightDebugMode ?? 0;
    }

    // Always compute FOV — revealAll is rendering-only, never mutates data
    const px = Position.x[this.playerEid];
    const py = Position.y[this.playerEid];
    const range = FOV.range[this.playerEid];
    computeFOV(this.tileMap, px, py, range);

    const revealAll = !!this.sandbox?.revealAll;

    // Update entity visibility
    const useShader = !!this.lightmapFilter;
    for (const [eid, sprite] of this.entitySprites) {
      if (eid === this.playerEid) {
        sprite.setVisible(true);
        if (!useShader) {
          const pidx = this.tileMap.idx(Position.x[eid], Position.y[eid]);
          const pr = Math.min(255, Math.round(Math.max(0.06, this.lightmap.r[pidx]) * 255));
          const pg = Math.min(255, Math.round(Math.max(0.06, this.lightmap.g[pidx]) * 255));
          const pb = Math.min(255, Math.round(Math.max(0.06, this.lightmap.b[pidx]) * 255));
          sprite.setTint((pr << 16) | (pg << 8) | pb);
        } else {
          sprite.setTint(0xffffff);
        }
        continue;
      }

      if (revealAll) {
        sprite.setVisible(true);
        sprite.setTint(0xffffff);
        sprite.setAlpha(1);
      } else {
        const ex = Position.x[eid];
        const ey = Position.y[eid];
        const vis = this.tileMap.getVisibility(ex, ey);

        if (vis === Visibility.VISIBLE) {
          sprite.setVisible(true);
          sprite.setAlpha(1);
          if (!useShader) {
            const eidx = this.tileMap.idx(ex, ey);
            const er = Math.min(255, Math.round(Math.max(0.06, this.lightmap.r[eidx]) * 255));
            const eg = Math.min(255, Math.round(Math.max(0.06, this.lightmap.g[eidx]) * 255));
            const eb = Math.min(255, Math.round(Math.max(0.06, this.lightmap.b[eidx]) * 255));
            sprite.setTint((er << 16) | (eg << 8) | eb);
          } else {
            sprite.setTint(0xffffff);
          }
        } else if (vis === Visibility.SEEN) {
          const isStatic = !hasComponent(this.world, eid, Turn) || hasComponent(this.world, eid, Dead);
          sprite.setVisible(isStatic);
          if (isStatic) {
            sprite.setTint(useShader ? 0xffffff : 0x607080);
          }
        } else {
          sprite.setVisible(false);
        }
      }

      // Corpse — desaturated, behind living entities
      if (hasComponent(this.world, eid, Dead)) {
        sprite.setTint(0x444444);
        sprite.setAlpha(0.7);
        this.demoteToObjectLayer(sprite);
      }
    }

    // ── Recompute lightmap ──
    this.lightmap.recompute((x, y) => this.tileMap.blocksLight(x, y));

    // Starlight — ambient light on hull and space from a nearby star.
    // VOID (space) and HULL (exterior structure) are lit by starlight.
    // Interior WALL tiles derive light from neighbors via quadrant blending.
    this.lightmap.addAmbient(
      0.65, 0.60, 0.70,
      (x, y) => {
        const t = this.tileMap.tiles[this.tileMap.idx(x, y)];
        return t === TileType.VOID || t === TileType.HULL;
      },
    );

    // Upload to GPU textures for shader
    if (this.lightmapFilter) {
      this.lightmap.uploadToCanvas(this.lightmapCtx, this.visCtx, this.tileMap.visibility, this.tileMap.tiles);
      const lightTex = this.textures.get('_lightmap');
      if (lightTex) (lightTex as any).update();
      const visTex = this.textures.get('_visibility');
      if (visTex) (visTex as any).update();
      this.lightmapFilter.refreshTextures();
    }
  }


  // ════════════════════════════════════════════════════════════
  // ROOM LIGHTING
  // ════════════════════════════════════════════════════════════

  /** Mark space (VOID) and hull as SEEN — exterior is always visible.
   *  Interior walls (WALL) stay UNSEEN until the player reveals them. */
  private revealExterior(): void {
    const { width, height, tiles, visibility } = this.tileMap;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        if (visibility[i] !== Visibility.UNSEEN) continue;

        const t = tiles[i];
        if (t === TileType.VOID || t === TileType.HULL) {
          visibility[i] = Visibility.SEEN;
        }
      }
    }
  }

  /** Ceiling light color per architecture theme (r, g, b — HDR, can exceed 1.0). */
  private static ARCH_LIGHT_COLORS: Record<string, [number, number, number]> = {
    human:      [0.85, 0.90, 1.00],  // cool fluorescent white
    alien:      [0.40, 0.90, 0.85],  // teal bioluminescence
    insectoid:  [0.95, 0.75, 0.40],  // warm amber resin glow
    industrial: [1.00, 0.85, 0.55],  // sodium lamp yellow
    monolithic: [0.65, 0.55, 1.00],  // cold purple
  };
  private static DEFAULT_LIGHT_COLOR: [number, number, number] = [0.90, 0.88, 0.80];

  private addRoomLights(): void {
    // Clean up previous room lights
    for (const src of this.roomLightSources) {
      this.lightmap.removeSource(src.id);
    }
    this.roomLightSources = [];

    const [lr, lg, lb] = GameScene.ARCH_LIGHT_COLORS[this.currentArchitectureId]
      ?? GameScene.DEFAULT_LIGHT_COLOR;

    for (const room of this.currentRooms) {
      // Radius covers the room diagonal + 1 for bleed into doorways
      const radius = Math.ceil(Math.sqrt(room.rect.w * room.rect.w + room.rect.h * room.rect.h) / 2) + 1;
      // ~30% of ceiling lights are malfunctioning on derelict ships
      const flicker = Math.random() < 0.3 ? 'broken' as const : undefined;
      const src = this.lightmap.addSource({
        x: room.center.x,
        y: room.center.y,
        r: lr, g: lg, b: lb,
        radius,
        flicker,
      });
      this.roomLightSources.push(src);
    }
  }

  // ════════════════════════════════════════════════════════════
  // IDLE ANIMATIONS
  // ════════════════════════════════════════════════════════════

  private updateIdleAnimations(): void {
    // Player gentle bob
    const sprite = this.entitySprites.get(this.playerEid);
    if (sprite && this.turnSystem.phase === TurnPhase.PLAYER_INPUT) {
      const bob = Math.sin(this.idleTime * 0.003) * 1.5;
      const baseY = Position.y[this.playerEid] * TILE_SIZE;
      sprite.y = baseY + bob;
    }
  }

  // ════════════════════════════════════════════════════════════
  // AMBIENT EFFECTS
  // ════════════════════════════════════════════════════════════

  private setupAmbientEffects(): void {
    // Spark particles — emitted at random wall-adjacent floor tiles
    // These run continuously at 60fps, independent of turn state
    this.sparkEmitter = this.add.particles(0, 0, TEX.SPARK, {
      speed: { min: 10, max: 40 },
      angle: { min: 230, max: 310 },
      lifespan: { min: 300, max: 800 },
      alpha: { start: 0.8, end: 0 },
      scale: { start: 1, end: 0.3 },
      frequency: 3000, // one spark every 3 seconds
      quantity: 1,
      blendMode: 'ADD',
      emitting: false,
    });

    // Place emitter zones at interesting locations (wall-floor boundaries)
    this.placeSparkZones();
  }

  private placeSparkZones(): void {
    const spots: { x: number; y: number }[] = [];
    const { width, height } = this.tileMap;

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        if (this.tileMap.get(x, y) !== TileType.FLOOR) continue;
        // Check if adjacent to a wall
        const isWallOrHull = (t: number) => t === TileType.WALL || t === TileType.HULL;
        const adjWall =
          isWallOrHull(this.tileMap.get(x - 1, y)) ||
          isWallOrHull(this.tileMap.get(x + 1, y)) ||
          isWallOrHull(this.tileMap.get(x, y - 1)) ||
          isWallOrHull(this.tileMap.get(x, y + 1));
        if (adjWall) spots.push({ x, y });
      }
    }

    // Pick a handful of spots
    const chosen = spots
      .sort(() => Math.random() - 0.5)
      .slice(0, Math.min(8, spots.length));

    if (chosen.length === 0) return;

    // Create individual emitters for each spot
    for (const spot of chosen) {
      this.add.particles(
        spot.x * TILE_SIZE + TILE_SIZE / 2,
        spot.y * TILE_SIZE + TILE_SIZE / 2,
        TEX.SPARK,
        {
          speed: { min: 10, max: 40 },
          angle: { min: 230, max: 310 },
          lifespan: { min: 300, max: 800 },
          alpha: { start: 0.8, end: 0 },
          scale: { start: 1, end: 0.3 },
          frequency: 2000 + Math.random() * 4000,
          quantity: 1,
          blendMode: 'ADD',
        }
      );
    }
  }

  // ════════════════════════════════════════════════════════════
  // SANDBOX
  // ════════════════════════════════════════════════════════════

  /** Run one sandbox turn: tick energy, run AI, run physics, drain visual queue. */
  private runSandboxTurn(): void {
    if (this.sandboxDraining) return;

    this.turnSystem.forceTick(this.world);
    processAITurns(this.world, this.tileMap, this.eventQueue);
    this.runPhysics();

    if (this.eventQueue.length > 0) {
      this.sandboxDraining = true;
    }
    this.drainAndRefresh(() => {
      this.sandboxDraining = false;
      this.sandbox.emit('state_changed');
    });
  }

  private handleSandboxClick(pointer: Phaser.Input.Pointer): void {
    const tileX = Math.floor(pointer.worldX / TILE_SIZE);
    const tileY = Math.floor(pointer.worldY / TILE_SIZE);

    if (!this.tileMap.inBounds(tileX, tileY)) return;

    switch (this.sandbox.activeTool) {
      case 'inspect':
        this.sandbox.selectTile(tileX, tileY);
        this.showSelectionHighlight(tileX, tileY);
        break;

      case 'tile_paint':
        this.sandbox.paintTile(tileX, tileY);
        this.sandbox.selectTile(tileX, tileY);
        this.showSelectionHighlight(tileX, tileY);
        break;

      case 'entity_spawn': {
        // Don't spawn on occupied tiles
        const existing = this.sandbox.findEntityAt(tileX, tileY);
        if (existing !== null) {
          // Select the existing entity instead
          this.sandbox.selectTile(tileX, tileY);
          this.showSelectionHighlight(tileX, tileY);
          break;
        }
        this.sandbox.spawnEntity(tileX, tileY);
        this.sandbox.selectTile(tileX, tileY);
        this.showSelectionHighlight(tileX, tileY);
        break;
      }

      case 'fluid_place':
        this.sandbox.placeFluid(tileX, tileY);
        this.sandbox.selectTile(tileX, tileY);
        this.showSelectionHighlight(tileX, tileY);
        this.updateFluidOverlay(tileX, tileY);
        break;

      case 'gas_place':
        this.sandbox.placeGas(tileX, tileY);
        this.sandbox.selectTile(tileX, tileY);
        this.showSelectionHighlight(tileX, tileY);
        break;

      default:
        this.sandbox.selectTile(tileX, tileY);
        this.showSelectionHighlight(tileX, tileY);
        break;
    }
  }

  private showSelectionHighlight(x: number, y: number): void {
    this.selectionHighlight.setPosition(x * TILE_SIZE, y * TILE_SIZE);
    this.selectionHighlight.setVisible(true);
  }

  private onSandboxToggle(): void {
    if (this.sandbox.active) {
      // Entering sandbox — free camera
      this.cameras.main.stopFollow();
    } else {
      // Exiting sandbox — snap camera back to player and resume follow
      this.selectionHighlight.setVisible(false);
      this.autoPlayTimer = 0;
      this.sandboxDraining = false;
      this.dragPanning = false;

      const playerSprite = this.entitySprites.get(this.playerEid);
      if (playerSprite) {
        this.cameras.main.startFollow(playerSprite, true, 0.15, 0.15,
          -TILE_SIZE / 2, -TILE_SIZE / 2);
      }

      // Restore FOV
      this.updateFOV();
      this.renderTiles();
      // Refresh overlays (keeps pinned ones visible)
      this.updateDebugOverlays();
    }
  }

  /** Redraw all pinned debug overlays for all entities. */
  private updateDebugOverlays(): void {
    // Track which keys are still active so we can hide stale ones
    const activeKeys = new Set<string>();

    const world = this.sandbox.getWorld();
    const map = this.sandbox.getMap();
    const registry = this.sandbox.debugRegistry;

    for (const [eid, components] of this.sandbox.pinnedOverlays) {
      const inspectors = registry.getFor(world, eid);
      for (const inspector of inspectors) {
        if (!inspector.hasOverlay || !inspector.renderOverlay) continue;
        if (!components.has(inspector.name)) continue;

        const key = `${eid}:${inspector.name}`;
        activeKeys.add(key);

        let gfx = this.debugOverlays.get(key);
        if (!gfx) {
          gfx = this.add.graphics();
          gfx.setDepth(5);
          this.debugOverlays.set(key, gfx);
        }
        gfx.clear();
        gfx.setVisible(true);
        inspector.renderOverlay(gfx, world, eid, map);
      }
    }

    // Hide any overlays that are no longer pinned
    for (const [key, gfx] of this.debugOverlays) {
      if (!activeKeys.has(key)) {
        gfx.clear();
        gfx.setVisible(false);
      }
    }
  }

  private clearDebugOverlays(): void {
    for (const [, gfx] of this.debugOverlays) {
      gfx.clear();
      gfx.setVisible(false);
    }
  }

  /** Toggle ship graph debug overlay (nodes with labels, edges as lines) */
  private shipGraphLabels: Phaser.GameObjects.Text[] = [];

  toggleShipGraphOverlay(): void {
    if (this.shipGraphOverlay) {
      this.shipGraphOverlay.destroy();
      this.shipGraphOverlay = null;
      for (const t of this.shipGraphLabels) t.destroy();
      this.shipGraphLabels = [];
      return;
    }

    const graph = this.shipGraphData;
    if (!graph) return;

    const gfx = this.add.graphics();
    gfx.setDepth(10);

    // Build pixel-position map from graph nodes + currentRooms
    const centers = new Map<number, { px: number; py: number }>();
    for (let i = 0; i < graph.nodes.length; i++) {
      const node = graph.nodes[i];
      const info = this.currentRooms[i];
      if (!info) continue;
      centers.set(node.id, {
        px: info.center.x * TILE_SIZE + TILE_SIZE / 2,
        py: info.center.y * TILE_SIZE + TILE_SIZE / 2,
      });
    }

    // Draw edges (yellow for physical, cyan for teleport)
    for (const edge of graph.edges) {
      const a = centers.get(edge.source);
      const b = centers.get(edge.target);
      if (!a || !b) continue;

      if (edge.type === 'teleport') {
        gfx.lineStyle(2, 0x00ffff, 0.4);
        // Dashed effect: draw short segments
        const dx = b.px - a.px;
        const dy = b.py - a.py;
        const len = Math.sqrt(dx * dx + dy * dy);
        const segments = Math.max(1, Math.floor(len / 12));
        for (let s = 0; s < segments; s += 2) {
          const t0 = s / segments;
          const t1 = Math.min((s + 1) / segments, 1);
          gfx.beginPath();
          gfx.moveTo(a.px + dx * t0, a.py + dy * t0);
          gfx.lineTo(a.px + dx * t1, a.py + dy * t1);
          gfx.strokePath();
        }
      } else {
        gfx.lineStyle(2, 0xffff00, 0.6);
        gfx.beginPath();
        gfx.moveTo(a.px, a.py);
        gfx.lineTo(b.px, b.py);
        gfx.strokePath();
      }
    }

    // Draw nodes and labels
    for (const node of graph.nodes) {
      const c = centers.get(node.id);
      if (!c) continue;

      gfx.fillStyle(0x00ff00, 0.7);
      gfx.fillCircle(c.px, c.py, 8);
      gfx.lineStyle(1, 0xffffff, 0.8);
      gfx.strokeCircle(c.px, c.py, 8);

      const sizeLabel = `${node.w}x${node.h}`;
      const dirLabel = node.dir ? ` [${node.dir}]` : '';
      const label = this.add.text(c.px + 12, c.py - 8,
        `${node.name}\n${node.type} ${sizeLabel}${dirLabel}`, {
          fontFamily: 'monospace',
          fontSize: '10px',
          color: '#00ff00',
          backgroundColor: 'rgba(0,0,0,0.7)',
          padding: { x: 2, y: 1 },
        });
      label.setDepth(11);
      this.shipGraphLabels.push(label);
    }

    this.shipGraphOverlay = gfx;
  }

  private onTilePainted(data: { x: number; y: number; type: number }): void {
    const idx = this.tileMap.idx(data.x, data.y);
    const sprite = this.tileSprites[idx];
    if (sprite) {
      sprite.setTexture(this.getTileTexture(data.type));
      sprite.setVisible(true);
      sprite.setAlpha(1);
      sprite.setTint(0xffffff);
    }
  }

  private onEntitySpawned(data: { eid: number; x: number; y: number; speciesId: string }): void {
    this.createEntitySprite(data.eid, data.speciesId);
    // If revealAll or in FOV, make visible
    const sprite = this.entitySprites.get(data.eid);
    if (sprite) {
      sprite.setVisible(this.sandbox.revealAll ||
        this.tileMap.getVisibility(data.x, data.y) === Visibility.VISIBLE);
    }
  }

  private onEntityRemoved(data: { eid: number }): void {
    this.destroyEntitySprite(data.eid);
  }

  private onRevealChanged(): void {
    this.updateFOV();
    this.renderTiles();
  }

  private onFieldEdited(data: { eid: number; component: string }): void {
    // Sync sprite position if Position was edited
    if (data.component === 'Position') {
      this.syncEntitySprite(data.eid);
    }
    this.updateDebugOverlays();
  }


  /** Spawn entities defined in the map data file. */
  private spawnMapEntities(spawns: { species: string; x: number; y: number }[]): void {
    const registry = getRegistry();
    for (const spawn of spawns) {
      const species = registry.species.get(spawn.species);
      if (!species) {
        console.warn(`[map] Unknown species '${spawn.species}' in spawn list`);
        continue;
      }
      const eid = addEntity(this.world);
      addComponent(this.world, eid, Position);
      addComponent(this.world, eid, Renderable);
      addComponent(this.world, eid, Turn);
      addComponent(this.world, eid, BlocksMovement);
      addComponent(this.world, eid, AI);
      addComponent(this.world, eid, FOV);
      addComponent(this.world, eid, Health);
      addComponent(this.world, eid, Faction);
      addComponent(this.world, eid, CombatStats);

      Position.x[eid] = spawn.x;
      Position.y[eid] = spawn.y;
      Renderable.layer[eid] = 2;
      Turn.energy[eid] = 0;
      Turn.speed[eid] = species.speed;
      FOV.range[eid] = species.fovRange;

      const hp = species.maxHp ?? 10;
      Health.hp[eid] = hp;
      Health.maxHp[eid] = hp;
      Faction.factionIndex[eid] = getFactionIndex(species.faction ?? 'creatures');
      const [atkMin, atkMax] = species.attackDamage ?? [1, 1];
      CombatStats.attackDamageMin[eid] = atkMin;
      CombatStats.attackDamageMax[eid] = atkMax;
      AI.state[eid] = 0;
      AI.targetEid[eid] = -1;
      AI.lastKnownX[eid] = -1;
      AI.lastKnownY[eid] = -1;
      AI.searchBudget[eid] = 0;
      AI.cachedTargetX[eid] = -1;
      AI.cachedTargetY[eid] = -1;

      spawnBodyForCreature(this.world, eid, species, registry);

      this.createEntitySprite(eid, species.id);
    }
  }
}
