/**
 * BootScene — generates tile textures and loads data, then launches GameScene.
 * Phase 0 exit criteria: basic tileset loaded (generated procedurally).
 */
import { Scene } from 'phaser';
import { loadData } from '../data/loader';
import { TILE_SIZE } from '../map/TileMap';

/** Texture keys used throughout the game */
export const TEX = {
  FLOOR: 'tile_floor',
  WALL: 'tile_wall',
  DOOR_CLOSED: 'tile_door_closed',
  DOOR_OPEN: 'tile_door_open',
  PLAYER: 'entity_player',
  VOID: 'tile_void',
  // Ambient
  SPARK: 'particle_spark',
} as const;

export class BootScene extends Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload(): void {
    // No external assets to load — we generate everything
  }

  create(): void {
    // Load JSON5 data
    loadData();

    // Generate tile textures
    this.generateTextures();

    // Show brief boot message then start game
    const text = this.add.text(
      this.scale.width / 2,
      this.scale.height / 2,
      'OFFAL — Initializing...',
      { fontFamily: 'monospace', fontSize: '16px', color: '#667788' },
    );
    text.setOrigin(0.5);

    // Transition to game scene after a brief delay
    this.time.delayedCall(300, () => {
      this.scene.start('GameScene');
    });
  }

  private generateTextures(): void {
    const S = TILE_SIZE;

    // ── Floor tile ──
    this.generateTile(TEX.FLOOR, (ctx) => {
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(0, 0, S, S);
      // Subtle grid lines
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
      ctx.lineWidth = 1;
      ctx.strokeRect(0.5, 0.5, S - 1, S - 1);
      // Floor detail — subtle rivet marks
      ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
      ctx.beginPath();
      ctx.arc(4, 4, 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(S - 4, S - 4, 1.5, 0, Math.PI * 2);
      ctx.fill();
    });

    // ── Wall tile ──
    this.generateTile(TEX.WALL, (ctx) => {
      ctx.fillStyle = '#334455';
      ctx.fillRect(0, 0, S, S);
      // Panel lines
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.lineWidth = 1;
      ctx.strokeRect(1.5, 1.5, S - 3, S - 3);
      // Highlight edge
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.beginPath();
      ctx.moveTo(1, 1);
      ctx.lineTo(S - 1, 1);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(1, 1);
      ctx.lineTo(1, S - 1);
      ctx.stroke();
    });

    // ── Closed door ──
    this.generateTile(TEX.DOOR_CLOSED, (ctx) => {
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(0, 0, S, S);
      // Door panels
      ctx.fillStyle = '#5a4a3a';
      ctx.fillRect(4, 2, S - 8, S - 4);
      // Center line
      ctx.strokeStyle = '#3a3a2a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(S / 2, 2);
      ctx.lineTo(S / 2, S - 2);
      ctx.stroke();
      // Handle
      ctx.fillStyle = '#aa8855';
      ctx.fillRect(S / 2 + 3, S / 2 - 2, 3, 4);
    });

    // ── Open door ──
    this.generateTile(TEX.DOOR_OPEN, (ctx) => {
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(0, 0, S, S);
      // Door frame sides
      ctx.fillStyle = '#5a4a3a';
      ctx.fillRect(0, 0, 4, S);
      ctx.fillRect(S - 4, 0, 4, S);
    });

    // ── Void tile ──
    this.generateTile(TEX.VOID, (ctx) => {
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, S, S);
    });

    // ── Player entity ──
    this.generateTile(TEX.PLAYER, (ctx) => {
      ctx.clearRect(0, 0, S, S);
      // Body
      ctx.fillStyle = '#e94560';
      ctx.beginPath();
      ctx.arc(S / 2, S / 2, S * 0.35, 0, Math.PI * 2);
      ctx.fill();
      // Eye
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(S / 2 + 3, S / 2 - 3, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1a1a2e';
      ctx.beginPath();
      ctx.arc(S / 2 + 4, S / 2 - 3, 1.5, 0, Math.PI * 2);
      ctx.fill();
    });

    // ── Spark particle ──
    this.generateTile(TEX.SPARK, (ctx) => {
      ctx.fillStyle = '#ffaa33';
      ctx.beginPath();
      ctx.arc(2, 2, 2, 0, Math.PI * 2);
      ctx.fill();
    }, 4, 4);
  }

  private generateTile(
    key: string,
    draw: (ctx: CanvasRenderingContext2D) => void,
    w = TILE_SIZE,
    h = TILE_SIZE,
  ): void {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    draw(ctx);
    this.textures.addCanvas(key, canvas);
  }
}
