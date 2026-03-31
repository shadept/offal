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
 */
import { Scene } from 'phaser';
import { createGameWorld, spawnPlayer, SpriteIndex } from '../ecs/world';
import { Position, Renderable, FOV, Turn } from '../ecs/components';
import { TurnSystem } from '../ecs/systems/turnSystem';
import { tryMove } from '../ecs/systems/movementSystem';
import { VisualEventQueue } from '../visual/EventQueue';
import { TileMap, TILE_SIZE } from '../map/TileMap';
import { createTestMap, PLAYER_SPAWN } from '../map/testMap';
import { computeFOV } from '../map/fov';
import { TurnPhase, TileType, Visibility } from '../types';
import type { VisualEvent } from '../types';
import { TEX } from './BootScene';
import { HUD } from '../ui/HUD';

/** Texture key for each TileType */
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

  constructor() {
    super({ key: 'GameScene' });
  }

  create(): void {
    // ── ECS setup ──
    this.world = createGameWorld();
    this.turnSystem = new TurnSystem();
    this.eventQueue = new VisualEventQueue();

    // ── Map ──
    this.tileMap = createTestMap();

    // ── Containers (tile layer below entity layer) ──
    this.tileContainer = this.add.container(0, 0);
    this.entityContainer = this.add.container(0, 0);

    // ── Spawn player ──
    this.playerEid = spawnPlayer(this.world, {
      x: PLAYER_SPAWN.x,
      y: PLAYER_SPAWN.y,
      speed: 100,
      viewRange: 8,
    });

    // Give player initial energy to act immediately
    Turn.energy[this.playerEid] = 100;

    // ── Create tile sprites ──
    this.createTileSprites();

    // ── Create entity sprites ──
    this.createEntitySprite(this.playerEid);

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

    // ── Ambient: spark emitter on wall edges ──
    this.setupAmbientEffects();

    // ── HUD ──
    this.hud = new HUD(this);
    this.hud.update(this.playerEid, this.turnSystem.turnCount, this.turnSystem.phase);
  }

  update(time: number, delta: number): void {
    // ── Skip mode (hold Shift) ──
    this.eventQueue.skipMode = this.skipKey.isDown;

    // ── Input cooldown ──
    if (this.inputCooldown > 0) {
      this.inputCooldown -= delta;
    }

    // ── Turn state machine ──
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
        // No enemies in Phase 1 — skip directly
        this.turnSystem.phase = TurnPhase.ENEMY_ANIMATION;
        break;

      case TurnPhase.ENEMY_ANIMATION:
        // No enemy events — complete immediately
        this.turnSystem.onEnemyAnimationComplete(this.world);
        break;
    }

    // ── Idle animation (player bobs gently) ──
    this.idleTime += delta;
    this.updateIdleAnimations();

    // ── HUD ──
    this.hud.update(this.playerEid, this.turnSystem.turnCount, this.turnSystem.phase);
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

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = this.tileMap.idx(x, y);
        const sprite = this.tileSprites[idx];
        if (!sprite) continue;

        const vis = this.tileMap.visibility[idx] as Visibility;

        if (vis === Visibility.UNSEEN) {
          sprite.setVisible(false);
          continue;
        }

        // Update texture (doors may have changed)
        const tex = TILE_TEX[this.tileMap.tiles[idx]] ?? TEX.VOID;
        sprite.setTexture(tex);
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

  private createEntitySprite(eid: number): Phaser.GameObjects.Image {
    const tex = this.spriteTexForEntity(eid);
    const px = Position.x[eid] * TILE_SIZE;
    const py = Position.y[eid] * TILE_SIZE;
    const sprite = this.add.image(px, py, tex);
    sprite.setOrigin(0, 0);
    this.entityContainer.add(sprite);
    this.entitySprites.set(eid, sprite);
    return sprite;
  }

  private spriteTexForEntity(eid: number): string {
    const idx = Renderable.spriteIndex[eid];
    if (idx === SpriteIndex.PLAYER) return TEX.PLAYER;
    return TEX.FLOOR; // fallback
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
  }

  // ════════════════════════════════════════════════════════════
  // FOV
  // ════════════════════════════════════════════════════════════

  private updateFOV(): void {
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
}
