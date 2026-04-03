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
  TELEPORTER: 'tile_teleporter',
  VOID: 'tile_void',
  // Ambient
  SPARK: 'particle_spark',
  // Physics (Phase 4)
  FIRE_PARTICLE: 'particle_fire',
  FIRE_OVERLAY: 'tile_fire_overlay',
  FLUID_OVERLAY: 'tile_fluid_overlay',
  SMOKE_PARTICLE: 'particle_smoke',
  GAS_OVERLAY: 'tile_gas_overlay',
  EXPLOSION_PARTICLE: 'particle_explosion',
  NEBULA: 'bg_nebula',
  SEVERED_PART: 'entity_severed_part',
  ITEM: 'entity_item',
} as const;

/** Get the texture key for a species. Convention: `entity_{speciesId}` */
export function speciesTexKey(speciesId: string): string {
  return `entity_${speciesId}`;
}

/** Get texture key for architecture-specific floor tile */
export function archFloorTex(archId: string): string {
  return `floor_${archId}`;
}

/** Get texture key for architecture-specific wall tile */
export function archWallTex(archId: string): string {
  return `wall_${archId}`;
}

/** Parse a CSS hex color string to {r,g,b} in 0-255 */
function parseHex(hex: string): { r: number; g: number; b: number } {
  const c = hex.replace('#', '');
  return {
    r: parseInt(c.substring(0, 2), 16),
    g: parseInt(c.substring(2, 4), 16),
    b: parseInt(c.substring(4, 6), 16),
  };
}

/** Lighten a color by mixing toward white */
function lighten(hex: string, amount: number): string {
  const { r, g, b } = parseHex(hex);
  const lr = Math.round(r + (255 - r) * amount);
  const lg = Math.round(g + (255 - g) * amount);
  const lb = Math.round(b + (255 - b) * amount);
  return `rgb(${lr},${lg},${lb})`;
}

