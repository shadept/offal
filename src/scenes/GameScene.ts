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
 */
import { Scene } from 'phaser';
import { createGameWorld, spawnPlayer } from '../ecs/world';
import { addEntity, addComponent, removeEntity, hasComponent } from 'bitecs';
import {
  Position, Renderable, FOV, Turn, AI, BlocksMovement,
  Health, Faction, CombatStats, Dead,
} from '../ecs/components';
import { initFactions, getFactionIndex } from '../ecs/factions';
import { TurnSystem } from '../ecs/systems/turnSystem';
import { tryMove } from '../ecs/systems/movementSystem';
import { VisualEventQueue } from '../visual/EventQueue';
import { TileMap, TILE_SIZE } from '../map/TileMap';
import { loadMap } from '../map/mapLoader';
import { computeFOV } from '../map/fov';
import { TurnPhase, TileType, Visibility } from '../types';
import type { VisualEvent } from '../types';
import { TEX, speciesTexKey } from './BootScene';
import { HUD } from '../ui/HUD';
import { SandboxController } from '../sandbox/SandboxController';
import { SandboxPanel } from '../sandbox/SandboxPanel';
import { processAITurns } from '../ecs/systems/aiSystem';
import { getRegistry } from '../data/loader';

/** Texture key for each tile index (matches data/tiles.json5) */
const TILE_TEX: Record<number, string> = {
  [TileType.VOID]: TEX.VOID,
  [TileType.FLOOR]: TEX.FLOOR,
  [TileType.WALL]: TEX.WALL,
  [TileType.DOOR_CLOSED]: TEX.DOOR_CLOSED,
  [TileType.DOOR_OPEN]: TEX.DOOR_OPEN,
};

/** Movement tween duration in ms */
const MOVE_DURATION = 120;

/** Door open animation duration in ms */
const DOOR_DURATION = 150;

/** Hit flash duration in ms */
const HIT_FLASH_DURATION = 200;

/** Death animation duration in ms */
const DEATH_DURATION = 300;

export class GameScene extends Scene {
  // ── ECS ──
  private world!: ReturnType<typeof createGameWorld>;
  private turnSystem!: TurnSystem;
  private playerEid!: number;

  // ── Map ──
  private tileMap!: TileMap;

  // ── Visual ──
  private eventQueue!: VisualEventQueue;
  private tileSprites: (Phaser.GameObjects.Image | null)[] = [];
  private entitySprites = new Map<number, Phaser.GameObjects.Image>();
  /** Maps entity ID → species ID for texture lookup */
  private entitySpecies = new Map<number, string>();
  private tileContainer!: Phaser.GameObjects.Container;
  private entityContainer!: Phaser.GameObjects.Container;

  // ── Ambient ──
  private sparkEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;

  // ── Input ──
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<string, Phaser.Input.Keyboard.Key>;
  private skipKey!: Phaser.Input.Keyboard.Key;
  private waitKey!: Phaser.Input.Keyboard.Key;
  private inputCooldown = 0;

  // ── HUD ──
  private hud!: HUD;

  // ── Idle animation ──
  private idleTime = 0;

  // ── Sandbox ──
  private sandbox!: SandboxController;
  private sandboxPanel!: SandboxPanel;
  private tabKey!: Phaser.Input.Keyboard.Key;
  private advanceKey!: Phaser.Input.Keyboard.Key;
  private selectionHighlight!: Phaser.GameObjects.Rectangle;
  private autoPlayTimer = 0;

  // ── Sandbox animation state ──
  private sandboxDraining = false;

  constructor() {
    super({ key: 'GameScene' });
  }

