import { Scene } from 'phaser';
import type { LogEntry } from '../gameLog';

const UI_TEXT_RESOLUTION = 2;

const LOG_PANEL_WIDTH = 560;
const LOG_PANEL_HEIGHT = 220;
const LOG_PANEL_PADDING = 32;
const LOG_TURN_COLUMN_WIDTH = 72;

const CRITICAL_PATTERNS = [/severed/i, /unconscious/i, /bleeding/i, /on fire/i, /died/i, /killed/i, /destroyed/i];
const COLORS: Record<string, string> = {
  combat: '#c9a84e',
  environment: '#cc8833',
  death: '#e94560',
  system: '#556666',
};

export class GameLogPanel {
  readonly root: any;

  private readonly scene: Scene;
  private readonly contentWidth: number;

  constructor(scene: Scene) {
    this.scene = scene;
    this.contentWidth = LOG_PANEL_WIDTH - LOG_PANEL_PADDING;

    this.root = (scene as any).rexUI.add.scrollablePanel({
      x: 0,
      y: 0,
      width: LOG_PANEL_WIDTH,
      height: LOG_PANEL_HEIGHT,
      scrollMode: 0,
      background: (scene as any).rexUI.add.roundRectangle(0, 0, 2, 2, 0, 0x080810, 0.72)
        .setStrokeStyle(0, 0, 0),
      panel: {
        child: (scene as any).rexUI.add.sizer({ orientation: 'y', space: { item: 6 } }),
        mask: { padding: 2 },
      },
      align: { panel: 'left' },
      space: { left: 16, right: 16, top: 16, bottom: 16 },
      mouseWheelScroller: { focus: false, speed: 0.1 },
    }).setOrigin(1, 1);

    this.root.layout();
  }

  setUiScale(scale: number): void {
    this.root.setScale(scale);
    this.root.layout();
  }

  setPosition(x: number, y: number): void {
    this.root.setPosition(x, y);
    this.root.layout();
  }

  refresh(entries: readonly LogEntry[], currentTurn: number): void {
    const list = this.root.getElement('panel');
    if (!list) return;

    list.removeAll(true);

    const visibleEntries = entries.slice(-30);
    const wrapWidth = Math.max(220, this.contentWidth - LOG_TURN_COLUMN_WIDTH - 16);

    for (const entry of visibleEntries) {
      const isCritical = entry.category === 'death' || CRITICAL_PATTERNS.some((pattern) => pattern.test(entry.text));
      const age = currentTurn - entry.turn;
      const opacity = age <= 0 ? 1 : age === 1 ? 0.6 : age === 2 ? 0.4 : 0.25;

      const entrySizer = (this.scene as any).rexUI.add.sizer({ orientation: 'x', space: { item: 12 } });

      const turnText = this.scene.add.text(0, 0, `T${entry.turn}`, {
        fontFamily: 'monospace',
        fontSize: '24px',
        color: '#334455',
        resolution: UI_TEXT_RESOLUTION,
      }).setOrigin(0, 0).setFixedSize(LOG_TURN_COLUMN_WIDTH, 0);

      const content = isCritical ? entry.text.toUpperCase() : entry.text;
      const textStyle: any = {
        fontFamily: 'monospace',
        fontSize: '25.6px',
        color: isCritical ? '#e94560' : (COLORS[entry.category] || '#778888'),
        align: 'left',
        wordWrap: { width: wrapWidth },
        resolution: UI_TEXT_RESOLUTION,
      };

      if (isCritical) {
        textStyle.fontStyle = 'bold';
      }

      const text = this.scene.add.text(0, 0, content, textStyle).setOrigin(0, 0);
      if (isCritical) {
        text.setShadow(0, 0, '#e9456066', 6, true, true);
      }

      entrySizer.add(turnText, { proportion: 0, align: 'top' });
      entrySizer.add(text, { proportion: 1, expand: true });
      entrySizer.setAlpha(opacity);

      list.add(entrySizer, { proportion: 0, expand: true, align: 'left' });
    }

    this.root.layout();
    this.root.scrollToBottom();
  }
}
