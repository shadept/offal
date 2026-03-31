import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  width: 512,
  height: 384,
  backgroundColor: '#000000',
  parent: document.body,
  scene: [BootScene],
  pixelArt: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
});

export default game;