  create(): void {
    // ── Init faction index mapping ──
    initFactions();

    // ── ECS setup ──
    this.world = createGameWorld();
    this.turnSystem = new TurnSystem();
    this.eventQueue = new VisualEventQueue();

    // ── Map (data-driven) ──
    const mapResult = loadMap('test_ship');
    this.tileMap = mapResult.tileMap;

    // ── Containers (tile layer below entity layer) ──
    this.tileContainer = this.add.container(0, 0);
    this.entityContainer = this.add.container(0, 0);

    // ── Spawn player at map-defined position ──
    const registry = getRegistry();
    const playerSpecies = registry.species.get('salvager');
    this.playerEid = spawnPlayer(this.world, {
      x: mapResult.playerSpawn.x,
      y: mapResult.playerSpawn.y,
      speed: playerSpecies?.speed ?? 100,
      viewRange: playerSpecies?.fovRange ?? 8,
      maxHp: playerSpecies?.maxHp ?? 25,
      attackDamage: playerSpecies?.attackDamage ?? 5,
      faction: playerSpecies?.faction ?? 'player',
    });
    Turn.energy[this.playerEid] = 100;

    // ── Create tile sprites ──
    this.createTileSprites();

    // ── Create player sprite ──
    this.createEntitySprite(this.playerEid, 'salvager');

    // ── Spawn map-defined entities ──
    this.spawnMapEntities(mapResult.spawns);

    // ── Initial FOV ──
    this.updateFOV();
    this.renderTiles();

    // ── Camera ──
    const mapPixelW = this.tileMap.width * TILE_SIZE;
    const mapPixelH = this.tileMap.height * TILE_SIZE;
    this.cameras.main.setBounds(0, 0, mapPixelW, mapPixelH);
    // Follow the player sprite with lerp smoothing — camera tracks the
    // tween position during move animations instead of snapping after.
    const playerSprite = this.entitySprites.get(this.playerEid)!;
    this.cameras.main.startFollow(playerSprite, true, 0.15, 0.15,
      -TILE_SIZE / 2, -TILE_SIZE / 2);

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

    // ── Ambient: spark emitter on wall edges ──
    this.setupAmbientEffects();

    // ── HUD ──
    this.hud = new HUD(this);
    this.hud.update(this.playerEid, this.turnSystem.turnCount, this.turnSystem.phase);

    // ── Sandbox ──
    this.sandbox = new SandboxController();
    this.sandbox.bind(this.tileMap, this.world, this.turnSystem, this.eventQueue);
    this.sandboxPanel = new SandboxPanel(this.sandbox);

    // Selection highlight (yellow outline, hidden by default)
    this.selectionHighlight = this.add.rectangle(0, 0, TILE_SIZE, TILE_SIZE);
    this.selectionHighlight.setOrigin(0, 0);
    this.selectionHighlight.setStrokeStyle(1.5, 0xffdd44);
    this.selectionHighlight.setFillStyle(0xffdd44, 0.1);
    this.selectionHighlight.setDepth(50);
    this.selectionHighlight.setVisible(false);

    // Pointer click for sandbox
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (!this.sandbox.active) return;
      this.handleSandboxClick(pointer);
    });

    // React to sandbox controller events
    this.sandbox.on((event, data) => {
      if (event === 'toggle') this.onSandboxToggle();
      if (event === 'tile_painted') this.onTilePainted(data as { x: number; y: number; type: number });
      if (event === 'entity_spawned') this.onEntitySpawned(data as { eid: number; x: number; y: number; speciesId: string });
      if (event === 'entity_removed') this.onEntityRemoved(data as { eid: number });
      if (event === 'reveal_changed') this.onRevealChanged();
      if (event === 'turn_advanced') this.onTurnAdvanced();
    });
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

    // ── Sandbox mode ──
    if (this.sandbox.active) {
      // Don't advance while draining visual events
      if (this.sandboxDraining) return;

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
          // Enemy animation draining — handled by callbacks
          break;
      }
    }

    // ── Idle animation (player bobs gently) ──
    this.idleTime += delta;
    this.updateIdleAnimations();

    // ── HUD ──
    const fps = this.game.loop.actualFps;
    this.hud.update(this.playerEid, this.turnSystem.turnCount, this.turnSystem.phase, this.sandbox.active, fps);
  }

  // ════════════════════════════════════════════════════════════
  // TILE RENDERING
  // ════════════════════════════════════════════════════════════

  private createTileSprites(): void {
    const { width, height } = this.tileMap;
    this.tileSprites = new Array(width * height).fill(null);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = this.tileMap.idx(x, y);
        const tex = TILE_TEX[this.tileMap.tiles[idx]] ?? TEX.VOID;
        const sprite = this.add.image(x * TILE_SIZE, y * TILE_SIZE, tex);
        sprite.setOrigin(0, 0);
        sprite.setVisible(false);
        this.tileContainer.add(sprite);
        this.tileSprites[idx] = sprite;
      }
    }
  }

  /** Update tile sprite textures and visibility based on FOV */
  private renderTiles(): void {
    const { width, height } = this.tileMap;
    const revealAll = this.sandbox?.revealAll;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = this.tileMap.idx(x, y);
        const sprite = this.tileSprites[idx];
        if (!sprite) continue;

        // Update texture (tiles may have been painted)
        const tex = TILE_TEX[this.tileMap.tiles[idx]] ?? TEX.VOID;
        sprite.setTexture(tex);

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

        if (vis === Visibility.VISIBLE) {
          const light = this.tileMap.light[idx] / 255;
          const alpha = 0.4 + light * 0.6;
          sprite.setAlpha(alpha);
          sprite.setTint(0xffffff);
        } else {
          // Previously seen — dim blue tint
          sprite.setAlpha(0.35);
          sprite.setTint(0x667788);
        }
      }
    }
  }

  // ════════════════════════════════════════════════════════════
  // ENTITY SPRITES
  // ════════════════════════════════════════════════════════════

  private createEntitySprite(eid: number, speciesId?: string): Phaser.GameObjects.Image {
    if (speciesId) this.entitySpecies.set(eid, speciesId);
    const sid = this.entitySpecies.get(eid) ?? 'salvager';
    const tex = speciesTexKey(sid);
    const px = Position.x[eid] * TILE_SIZE;
    const py = Position.y[eid] * TILE_SIZE;
    const sprite = this.add.image(px, py, tex);
    sprite.setOrigin(0, 0);
    this.entityContainer.add(sprite);
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

  /** Sync entity sprite position with ECS (for non-animated updates) */
  private syncEntitySprite(eid: number): void {
    const sprite = this.entitySprites.get(eid);
    if (!sprite) return;
    sprite.setPosition(Position.x[eid] * TILE_SIZE, Position.y[eid] * TILE_SIZE);
  }

  // ════════════════════════════════════════════════════════════
  // INPUT
  // ════════════════════════════════════════════════════════════

  private handlePlayerInput(): void {
    if (this.inputCooldown > 0) return;

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

    // Try to move
    const result = tryMove(this.playerEid, dx, dy, this.tileMap, this.eventQueue);

    // Deduct energy if action had a cost
    if (result.cost > 0) {
      this.turnSystem.deductEnergy(this.playerEid, result.cost);
    }

    // Advance to animation phase
    this.turnSystem.advance(this.world);

    // Drain visual queue
    if (this.eventQueue.length > 0) {
      this.eventQueue.drain(() => {
        this.onPlayerAnimationDone();
      });
    } else {
      // No visual events (e.g., bumped wall with no cost)
      this.onPlayerAnimationDone();
    }
  }

  private onPlayerAnimationDone(): void {
    // Recompute FOV after movement
    this.updateFOV();
    this.renderTiles();

    // Advance turn
    this.turnSystem.onPlayerAnimationComplete(this.world);
  }

  /** Process enemy turn with AI behaviours and combat. */
  private processEnemyTurn(): void {
    processAITurns(this.world, this.tileMap, this.eventQueue);
    this.turnSystem.phase = TurnPhase.ENEMY_ANIMATION;

    // Drain visual queue (AI move/attack events)
    if (this.eventQueue.length > 0) {
      this.eventQueue.drain(() => {
        this.updateFOV();
        this.renderTiles();
        this.turnSystem.onEnemyAnimationComplete(this.world);
      });
    } else {
      this.turnSystem.onEnemyAnimationComplete(this.world);
    }
  }

  // ════════════════════════════════════════════════════════════
  // VISUAL EVENT HANDLERS
  // ════════════════════════════════════════════════════════════

  private registerEventHandlers(): void {
    // ── Move event ──
    this.eventQueue.registerHandler('move', (event: VisualEvent, onComplete: () => void) => {
      const { fromX, fromY, toX, toY } = event.data as {
        fromX: number; fromY: number; toX: number; toY: number;
      };
      const sprite = this.entitySprites.get(event.entityId);
      if (!sprite) {
        onComplete();
        return;
      }

      if (this.eventQueue.skipMode) {
        sprite.setPosition(toX * TILE_SIZE, toY * TILE_SIZE);
        onComplete();
        return;
      }

      this.tweens.add({
        targets: sprite,
        x: toX * TILE_SIZE,
        y: toY * TILE_SIZE,
        duration: MOVE_DURATION,
        ease: 'Quad.easeInOut',
        onComplete: () => onComplete(),
      });
    });

    // ── Door open event ──
    this.eventQueue.registerHandler('door_open', (event: VisualEvent, onComplete: () => void) => {
      const { x, y } = event.data as { x: number; y: number };
      const idx = this.tileMap.idx(x, y);
      const tileSprite = this.tileSprites[idx];

      if (!tileSprite || this.eventQueue.skipMode) {
        onComplete();
        return;
      }

      // Flash the door tile then update texture
      this.tweens.add({
        targets: tileSprite,
        alpha: 1,
        duration: DOOR_DURATION / 2,
        yoyo: false,
        onComplete: () => {
          // Texture will update on next renderTiles() after commit
          onComplete();
        },
      });
    });

    // ── Door close event ──
    this.eventQueue.registerHandler('door_close', (event: VisualEvent, onComplete: () => void) => {
      onComplete();
    });

    // ── Hit flash event ──
    this.eventQueue.registerHandler('hit_flash', (event: VisualEvent, onComplete: () => void) => {
      const sprite = this.entitySprites.get(event.entityId);
      if (!sprite || this.eventQueue.skipMode) {
        onComplete();
        return;
      }

      // Flash red then restore
      sprite.setTint(0xff2222);
      this.tweens.add({
        targets: sprite,
        alpha: 0.6,
        duration: HIT_FLASH_DURATION / 2,
        yoyo: true,
        onComplete: () => {
          sprite.setTint(0xffffff);
          sprite.setAlpha(1);
          onComplete();
        },
      });
    });

    // ── Death event ──
    this.eventQueue.registerHandler('death', (event: VisualEvent, onComplete: () => void) => {
      const eid = event.entityId;
      const sprite = this.entitySprites.get(eid);

      // Mark dead in ECS immediately
      addComponent(this.world, eid, Dead);

      if (!sprite || this.eventQueue.skipMode) {
        this.removeDeadEntity(eid);
        onComplete();
        return;
      }

      // Scale-down + fade death animation
      this.tweens.add({
        targets: sprite,
        scaleX: 0,
        scaleY: 0,
        alpha: 0,
        duration: DEATH_DURATION,
        ease: 'Quad.easeIn',
        onComplete: () => {
          this.removeDeadEntity(eid);
          onComplete();
        },
      });
    });
  }

  /** Remove a dead entity from world and visual layer. */
  private removeDeadEntity(eid: number): void {
    this.destroyEntitySprite(eid);
    removeEntity(this.world, eid);
  }

  // ════════════════════════════════════════════════════════════
  // FOV
  // ════════════════════════════════════════════════════════════

  private updateFOV(): void {
    if (this.sandbox?.revealAll) {
      // Reveal entire map
      const { width, height } = this.tileMap;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = this.tileMap.idx(x, y);
          this.tileMap.visibility[idx] = Visibility.VISIBLE;
          this.tileMap.light[idx] = 255;
        }
      }
      // All entities visible
      for (const [, sprite] of this.entitySprites) {
        sprite.setVisible(true);
      }
      return;
    }

    const px = Position.x[this.playerEid];
    const py = Position.y[this.playerEid];
    const range = FOV.range[this.playerEid];
    computeFOV(this.tileMap, px, py, range);

    // Update entity visibility
    for (const [eid, sprite] of this.entitySprites) {
      if (eid === this.playerEid) {
        sprite.setVisible(true);
        continue;
      }
      const ex = Position.x[eid];
      const ey = Position.y[eid];
      const vis = this.tileMap.getVisibility(ex, ey);
      sprite.setVisible(vis === Visibility.VISIBLE);
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
        const adjWall =
          this.tileMap.get(x - 1, y) === TileType.WALL ||
          this.tileMap.get(x + 1, y) === TileType.WALL ||
          this.tileMap.get(x, y - 1) === TileType.WALL ||
          this.tileMap.get(x, y + 1) === TileType.WALL;
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

  /** Run one sandbox turn: tick energy, run AI, drain visual queue. */
  private runSandboxTurn(): void {
    if (this.sandboxDraining) return;

    // Tick energy for all entities
    this.turnSystem.forceTick(this.world);

    // Run AI with movement, combat
    processAITurns(this.world, this.tileMap, this.eventQueue);

    // Drain visual queue
    if (this.eventQueue.length > 0) {
      this.sandboxDraining = true;
      this.eventQueue.drain(() => {
        this.sandboxDraining = false;
        this.updateFOV();
        this.renderTiles();
        this.sandboxPanel.updateInspector();
      });
    } else {
      this.sandboxPanel.updateInspector();
    }
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

      default:
        // fluid_place, gas_place — not yet functional
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
    if (!this.sandbox.active) {
      // Exiting sandbox — clean up
      this.selectionHighlight.setVisible(false);
      this.autoPlayTimer = 0;
      this.sandboxDraining = false;
      // Restore FOV
      this.updateFOV();
      this.renderTiles();
    }
  }

  private onTilePainted(data: { x: number; y: number; type: number }): void {
    const idx = this.tileMap.idx(data.x, data.y);
    const sprite = this.tileSprites[idx];
    if (sprite) {
      const tex = TILE_TEX[data.type] ?? TEX.VOID;
      sprite.setTexture(tex);
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
    // Refresh inspector
    this.sandboxPanel.updateInspector();
  }

  private onRevealChanged(): void {
    this.updateFOV();
    this.renderTiles();
  }

  private onTurnAdvanced(): void {
    // Refresh inspector if something is selected
    this.sandboxPanel.updateInspector();
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
      CombatStats.attackDamage[eid] = species.attackDamage ?? 1;

      this.createEntitySprite(eid, species.id);
    }
  }
}
