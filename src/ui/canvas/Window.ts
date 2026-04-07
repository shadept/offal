import { GameObjects, Scene } from 'phaser';

const HEADER_HEIGHT = 30;
const UI_TEXT_RESOLUTION = 2;

// ────────────────────────────────────────────────────
// Config
// ────────────────────────────────────────────────────

export interface WindowConfig {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  title: string;
  onClose?: () => void;
  destroyOnClose?: boolean;
}

export interface ViewportPadding {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

// ────────────────────────────────────────────────────
// BaseWindow
//
//   Frame (bg, title, close button, drag zone) is a Container.
//   Content sizer lives at the SCENE level (not inside the Container)
//   so rexUI input hit-testing works correctly.
//   Position / scale / visibility / depth are kept in sync.
// ────────────────────────────────────────────────────

// ── Pointer-events sync ──
// The UI runs on a separate canvas overlaying the game canvas.
// pointer-events on the UI canvas must be 'auto' when any window is open
// so clicks reach Phaser, and 'none' otherwise so clicks fall through to the game.
// BaseWindow manages this automatically via a static visible-count.

let pointerEventsSyncFn: (() => void) | null = null;

/** Register the function that toggles pointer-events on the UI canvas. Called once from main.ts. */
export function onWindowVisibilityChange(fn: () => void): void {
  pointerEventsSyncFn = fn;
}

export class BaseWindow extends GameObjects.Container {
  private static visibleCount = 0;

  /** True when at least one BaseWindow is visible on screen. */
  static get anyVisible(): boolean { return BaseWindow.visibleCount > 0; }

  readonly windowWidth: number;
  readonly windowHeight: number;

  private readonly bg: GameObjects.Graphics;
  private readonly headerZone: GameObjects.Zone;
  private contentSizer: any | null = null;
  private trackedVisible = false;

  private uiScale = 1;
  private positionScale = 1;
  private viewportPadding: ViewportPadding = { left: 0, right: 0, top: 0, bottom: 0 };
  private readonly resizeHandler: () => void;

  constructor(scene: Scene, config: WindowConfig) {
    const {
      x = 400,
      y = 300,
      width = 300,
      height = 400,
      title,
      onClose,
      destroyOnClose = true,
    } = config;

    super(scene, x, y);
    scene.add.existing(this);
    this.setDepth(100);

    this.windowWidth = width;
    this.windowHeight = height;

    // ── 1. Background ──
    this.bg = scene.add.graphics();
    this.add(this.bg);
    this.drawBackground();

    // ── 2. Header drag zone (invisible, for drag behaviour) ──
    this.headerZone = scene.add.zone(0, 0, width, HEADER_HEIGHT).setOrigin(0, 0);
    this.add(this.headerZone);

    // ── 3. Title text (not interactive) ──
    const titleText = scene.add.text(12, 8, title.toUpperCase(), {
      fontFamily: 'monospace',
      fontSize: '15px',
      color: '#ccdddd',
      resolution: UI_TEXT_RESOLUTION,
    });
    this.add(titleText);

    // ── 4. Close button (highest layer in frame) ──
    const closeBtn = scene.add.text(width - 10, HEADER_HEIGHT / 2, 'X', {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: '#778888',
      fontStyle: 'bold',
      padding: { left: 6, right: 6, top: 3, bottom: 3 },
      resolution: UI_TEXT_RESOLUTION,
    }).setOrigin(1, 0.5);

    const closeBtnBg = scene.add.graphics();
    this.add(closeBtnBg);
    this.add(closeBtn);

    const cbx = width - 10 - closeBtn.width;
    const cby = HEADER_HEIGHT / 2 - closeBtn.height / 2;
    const drawCloseBg = (fill: number, fillA: number, stroke: number, strokeA: number) => {
      closeBtnBg.clear();
      closeBtnBg.fillStyle(fill, fillA);
      closeBtnBg.fillRoundedRect(cbx, cby, closeBtn.width, closeBtn.height, 3);
      closeBtnBg.lineStyle(1, stroke, strokeA);
      closeBtnBg.strokeRoundedRect(cbx, cby, closeBtn.width, closeBtn.height, 3);
    };
    drawCloseBg(0x1a1a2e, 0.6, 0x556666, 0.4);

    closeBtn
      .setInteractive({ useHandCursor: true })
      .on('pointerover', () => { closeBtn.setColor('#e94560'); drawCloseBg(0x2a1a2e, 0.8, 0xe94560, 0.8); })
      .on('pointerout', () => { closeBtn.setColor('#778888'); drawCloseBg(0x1a1a2e, 0.6, 0x556666, 0.4); })
      .on('pointerdown', () => {
        if (onClose) onClose();
        if (destroyOnClose) this.destroy();
      });

    // ── Resize handler ──
    this.resizeHandler = () => this.clampToViewport();
    scene.scale.on('resize', this.resizeHandler);
    scene.events.once('shutdown', () => scene.scale.off('resize', this.resizeHandler));

    this.clampToViewport();
  }