/** Darken a color by mixing toward black */
function darken(hex: string, amount: number): string {
  const { r, g, b } = parseHex(hex);
  return `rgb(${Math.round(r * (1 - amount))},${Math.round(g * (1 - amount))},${Math.round(b * (1 - amount))})`;
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
    this.generateArchitectureTextures();
    this.generatePhysicsTextures();
    this.generateNebulaTexture();

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

    // ── Teleporter pad ──
    this.generateTile(TEX.TELEPORTER, (ctx) => {
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(0, 0, S, S);
      // Diamond shape with glow
      const cx = S / 2, cy = S / 2, r = S * 0.35;
      ctx.fillStyle = '#38bdf8';
      ctx.globalAlpha = 0.3;
      ctx.beginPath();
      ctx.arc(cx, cy, r + 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#818cf8';
      ctx.beginPath();
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx + r, cy);
      ctx.lineTo(cx, cy + r);
      ctx.lineTo(cx - r, cy);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#e0e7ff';
      ctx.beginPath();
      ctx.arc(cx, cy, 3, 0, Math.PI * 2);
      ctx.fill();
    });

    // ── Void tile (transparent — nebula background shows through) ──
    this.generateTile(TEX.VOID, (_ctx) => {
      // intentionally blank — fully transparent
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

  /** Generate per-architecture floor/wall textures from color data. */
  private generateArchitectureTextures(): void {
    const S = TILE_SIZE;
    const registry = getRegistry();

    for (const [, arch] of registry.architectures) {
      const wallColor = arch.colors?.wallColor ?? '#334455';
      const floorColor = arch.colors?.floorColor ?? '#1a1a2e';

      // ── Floor texture ──
      this.generateTile(archFloorTex(arch.id), (ctx) => {
        ctx.fillStyle = floorColor;
        ctx.fillRect(0, 0, S, S);
        // Subtle grid edge
        ctx.strokeStyle = lighten(floorColor, 0.08);
        ctx.lineWidth = 1;
        ctx.strokeRect(0.5, 0.5, S - 1, S - 1);
        // Corner detail dots
        ctx.fillStyle = lighten(floorColor, 0.06);
        ctx.beginPath();
        ctx.arc(4, 4, 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(S - 4, S - 4, 1.5, 0, Math.PI * 2);
        ctx.fill();
      });

      // ── Wall texture ──
      this.generateTile(archWallTex(arch.id), (ctx) => {
        ctx.fillStyle = wallColor;
        ctx.fillRect(0, 0, S, S);
        // Inset shadow
        ctx.strokeStyle = darken(wallColor, 0.3);
        ctx.lineWidth = 1;
        ctx.strokeRect(1.5, 1.5, S - 3, S - 3);
        // Top-left highlight
        ctx.strokeStyle = lighten(wallColor, 0.15);
        ctx.beginPath();
        ctx.moveTo(1, 1);
        ctx.lineTo(S - 1, 1);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(1, 1);
        ctx.lineTo(1, S - 1);
        ctx.stroke();
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

    // ── Explosion particle (bright white-yellow flash dot) ──
    this.generateTile(TEX.EXPLOSION_PARTICLE, (ctx) => {
      const gradient = ctx.createRadialGradient(4, 4, 0, 4, 4, 4);
      gradient.addColorStop(0, '#ffffff');
      gradient.addColorStop(0.3, '#ffee66');
      gradient.addColorStop(0.6, '#ff8800');
      gradient.addColorStop(1, 'rgba(255, 50, 0, 0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 8, 8);
    }, 8, 8);

    // ── Severed part (small reddish lump on objects layer) ──
    this.generateTile(TEX.SEVERED_PART, (ctx) => {
      ctx.fillStyle = '#883333';
      ctx.beginPath();
      ctx.ellipse(S / 2, S / 2, S * 0.22, S * 0.18, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#aa4444';
      ctx.beginPath();
      ctx.ellipse(S / 2 - 1, S / 2 - 1, S * 0.12, S * 0.1, 0.3, 0, Math.PI * 2);
      ctx.fill();
    });

    // ── Item on floor (small cyan diamond) ──
    this.generateTile(TEX.ITEM, (ctx) => {
      ctx.fillStyle = '#338888';
      ctx.beginPath();
      ctx.moveTo(S / 2, S * 0.3);
      ctx.lineTo(S * 0.65, S / 2);
      ctx.lineTo(S / 2, S * 0.7);
      ctx.lineTo(S * 0.35, S / 2);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#55bbbb';
      ctx.beginPath();
      ctx.moveTo(S / 2, S * 0.36);
      ctx.lineTo(S * 0.58, S / 2);
      ctx.lineTo(S / 2, S * 0.64);
      ctx.lineTo(S * 0.42, S / 2);
      ctx.closePath();
      ctx.fill();
    });

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

  /** Generate a tileable nebula background texture. */
  private generateNebulaTexture(): void {
    const S = 512;
    const canvas = document.createElement('canvas');
    canvas.width = S;
    canvas.height = S;
    const ctx = canvas.getContext('2d')!;

    // Deep space base
    ctx.fillStyle = '#050510';
    ctx.fillRect(0, 0, S, S);

    // Seeded PRNG for deterministic nebula
    let seed = 42;
    const rand = () => {
      seed = (seed * 16807 + 0) % 2147483647;
      return (seed - 1) / 2147483646;
    };

    // Nebula clouds — large overlapping radial gradients
    const clouds: { x: number; y: number; r: number; h: number; s: number; l: number; a: number }[] = [
      { x: 0.2, y: 0.3, r: 0.5,  h: 260, s: 60, l: 15, a: 0.12 },
      { x: 0.7, y: 0.6, r: 0.45, h: 320, s: 50, l: 12, a: 0.10 },
      { x: 0.5, y: 0.2, r: 0.35, h: 200, s: 40, l: 10, a: 0.08 },
      { x: 0.3, y: 0.8, r: 0.4,  h: 280, s: 55, l: 14, a: 0.09 },
      { x: 0.8, y: 0.2, r: 0.3,  h: 340, s: 45, l: 12, a: 0.07 },
    ];

    for (const c of clouds) {
      const cx = c.x * S;
      const cy = c.y * S;
      const cr = c.r * S;
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, cr);
      grad.addColorStop(0, `hsla(${c.h}, ${c.s}%, ${c.l}%, ${c.a})`);
      grad.addColorStop(0.4, `hsla(${c.h}, ${c.s}%, ${c.l * 0.7}%, ${c.a * 0.6})`);
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, S, S);
    }

    // Wispy filaments — thin streaks of color
    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < 8; i++) {
      const x1 = rand() * S;
      const y1 = rand() * S;
      const x2 = x1 + (rand() - 0.5) * S * 0.8;
      const y2 = y1 + (rand() - 0.5) * S * 0.8;
      const hue = 220 + rand() * 140;
      const grad = ctx.createLinearGradient(x1, y1, x2, y2);
      grad.addColorStop(0, 'transparent');
      grad.addColorStop(0.3, `hsla(${hue}, 50%, 15%, 0.06)`);
      grad.addColorStop(0.5, `hsla(${hue}, 60%, 20%, 0.08)`);
      grad.addColorStop(0.7, `hsla(${hue}, 50%, 15%, 0.06)`);
      grad.addColorStop(1, 'transparent');
      ctx.lineWidth = 8 + rand() * 20;
      ctx.strokeStyle = grad;
      ctx.beginPath();
      const cpx = (x1 + x2) / 2 + (rand() - 0.5) * 100;
      const cpy = (y1 + y2) / 2 + (rand() - 0.5) * 100;
      ctx.moveTo(x1, y1);
      ctx.quadraticCurveTo(cpx, cpy, x2, y2);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';

    // Stars — varying sizes and brightness
    for (let i = 0; i < 200; i++) {
      const sx = rand() * S;
      const sy = rand() * S;
      const brightness = 0.3 + rand() * 0.7;
      const size = rand() < 0.92 ? 0.5 + rand() * 0.5 : 1 + rand() * 1.5;

      // Faint color tint for brighter stars
      let color: string;
      if (brightness > 0.8) {
        const hue = rand() < 0.5 ? 200 + rand() * 40 : 20 + rand() * 30;
        color = `hsla(${hue}, 40%, ${70 + brightness * 30}%, ${brightness})`;
      } else {
        color = `rgba(255, 255, 255, ${brightness})`;
      }

      // Glow for larger stars
      if (size > 1) {
        const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, size * 3);
        glow.addColorStop(0, `rgba(200, 210, 255, ${brightness * 0.15})`);
        glow.addColorStop(1, 'transparent');
        ctx.fillStyle = glow;
        ctx.fillRect(sx - size * 3, sy - size * 3, size * 6, size * 6);
      }

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(sx, sy, size, 0, Math.PI * 2);
      ctx.fill();
    }

    this.textures.addCanvas(TEX.NEBULA, canvas);
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
