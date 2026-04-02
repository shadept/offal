/**
 * BootScene — generates tile textures and loads data, then launches GameScene.
 *
 * Entity textures are generated from species data (color from JSON5).
 * Tile textures are still procedural (Phase 9 adds real assets).
 */
import { Scene } from 'phaser';
import { loadData, getRegistry } from '../data/loader';
import { TILE_SIZE } from '../map/TileMap';

/** Texture keys for tiles (static) */
export const TEX = {
  FLOOR: 'tile_floor',
  WALL: 'tile_wall',
  DOOR_CLOSED: 'tile_door_closed',
  DOOR_OPEN: 'tile_door_open',
  VOID: 'tile_void',
  // Ambient
  SPARK: 'particle_spark',
  // Physics (Phase 4)
  FIRE_PARTICLE: 'particle_fire',
  FIRE_OVERLAY: 'tile_fire_overlay',
  FLUID_OVERLAY: 'tile_fluid_overlay',
  SMOKE_PARTICLE: 'particle_smoke',
  GAS_OVERLAY: 'tile_gas_overlay',
} as const;

/** Get the texture key for a species. Convention: `entity_{speciesId}` */
export function speciesTexKey(speciesId: string): string {
  return `entity_${speciesId}`;
}

export class BootScene extends Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload(): void {
    // No external assets to load — we generate everything
  }

  create(): void {
    // Load JSON5 data (must happen before texture generation)
    loadData();

    // Generate textures
    this.generateTileTextures();
    this.generateSpeciesTextures();
    this.generatePhysicsTextures();

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

  private generateTileTextures(): void {
    const S = TILE_SIZE;

    // ── Floor tile ──
    this.generateTile(TEX.FLOOR, (ctx) => {
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(0, 0, S, S);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
      ctx.lineWidth = 1;
      ctx.strokeRect(0.5, 0.5, S - 1, S - 1);
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
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.lineWidth = 1;
      ctx.strokeRect(1.5, 1.5, S - 3, S - 3);
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
      ctx.fillStyle = '#5a4a3a';
      ctx.fillRect(4, 2, S - 8, S - 4);
      ctx.strokeStyle = '#3a3a2a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(S / 2, 2);
      ctx.lineTo(S / 2, S - 2);
      ctx.stroke();
      ctx.fillStyle = '#aa8855';
      ctx.fillRect(S / 2 + 3, S / 2 - 2, 3, 4);
    });

    // ── Open door ──
    this.generateTile(TEX.DOOR_OPEN, (ctx) => {
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(0, 0, S, S);
      ctx.fillStyle = '#5a4a3a';
      ctx.fillRect(0, 0, 4, S);
      ctx.fillRect(S - 4, 0, 4, S);
    });

    // ── Void tile ──
    this.generateTile(TEX.VOID, (ctx) => {
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, S, S);
    });

    // ── Spark particle ──
    this.generateTile(TEX.SPARK, (ctx) => {
      ctx.fillStyle = '#ffaa33';
      ctx.beginPath();
      ctx.arc(2, 2, 2, 0, Math.PI * 2);
      ctx.fill();
    }, 4, 4);
  }

  /** Generate a texture for each species from its data-defined color. */
  private generateSpeciesTextures(): void {
    const S = TILE_SIZE;
    const registry = getRegistry();

    for (const [, species] of registry.species) {
      const key = speciesTexKey(species.id);
      this.generateTile(key, (ctx) => {
        ctx.clearRect(0, 0, S, S);
        // Body circle in species color
        ctx.fillStyle = species.color;
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
    }
  }

  /** Generate textures for fire and fluid overlays. */
  private generatePhysicsTextures(): void {
    const S = TILE_SIZE;

    // ── Fire particle (small bright orange/yellow dot) ──
    this.generateTile(TEX.FIRE_PARTICLE, (ctx) => {
      const gradient = ctx.createRadialGradient(3, 3, 0, 3, 3, 3);
      gradient.addColorStop(0, '#ffdd44');
      gradient.addColorStop(0.5, '#ff6622');
      gradient.addColorStop(1, 'rgba(255, 50, 0, 0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 6, 6);
    }, 6, 6);

    // ── Fire overlay (semi-transparent orange glow over tile) ──
    this.generateTile(TEX.FIRE_OVERLAY, (ctx) => {
      ctx.fillStyle = 'rgba(255, 80, 0, 0.35)';
      ctx.fillRect(0, 0, S, S);
      // Bright center
      const gradient = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S * 0.6);
      gradient.addColorStop(0, 'rgba(255, 200, 50, 0.3)');
      gradient.addColorStop(1, 'rgba(255, 80, 0, 0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, S, S);
    });

    // ── Fluid overlay (semi-transparent, tinted per-material at runtime) ──
    this.generateTile(TEX.FLUID_OVERLAY, (ctx) => {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.fillRect(0, 0, S, S);
      // Subtle wave pattern
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, S * 0.3);
      ctx.quadraticCurveTo(S * 0.25, S * 0.2, S * 0.5, S * 0.3);
      ctx.quadraticCurveTo(S * 0.75, S * 0.4, S, S * 0.3);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, S * 0.6);
      ctx.quadraticCurveTo(S * 0.25, S * 0.5, S * 0.5, S * 0.6);
      ctx.quadraticCurveTo(S * 0.75, S * 0.7, S, S * 0.6);
      ctx.stroke();
    });

    // ── Smoke particle (soft fuzzy circle) ──
    this.generateTile(TEX.SMOKE_PARTICLE, (ctx) => {
      const gradient = ctx.createRadialGradient(5, 5, 0, 5, 5, 5);
      gradient.addColorStop(0, 'rgba(180, 180, 190, 0.6)');
      gradient.addColorStop(0.5, 'rgba(140, 140, 150, 0.3)');
      gradient.addColorStop(1, 'rgba(100, 100, 110, 0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 10, 10);
    }, 10, 10);

    // ── Gas overlay (wispy, semi-transparent, tinted per-material at runtime) ──
    this.generateTile(TEX.GAS_OVERLAY, (ctx) => {
      // Soft cloudy blobs instead of a flat fill
      const drawBlob = (cx: number, cy: number, r: number, alpha: number) => {
        const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        gradient.addColorStop(0, `rgba(255, 255, 255, ${alpha})`);
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      };
      drawBlob(S * 0.3, S * 0.4, S * 0.4, 0.3);
      drawBlob(S * 0.65, S * 0.35, S * 0.35, 0.25);
      drawBlob(S * 0.5, S * 0.65, S * 0.3, 0.2);
    });
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