  /** Return the header Zone so DragBehavior can bind to it. */
  getHeaderZone(): GameObjects.Zone {
    return this.headerZone;
  }

  /** Lazily create (or return) a rexUI Sizer for content below the header. */
  getContentSizer(): any {
    if (!this.contentSizer) {
      const rexUI = (this.scene as any).rexUI;
      const contentH = this.windowHeight - HEADER_HEIGHT;
      this.contentSizer = rexUI.add.sizer({
        x: this.windowWidth / 2,
        y: HEADER_HEIGHT + contentH / 2,
        width: this.windowWidth,
        height: contentH,
        orientation: 'y',
        space: { left: 0, right: 0, top: 0, bottom: 0, item: 0 },
      });
      this.add(this.contentSizer);
    }
    return this.contentSizer;
  }

  override setVisible(value: boolean): this {
    super.setVisible(value);
    if (value && !this.trackedVisible) {
      this.trackedVisible = true;
      BaseWindow.visibleCount++;
      pointerEventsSyncFn?.();
    } else if (!value && this.trackedVisible) {
      this.trackedVisible = false;
      BaseWindow.visibleCount--;
      pointerEventsSyncFn?.();
    }
    return this;
  }

  /** No-op kept for API compat — content is inside the Container. */
  bringContentToTop(): void {}

  override destroy(fromScene?: boolean): void {
    if (this.trackedVisible) {
      this.trackedVisible = false;
      BaseWindow.visibleCount--;
      pointerEventsSyncFn?.();
    }
    this.scene?.scale?.off('resize', this.resizeHandler);
    super.destroy(fromScene);
  }

  // ── Scaling / Viewport ──

  setUiScale(scale: number, positionScale = scale): void {
    const nextScale = scale > 0 ? scale : 1;
    const nextPositionScale = positionScale > 0 ? positionScale : 1;
    const ratio = nextPositionScale / this.positionScale;

    this.setScale(nextScale);
    this.setPosition(this.x * ratio, this.y * ratio);

    this.uiScale = nextScale;
    this.positionScale = nextPositionScale;
    this.clampToViewport();
  }

  setViewportPadding(padding: ViewportPadding): void {
    this.viewportPadding = padding;
    this.clampToViewport();
  }

  clampToViewport(): void {
    const w = this.windowWidth * this.scaleX;
    const h = this.windowHeight * this.scaleY;
    const minX = this.viewportPadding.left;
    const minY = this.viewportPadding.top;
    const maxX = Math.max(minX, this.scene.scale.width - this.viewportPadding.right - w);
    const maxY = Math.max(minY, this.scene.scale.height - this.viewportPadding.bottom - h);

    this.setPosition(
      Math.min(Math.max(this.x, minX), maxX),
      Math.min(Math.max(this.y, minY), maxY),
    );
  }

  // ── Background ──

  private drawBackground(): void {
    const g = this.bg;
    g.clear();
    g.fillStyle(0x0a0a12, 0.96);
    g.fillRoundedRect(0, 0, this.windowWidth, this.windowHeight, 4);
    g.lineStyle(1, 0x334455, 1);
    g.strokeRoundedRect(0, 0, this.windowWidth, this.windowHeight, 4);
    g.lineStyle(1, 0x334455, 0.3);
    g.beginPath();
    g.moveTo(8, HEADER_HEIGHT);
    g.lineTo(this.windowWidth - 8, HEADER_HEIGHT);
    g.strokePath();
  }
}

// ────────────────────────────────────────────────────
// DragBehavior — composable, adds drag-by-header to any BaseWindow
// ────────────────────────────────────────────────────

export function addDragBehavior(window: BaseWindow, scene: Scene): void {
  const zone = window.getHeaderZone();
  zone.setInteractive({ useHandCursor: true });
  scene.input.setDraggable(zone);

  let startPX = 0;
  let startPY = 0;
  let startWX = 0;
  let startWY = 0;

  zone.on('pointerdown', () => {
    scene.children.bringToTop(window);
    window.bringContentToTop();
  });

  zone.on('dragstart', (pointer: Phaser.Input.Pointer) => {
    startPX = pointer.x;
    startPY = pointer.y;
    startWX = window.x;
    startWY = window.y;
    scene.children.bringToTop(window);
    window.bringContentToTop();
  });

  zone.on('drag', (pointer: Phaser.Input.Pointer) => {
    window.setPosition(
      startWX + (pointer.x - startPX),
      startWY + (pointer.y - startPY),
    );
    window.clampToViewport();
  });
}
