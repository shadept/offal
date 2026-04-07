import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import { UIScene } from './scenes/UIScene';
import { UIBootScene } from './scenes/UIBootScene';
// @ts-ignore
import RexUIPlugin from 'phaser4-rex-plugins/templates/ui/ui-plugin.js';
import { BaseWindow, onWindowVisibilityChange } from './ui/canvas/Window';

function createPlugins(): Phaser.Types.Core.PluginObjectItem[] {
  return [{
    key: 'rexUI',
    plugin: RexUIPlugin,
    mapping: 'rexUI',
  }];
}

function createScaleConfig(): Phaser.Types.Core.ScaleConfig {
  return {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  };
}

const game = new Phaser.Game({
  type: Phaser.AUTO,
  width: 1280,
  height: 720,
  backgroundColor: '#000000',
  parent: 'game-root',
  scene: [BootScene, GameScene],
  pixelArt: true,
  plugins: { scene: createPlugins() },
  fps: {
    target: 60,
    forceSetTimeOut: true,
  },
  input: {
    keyboard: true,
    mouse: { preventDefaultWheel: true, preventDefaultDown: true },
  },
  disableContextMenu: true,
  scale: createScaleConfig(),
});

const uiGame = new Phaser.Game({
  type: Phaser.AUTO,
  width: 2560,
  height: 1440,
  parent: 'ui-root',
  scene: [UIBootScene, UIScene],
  pixelArt: false,
  transparent: true,
  plugins: { scene: createPlugins() },
  fps: {
    target: 60,
    forceSetTimeOut: true,
  },
  input: {
    keyboard: false,
    mouse: { preventDefaultWheel: true, preventDefaultDown: true },
  },
  disableContextMenu: true,
  scale: createScaleConfig(),
});

const syncUICanvasPointerEvents = () => {
  const root = document.getElementById('ui-root');
  const canvas = uiGame.canvas as HTMLCanvasElement | null;
  const interactive = BaseWindow.anyVisible;

  if (root) root.style.pointerEvents = interactive ? 'auto' : 'none';
  if (canvas) canvas.style.pointerEvents = interactive ? 'auto' : 'none';
};

onWindowVisibilityChange(syncUICanvasPointerEvents);
syncUICanvasPointerEvents();

export default game;
export { uiGame };
