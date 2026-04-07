import { GameObjects, Scene } from 'phaser';

const UI_TEXT_RESOLUTION = 2;

export class TopRightHud extends GameObjects.Container {
  private readonly keysBtn: GameObjects.Text;
  private readonly fpsLabel: GameObjects.Text;

  constructor(scene: Scene, onToggleKeys: () => void) {
    super(scene, 0, 0);
    scene.add.existing(this);

    this.keysBtn = scene.add.text(0, 0, '[?] keys', {
      fontFamily: 'monospace',
      fontSize: '12.8px',
      color: '#556666',
      resolution: UI_TEXT_RESOLUTION,
    }).setOrigin(1, 0).setInteractive({ useHandCursor: true });

    this.keysBtn
      .on('pointerover', () => this.keysBtn.setColor('#889999'))
      .on('pointerout', () => this.keysBtn.setColor('#556666'))
      .on('pointerdown', onToggleKeys);

    this.fpsLabel = scene.add.text(0, 16, '0 fps', {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#445566',
      resolution: UI_TEXT_RESOLUTION,
    }).setOrigin(1, 0);

    this.add([this.keysBtn, this.fpsLabel]);
  }

  refresh(fps: number): void {
    this.fpsLabel.setText(`${Math.round(fps || 0)} fps`);
  }

  setUiScale(scale: number): void {
    this.setScale(scale);
  }
}
