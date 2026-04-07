import { GameObjects, Scene } from 'phaser';
import type { FloorThing } from '../floorTypes';

const UI_TEXT_RESOLUTION = 2;

const MAX_VISIBLE = 4;
const PANEL_WIDTH = 192;
const LEFT_MARGIN = 28;
const BOTTOM_MARGIN = 60;
const PANEL_GAP = 0;
const ROW_HEIGHT = 18;
const DIVIDER_GAP = 4;

function truncateLabel(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 3))}...`;
}

export class FloorItemsPanel extends GameObjects.Container {
  private uiScale = 1;
  private positionScale = 1;
  private viewportPadding = { left: 0, right: 0, top: 0, bottom: 0 };
  private anchorX: number | null = null;
  private anchorTopY: number | null = null;
  private readonly background: GameObjects.Graphics;
  private readonly markerTexts: GameObjects.Text[] = [];
  private readonly nameTexts: GameObjects.Text[] = [];
  private readonly overflowText: GameObjects.Text;
  private readonly hintText: GameObjects.Text;

  constructor(scene: Scene) {
    super(scene, 0, 0);
    scene.add.existing(this);

    this.background = scene.add.graphics();
    this.add(this.background);

    for (let i = 0; i < MAX_VISIBLE; i++) {
      const marker = scene.add.text(0, 0, '', {
        fontFamily: 'monospace',
        fontSize: '12px',
        resolution: UI_TEXT_RESOLUTION,
      }).setOrigin(0, 0.5);

      const name = scene.add.text(0, 0, '', {
        fontFamily: 'monospace',
        fontSize: '12px',
        resolution: UI_TEXT_RESOLUTION,
      }).setOrigin(0, 0.5);

      this.markerTexts.push(marker);
      this.nameTexts.push(name);
      this.add(marker);
      this.add(name);
    }

    this.overflowText = scene.add.text(0, 0, '', {
      fontFamily: 'monospace',
      fontSize: '10px',
      color: '#556666',
      resolution: UI_TEXT_RESOLUTION,
    }).setOrigin(0, 0.5);

    this.hintText = scene.add.text(0, 0, 'E', {
      fontFamily: 'monospace',
      fontSize: '9px',
      color: '#445566',
      fontStyle: 'bold',
      resolution: UI_TEXT_RESOLUTION,
    }).setOrigin(0.5);

    this.add(this.overflowText);
    this.add(this.hintText);
    this.setVisible(false);
  }

  refresh(items: FloorThing[], selectedIndex: number, holdProgress: number): void {
    if (items.length === 0) {
      this.setVisible(false);
      return;
    }

    const visibleItems = items.slice(0, MAX_VISIBLE);
    const overflow = Math.max(0, items.length - visibleItems.length);
    const rowCount = visibleItems.length;
    const dividerCount = Math.max(0, rowCount - 1);
    const contentHeight = (rowCount * ROW_HEIGHT) + (dividerCount * DIVIDER_GAP) + (overflow > 0 ? 14 : 0);
    const panelHeight = Math.max(54, contentHeight + 20);

    this.setVisible(true);
    if (this.anchorX != null && this.anchorTopY != null) {
      this.setPosition(
        this.anchorX,
        this.anchorTopY - (PANEL_GAP * this.positionScale) - (panelHeight * this.uiScale),
      );
    } else {
      this.setPosition(
        this.viewportPadding.left + (LEFT_MARGIN * this.positionScale),
        this.scene.scale.height - this.viewportPadding.bottom - (BOTTOM_MARGIN * this.positionScale) - (panelHeight * this.uiScale),
      );
    }

    let y = 12;
    let selectedRowY = -1;
    for (let i = 0; i < MAX_VISIBLE; i++) {
      const marker = this.markerTexts[i];
      const name = this.nameTexts[i];
      const thing = visibleItems[i];

      if (!thing) {
        marker.setVisible(false);
        name.setVisible(false);
        continue;
      }

      const selected = selectedIndex === i;
      const corpse = thing.kind === 'corpse';
      const color = selected ? '#ffdd44' : corpse ? '#887766' : '#667777';
      const alpha = selected ? 1 : 0.7;
      if (selected) selectedRowY = y - 1;

      marker
        .setVisible(true)
        .setPosition(12, y + 6)
        .setText(corpse ? '†' : '♦')
        .setColor(color)
        .setAlpha(alpha)
        .setShadow(0, 0, selected ? '#ffdd4477' : '#00000000', selected ? 8 : 0, true, true);

      name
        .setVisible(true)
        .setPosition(28, y + 6)
        .setText(truncateLabel(thing.name, 20))
        .setColor(color)
        .setAlpha(alpha)
        .setShadow(0, 0, selected ? '#ffdd4477' : '#00000000', selected ? 8 : 0, true, true);

      y += ROW_HEIGHT + (i < visibleItems.length - 1 ? DIVIDER_GAP : 0);
    }

    this.overflowText
      .setVisible(overflow > 0)
      .setPosition(12, y + 2)
      .setText(`+${overflow} more`);

    this.hintText.setPosition(PANEL_WIDTH - 20, panelHeight - 14).setText('[E]');

    this.draw(panelHeight, visibleItems.length, overflow > 0, holdProgress, selectedRowY);
  }

  setUiScale(scale: number, positionScale = scale): void {
    this.uiScale = scale > 0 ? scale : 1;
    this.positionScale = positionScale > 0 ? positionScale : 1;
    this.setScale(this.uiScale);
  }

  setViewportPadding(padding: { left: number; right: number; top: number; bottom: number }): void {
    this.viewportPadding = padding;
  }

  setPinnedAbove(x: number, topY: number): void {
    this.anchorX = x;
    this.anchorTopY = topY;
  }

  private draw(panelHeight: number, rowCount: number, showOverflow: boolean, holdProgress: number, selectedRowY: number): void {
    const g = this.background;
    g.clear();

    g.fillStyle(0x080810, 0.78);
    g.lineStyle(1, 0x4ec9b0, 0.15);
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(PANEL_WIDTH * 0.94, 0);
    g.lineTo(PANEL_WIDTH, panelHeight * 0.4);
    g.lineTo(PANEL_WIDTH, panelHeight);
    g.lineTo(0, panelHeight);
    g.closePath();
    g.fillPath();
    g.strokePath();

    if (selectedRowY >= 0) {
      g.fillStyle(0xffdd44, 0.08);
      g.lineStyle(1, 0xffdd44, 0.45);
      g.fillRoundedRect(8, selectedRowY, PANEL_WIDTH - 36, ROW_HEIGHT - 2, 4);
      g.strokeRoundedRect(8, selectedRowY, PANEL_WIDTH - 36, ROW_HEIGHT - 2, 4);
    }

    if (rowCount > 1) {
      g.lineStyle(1, 0x4ec9b0, 0.06);
      let dividerY = 12 + ROW_HEIGHT - 1;
      for (let i = 0; i < rowCount - 1; i++) {
        g.beginPath();
        g.moveTo(12, dividerY);
        g.lineTo(PANEL_WIDTH - 40, dividerY);
        g.strokePath();
        dividerY += ROW_HEIGHT + DIVIDER_GAP;
      }
    }

    const hintX = PANEL_WIDTH - 20;
    const hintY = panelHeight - 14;
    g.lineStyle(2, 0x4ec9b0, 0.15);
    g.strokeCircle(hintX, hintY, 10);

    const progress = Math.max(0, Math.min(1, holdProgress));
    if (progress > 0) {
      g.lineStyle(2, 0x4ec9b0, 1);
      g.beginPath();
      g.arc(hintX, hintY, 10, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * progress));
      g.strokePath();
    }
  }
}
