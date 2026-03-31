/**
 * HUD overlay — displays position, turn count, phase, and controls.
 * Uses Phaser text objects pinned to the camera.
 */
import { Scene } from 'phaser';
import { Position } from '../ecs/components';
import { TurnPhase } from '../types';

const PHASE_LABELS: Record<number, string> = {
  [TurnPhase.PLAYER_INPUT]: 'YOUR TURN',
  [TurnPhase.PROCESSING]: 'PROCESSING',
  [TurnPhase.ANIMATION]: 'ANIMATING',
  [TurnPhase.ENEMY_TURN]: 'ENEMY TURN',
  [TurnPhase.ENEMY_ANIMATION]: 'ANIMATING',
};

const STYLE = {
  fontFamily: 'monospace',
  fontSize: '12px',
  color: '#889999',
};

const STYLE_BRIGHT = {
  fontFamily: 'monospace',
  fontSize: '12px',
  color: '#ccdddd',
};

const STYLE_DIM = {
  fontFamily: 'monospace',
  fontSize: '11px',
  color: '#556666',
};

export class HUD {
  private posText: Phaser.GameObjects.Text;
  private turnText: Phaser.GameObjects.Text;
  private phaseText: Phaser.GameObjects.Text;
  private controlsText: Phaser.GameObjects.Text;

  constructor(scene: Scene) {
    const { width, height } = scene.scale;

    // Top-left: position
    this.posText = scene.add.text(8, 6, '', STYLE_BRIGHT)
      .setScrollFactor(0)
      .setDepth(100);

    // Top-right: turn count
    this.turnText = scene.add.text(width - 8, 6, '', STYLE)
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(100);

    // Top-center: phase indicator
    this.phaseText = scene.add.text(width / 2, 6, '', STYLE)
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(100);

    // Bottom: controls help
    this.controlsText = scene.add.text(
      width / 2,
      height - 8,
      'WASD/Arrows: move | Space: wait | Shift: skip animations',
      STYLE_DIM,
    )
      .setOrigin(0.5, 1)
      .setScrollFactor(0)
      .setDepth(100);
  }

  update(playerEid: number, turnCount: number, phase: TurnPhase): void {
    const x = Position.x[playerEid];
    const y = Position.y[playerEid];
    this.posText.setText(`(${x}, ${y})`);
    this.turnText.setText(`Turn ${turnCount}`);
    this.phaseText.setText(PHASE_LABELS[phase] ?? '');
  }
}
