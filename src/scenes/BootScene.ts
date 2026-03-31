import Phaser from 'phaser';

const TILE_SIZE = 32;
const GRID_W = 16;
const GRID_H = 12;

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  create(): void {
    const graphics = this.add.graphics();

    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        const isWall = x === 0 || y === 0 || x === GRID_W - 1 || y === GRID_H - 1;
        const color = isWall ? 0x334455 : 0x1a1a2e;
        const borderColor = 0x222233;

        graphics.fillStyle(color, 1);
        graphics.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        graphics.lineStyle(1, borderColor, 0.5);
        graphics.strokeRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
      }
    }

    // Placeholder player tile in the center
    const cx = Math.floor(GRID_W / 2);
    const cy = Math.floor(GRID_H / 2);
    graphics.fillStyle(0xe94560, 1);
    graphics.fillRect(cx * TILE_SIZE + 4, cy * TILE_SIZE + 4, TILE_SIZE - 8, TILE_SIZE - 8);

    this.add.text(TILE_SIZE + 8, TILE_SIZE + 8, 'OFFAL — Phase 0', {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: '#888888',
    });
  }
}
