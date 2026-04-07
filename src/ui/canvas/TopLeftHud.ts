import { GameObjects, Scene } from 'phaser';

const UI_TEXT_RESOLUTION = 2;

export interface TopLeftHudData {
  shipType?: string;
  location?: string;
  turn?: number;
}

export class TopLeftHud extends GameObjects.Container {
  private readonly locLabel: GameObjects.Text;
  private readonly turnLabel: GameObjects.Text;

  constructor(scene: Scene) {
    super(scene, 0, 0);
    scene.add.existing(this);

    this.locLabel = scene.add.text(0, 0, 'SHIP — ROOM', {
      fontFamily: 'monospace',
      fontSize: '13.6px',
      color: '#889999',
      resolution: UI_TEXT_RESOLUTION,
    });

    this.turnLabel = scene.add.text(0, 16, 'TURN 0', {
      fontFamily: 'monospace',
      fontSize: '12.8px',
      color: '#556666',
      letterSpacing: 1,
      resolution: UI_TEXT_RESOLUTION,
    });

    this.add([this.locLabel, this.turnLabel]);
  }

  refresh(data: TopLeftHudData): void {
    this.locLabel.setText(`${data.shipType || 'UNKNOWN'}${data.location ? ` — ${data.location}` : ''}`);
    this.turnLabel.setText(`TURN ${data.turn || 0}`);
  }

  setUiScale(scale: number): void {
    this.setScale(scale);
  }
}
