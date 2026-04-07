import { Scene } from 'phaser';
import { TEX } from './BootScene';

export class UIBootScene extends Scene {
  constructor() {
    super({ key: 'UIBootScene' });
  }

  create(): void {
    this.generatePartSilhouettes();
    this.scene.start('UIScene');
  }

  private generatePartSilhouettes(): void {
    const S = 24;

    const generate = (key: string, draw: (ctx: CanvasRenderingContext2D) => void) => {
      if (this.textures.exists(key)) return;

      const canvas = document.createElement('canvas');
      canvas.width = S;
      canvas.height = S;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      draw(ctx);
      this.textures.addCanvas(key, canvas);
    };

    generate(TEX.PART_ARM, (ctx) => {
      ctx.beginPath();
      ctx.moveTo(12, 3);
      ctx.lineTo(16, 3);
      ctx.lineTo(16, 10);
      ctx.lineTo(20, 10);
      ctx.lineTo(20, 21);
      ctx.lineTo(16, 21);
      ctx.lineTo(16, 14);
      ctx.lineTo(12, 14);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.arc(18, 22, 2.5, 0, Math.PI * 2);
      ctx.fill();
    });

    generate(TEX.PART_LEG, (ctx) => {
      ctx.fillRect(9, 2, 6, 16);
      ctx.beginPath();
      ctx.moveTo(7, 18);
      ctx.lineTo(18, 18);
      ctx.lineTo(18, 22);
      ctx.lineTo(5, 22);
      ctx.closePath();
      ctx.fill();
    });

    generate(TEX.PART_HEAD, (ctx) => {
      ctx.beginPath();
      ctx.arc(12, 9, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(9.5, 14, 5, 6);
    });

    generate(TEX.PART_TORSO, (ctx) => {
      ctx.beginPath();
      ctx.moveTo(8, 2);
      ctx.lineTo(16, 2);
      ctx.lineTo(20, 8);
      ctx.lineTo(18, 22);
      ctx.lineTo(6, 22);
      ctx.lineTo(4, 8);
      ctx.closePath();
      ctx.fill();
    });

    generate(TEX.PART_ORGAN, (ctx) => {
      ctx.beginPath();
      ctx.moveTo(12, 5);
      ctx.bezierCurveTo(19, 0, 23, 8, 12, 20);
      ctx.bezierCurveTo(1, 8, 5, 0, 12, 5);
      ctx.fill();
    });

    generate(TEX.PART_SENSOR, (ctx) => {
      ctx.beginPath();
      ctx.arc(12, 12, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(12, 12, 8.5, 0.2, Math.PI - 0.2);
      ctx.stroke();
    });

    generate(TEX.PART_MOUTH, (ctx) => {
      ctx.beginPath();
      ctx.moveTo(4, 10);
      ctx.lineTo(20, 10);
      ctx.lineTo(16, 17);
      ctx.lineTo(8, 17);
      ctx.closePath();
      ctx.fill();
      for (let x = 6; x <= 18; x += 4) {
        ctx.beginPath();
        ctx.moveTo(x, 10);
        ctx.lineTo(x - 1.5, 6);
        ctx.lineTo(x + 1.5, 10);
        ctx.closePath();
        ctx.fill();
      }
    });

    generate(TEX.PART_SEGMENT, (ctx) => {
      for (let i = 0; i < 3; i++) {
        ctx.fillRect(6, 4 + i * 6, 12, 4);
      }
    });

    generate(TEX.PART_ROTOR, (ctx) => {
      ctx.beginPath();
      ctx.arc(12, 12, 2.5, 0, Math.PI * 2);
      ctx.fill();
      for (let i = 0; i < 4; i++) {
        const angle = i * Math.PI / 2;
        ctx.save();
        ctx.translate(12, 12);
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.ellipse(0, -7, 2.5, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    });
  }
}
