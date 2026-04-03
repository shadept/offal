import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  backgroundColor: '#000000',
  parent: document.body,
  scene: [BootScene, GameScene],
  pixelArt: true,
  fps: {
    target: 60,
    forceSetTimeOut: true,
  },
  input: {
    keyboard: true,
    mouse: { preventDefaultWheel: true, preventDefaultDown: true },
  },
  disableContextMenu: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
});

export default game;
