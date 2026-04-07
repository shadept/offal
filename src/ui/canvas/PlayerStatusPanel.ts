import { Scene } from 'phaser';

const UI_TEXT_RESOLUTION = 2;

export interface PlayerStatusData {
  hp?: number;
  maxHp?: number;
  mobility?: number;
  manipulation?: number;
  consciousness?: number;
  circulation?: number;
}

export class PlayerStatusPanel {
  readonly root: any;

  private readonly scene: Scene;
  private readonly hpBar: any;
  private readonly hpGhost: any;
  private readonly hpText: Phaser.GameObjects.Text;
  private readonly capLabels: Record<string, Phaser.GameObjects.Text> = {};
  private lastHp = -1;

  constructor(scene: Scene) {
    this.scene = scene;

    this.root = (scene as any).rexUI.add.sizer({
      x: 0,
      y: 0,
      orientation: 'y',
      space: { left: 13, right: 13, top: 13, bottom: 13, item: 6 },
    }).setOrigin(0, 1);

    const background = (scene as any).rexUI.add.roundRectangle(0, 0, 2, 2, 0, 0x080810, 0.72)
      .setStrokeStyle(0, 0, 0);
    this.root.addBackground(background);

    const capRow = (scene as any).rexUI.add.sizer({ orientation: 'x', space: { item: 12 } });
    ['MOB', 'MAN', 'CON', 'CIR'].forEach((label) => {
      const text = scene.add.text(0, 0, label, {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#4ec9b0',
        fontStyle: 'bold',
        resolution: UI_TEXT_RESOLUTION,
      });
      this.capLabels[label] = text;
      capRow.add(text);
    });

    const hpRow = (scene as any).rexUI.add.sizer({ orientation: 'x', space: { item: 8 } });
    const hpLabel = scene.add.text(0, 0, 'HP', {
      fontFamily: 'monospace',
      fontSize: '13px',
      color: '#556666',
      letterSpacing: 1,
      resolution: UI_TEXT_RESOLUTION,
    }).setFixedSize(30, 16);

    const track = (scene as any).rexUI.add.overlapSizer({ width: 160, height: 8 });
    const hpTrackBg = (scene as any).rexUI.add.roundRectangle(0, 0, 160, 8, 4, 0x1a1a2e, 0.6)
      .setStrokeStyle(1, 0x334444, 0.3);

    this.hpGhost = (scene as any).rexUI.add.roundRectangle(0, 0, 0, 8, 3, 0xe94560, 0.6).setOrigin(0, 0.5);
    this.hpBar = (scene as any).rexUI.add.roundRectangle(0, 0, 160, 8, 3, 0x4ec9b0, 1.0).setOrigin(0, 0.5);

    track.addBackground(hpTrackBg);
    track.add(this.hpGhost, { expand: false, align: 'left' });
    track.add(this.hpBar, { expand: false, align: 'left' });

    this.hpText = scene.add.text(0, 0, '25/25', {
      fontFamily: 'monospace',
      fontSize: '13px',
      color: '#778888',
      resolution: UI_TEXT_RESOLUTION,
    }).setFixedSize(56, 16);

    hpRow.add(hpLabel);
    hpRow.add(track, { proportion: 0 });
    hpRow.add(this.hpText);

    this.root.add(capRow, { align: 'left' });
    this.root.add(hpRow, { align: 'left' });
    this.root.layout();
  }

  setUiScale(scale: number): void {
    this.root.setScale(scale);
  }

  setPosition(x: number, y: number): void {
    this.root.setPosition(x, y);
  }

  refresh(data: PlayerStatusData): void {
    if (data.hp != null && data.maxHp != null) {
      this.hpText.setText(`${data.hp}/${data.maxHp}`);
      const ratio = Math.max(0, data.hp / data.maxHp);

      if (this.lastHp > 0 && data.hp < this.lastHp) {
        const oldRatio = this.lastHp / data.maxHp;
        this.hpGhost.width = 160 * oldRatio;
        this.hpGhost.setVisible(true).setAlpha(1);
        this.scene.tweens.add({
          targets: this.hpGhost,
          alpha: 0,
          duration: 400,
          onComplete: () => this.hpGhost.setVisible(false),
        });
      }

      this.lastHp = data.hp;
      this.hpBar.width = 160 * ratio;
      this.hpBar.fillColor = ratio > 0.6 ? 0x4ec9b0 : ratio > 0.3 ? 0xc9a84e : 0xe94560;
    }

    if (data.mobility != null) {
      this.capLabels.MOB.setColor(this.getCapColor(data.mobility));
      this.capLabels.MAN.setColor(this.getCapColor(data.manipulation ?? 0));
      this.capLabels.CON.setColor(this.getCapColor(data.consciousness ?? 0));
      this.capLabels.CIR.setColor(this.getCapColor(data.circulation ?? 0));
    }
  }

  private getCapColor(value: number): string {
    if (value <= 0) return '#e94560';
    if (value < 20) return '#e94560';
    if (value < 60) return '#c9a84e';
    return '#4ec9b0';
  }
}
