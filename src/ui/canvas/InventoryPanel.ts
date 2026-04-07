import { Scene } from 'phaser';
import { Position } from '../../ecs/components';
import { findMatchingRecipes, type RecipeMatch } from '../../ecs/crafting';
import { partSilhouetteKey } from '../../scenes/BootScene';
import {
  inventoryStore,
  type FloorItemInfo,
  type InventoryItemInfo,
} from '../inventoryStore';
import { lootStore, type LootItemInfo } from '../lootStore';
import { BaseWindow, addDragBehavior } from './Window';

const UI_TEXT_RESOLUTION = 2;
const INVENTORY_LAYOUT_SCALE = 1.5;

function scaled(value: number): number {
  return Math.round(value * INVENTORY_LAYOUT_SCALE);
}

function px(value: number): string {
  return `${value * INVENTORY_LAYOUT_SCALE}px`;
}

type InventoryPanelMode = 'player' | 'corpse';

export interface InventoryConfig {
  x?: number;
  y?: number;
  height?: number;
  playerEid: number;
  targetEid?: number;
  title?: string;
  mode?: InventoryPanelMode;
  world: any;
  onClose?: () => void;
  onDrop?: (itemEid: number) => void;
  onPickUp?: (itemEid: number) => void;
  onCraft?: (match: RecipeMatch) => void;
  onCrudeCraft?: (itemEids: number[]) => void;
  onAutoAttach?: (partEid: number) => void;
  onTakeItem?: (ownerEid: number, itemEid: number) => void;
  onTakePart?: (ownerEid: number, partEid: number) => void;
}

export class InventoryPanel extends BaseWindow {
  private readonly mode: InventoryPanelMode;
  private readonly playerEid: number;
  private readonly targetEid: number;
  private readonly closePanel?: () => void;
  private readonly onDrop?: (itemEid: number) => void;
  private readonly onPickUp?: (itemEid: number) => void;
  private readonly onCraft?: (match: RecipeMatch) => void;
  private readonly onCrudeCraft?: (itemEids: number[]) => void;
  private readonly onAutoAttach?: (partEid: number) => void;
  private readonly onTakeItem?: (ownerEid: number, itemEid: number) => void;
  private readonly onTakePart?: (ownerEid: number, partEid: number) => void;
  private lastClickedItemEid = -1;
  private lastClickedAt = 0;

  constructor(scene: Scene, config: InventoryConfig) {
    const windowHeight = config.height ?? Math.floor(Math.min(scaled(300), scene.scale.height * 0.6));

    super(scene, {
      x: config.x ?? 440,
      y: config.y ?? 100,
      width: scaled(352),
      height: windowHeight,
      title: config.title ?? 'Inventory',
      onClose: config.onClose ?? (() => inventoryStore.close()),
      destroyOnClose: false,
    });

    this.mode = config.mode ?? 'player';
    this.playerEid = config.playerEid;
    this.targetEid = config.targetEid ?? config.playerEid;
    this.closePanel = config.onClose;
    this.onDrop = config.onDrop;
    this.onPickUp = config.onPickUp;
    this.onCraft = config.onCraft;
    this.onCrudeCraft = config.onCrudeCraft;
    this.onAutoAttach = config.onAutoAttach;
    this.onTakeItem = config.onTakeItem;
    this.onTakePart = config.onTakePart;

    addDragBehavior(this, scene);
    this.refresh();
  }

  refresh(): void {
    const body = this.getContentSizer();
    body.removeAll(true);

    if (this.mode === 'corpse') {
      this.refreshCorpse(body);
      body.layout();
      this.clampToViewport();
      return;
    }

    const craftMode = inventoryStore.craftMode;
    const selectedItems = inventoryStore.getSelectedItems();
    const selectedCount = selectedItems.length;
    const craftPanelVisible = craftMode && selectedCount >= 2;
    const recipeMatches = craftMode && selectedCount >= 2 ? findMatchingRecipes(selectedItems) : [];
    const items = inventoryStore.getInventoryItems(this.playerEid);
    const capacity = inventoryStore.getCapacityInfo(this.playerEid);
    const scrollHeight = Math.max(scaled(180), this.windowHeight - (craftPanelVisible ? scaled(204) : scaled(124)));
    const floorItems = inventoryStore.getFloorItems(
      Position.x[this.playerEid],
      Position.y[this.playerEid],
    );

    body.add(this.createCapBar(capacity), { proportion: 0, expand: true });
    body.add(this.createToolbar(craftMode), { proportion: 0, expand: true });

    const scrollablePanel = (this.scene as any).rexUI.add.scrollablePanel({
      width: scaled(350),
      height: scrollHeight,
      scrollMode: 0,
      background: (this.scene as any).rexUI.add.roundRectangle(0, 0, 2, 2, 0, 0x0a0a12, 0.12)
        .setStrokeStyle(0, 0, 0),
      panel: {
        child: (this.scene as any).rexUI.add.sizer({ orientation: 'y', space: { item: scaled(6) } }),
        mask: { padding: 1 },
      },
      slider: {
        track: (this.scene as any).rexUI.add.roundRectangle(0, 0, 8, 8, 4, 0x131925, 1),
        thumb: (this.scene as any).rexUI.add.roundRectangle(0, 0, 8, 8, 4, 0x4ec9b0, 1),
      },
      mouseWheelScroller: { focus: false, speed: 0.1 },
      space: { left: scaled(8), right: scaled(8), top: scaled(8), bottom: scaled(8), panel: scaled(6) },
    });

    const list = scrollablePanel.getElement('panel');
    list.add(this.createSectionLabel('Carried'));

    if (items.length === 0) {
      list.add(this.createEmptyLabel('Empty'));
    } else {
      for (const item of items) {
        list.add(this.createInventoryCard(item, craftMode), { expand: true });
      }
    }

    if (floorItems.length > 0) {
      list.add(this.createSectionLabel('On Floor'));
      for (const item of floorItems) {
        list.add(this.createFloorCard(item), { expand: true });
      }
    }

    body.add(scrollablePanel, { proportion: 1, expand: true, padding: { top: scaled(6) } });

    if (craftPanelVisible) {
      body.add(this.createCraftPanel(selectedCount, recipeMatches), {
        proportion: 0,
        expand: true,
      });
    }

    scrollablePanel.layout();
    body.layout();
    this.clampToViewport();
  }

  private refreshCorpse(body: any): void {
    const corpseBodyParts = this.targetEid >= 0 ? lootStore.getBodyParts(this.targetEid) : [];
    const corpseItems = this.targetEid >= 0 ? lootStore.getInventoryItems(this.targetEid) : [];
    const capacity = inventoryStore.getCapacityInfo(this.playerEid);
    const scrollHeight = Math.max(scaled(220), this.windowHeight - scaled(56));

    body.add(this.createCapBar(capacity), { proportion: 0, expand: true });

    const scrollablePanel = (this.scene as any).rexUI.add.scrollablePanel({
      width: scaled(350),
      height: scrollHeight,
      scrollMode: 0,
      background: (this.scene as any).rexUI.add.roundRectangle(0, 0, 2, 2, 0, 0x0a0a12, 0.12)
        .setStrokeStyle(0, 0, 0),
      panel: {
        child: (this.scene as any).rexUI.add.sizer({ orientation: 'y', space: { item: scaled(6) } }),
        mask: { padding: 1 },
      },
      slider: {
        track: (this.scene as any).rexUI.add.roundRectangle(0, 0, 8, 8, 4, 0x131925, 1),
        thumb: (this.scene as any).rexUI.add.roundRectangle(0, 0, 8, 8, 4, 0x4ec9b0, 1),
      },
      mouseWheelScroller: { focus: false, speed: 0.1 },
      space: { left: scaled(8), right: scaled(8), top: scaled(8), bottom: scaled(8), panel: scaled(6) },
    });

    const list = scrollablePanel.getElement('panel');

    if (corpseBodyParts.length > 0) {
      list.add(this.createSectionLabel('Body Parts'));
      for (const item of corpseBodyParts) {
        list.add(this.createLootCard(item, 'take', () => this.onTakePart?.(this.targetEid, item.eid)), { expand: true });
      }
    }

    if (corpseItems.length > 0) {
      list.add(this.createSectionLabel('Carried'));
      for (const item of corpseItems) {
        list.add(this.createLootCard(item, 'take', () => this.onTakeItem?.(this.targetEid, item.eid)), { expand: true });
      }
    }

    if (corpseBodyParts.length === 0 && corpseItems.length === 0) {
      list.add(this.createEmptyLabel('Empty'));
    }

    body.add(scrollablePanel, { proportion: 1, expand: true, padding: { top: scaled(6) } });
    scrollablePanel.layout();
  }

  private createCapBar(capacity: { used: number; max: number }): any {
    const bar = (this.scene as any).rexUI.add.sizer({
      orientation: 'x',
      space: { left: scaled(10), right: scaled(10), top: scaled(4), bottom: scaled(4), item: scaled(8) },
    });
    const spacer = this.scene.add.text(0, 0, ' ', { fontSize: '1px' }).setAlpha(0);
    const capacityText = this.scene.add.text(0, 0, `${capacity.used}/${capacity.max}`, {
      fontFamily: 'monospace',
      fontSize: px(11.2),
      color: '#668899',
      resolution: UI_TEXT_RESOLUTION,
    });

    bar.add(spacer, { proportion: 1, expand: true });
    bar.add(capacityText, { proportion: 0, align: 'center' });
    bar.addBackground((this.scene as any).rexUI.add.roundRectangle(0, 0, 2, 2, 0, 0x0a0a12, 0.01)
      .setStrokeStyle(1, 0x222222, 1));

    return bar;
  }

  private createToolbar(craftMode: boolean): any {
    const bar = (this.scene as any).rexUI.add.sizer({
      orientation: 'x',
      space: { left: scaled(10), right: scaled(10), top: scaled(5), bottom: scaled(5), item: scaled(8) },
    });

    bar.add(this.createActionButton(
      craftMode ? 'Cancel Craft' : 'Craft',
      craftMode ? 0xe94560 : 0x334455,
      () => inventoryStore.toggleCraftMode(),
    ));
    bar.addBackground((this.scene as any).rexUI.add.roundRectangle(0, 0, 2, 2, 0, 0x0a0a12, 0.01)
      .setStrokeStyle(1, 0x222222, 1));

    return bar;
  }

  private createInventoryCard(item: InventoryItemInfo, craftMode: boolean): any {
    const card = (this.scene as any).rexUI.add.sizer({
      orientation: 'y',
      space: { left: scaled(6), right: scaled(6), top: scaled(4), bottom: scaled(4), item: scaled(2) },
    });

    const background = (this.scene as any).rexUI.add.roundRectangle(
      0,
      0,
      2,
      2,
      0,
      this.getCardFill(item.selected, item.isPart, false),
      0.9,
    ).setStrokeStyle(1, this.getCardStroke(item.selected, item.isPart, false), this.getCardStrokeAlpha(item.selected, item.isPart, false));

    card.addBackground(background);

    const nameRow = (this.scene as any).rexUI.add.sizer({ orientation: 'x', space: { item: scaled(4) } });
    if (item.isPart && item.partRole) {
      const icon = this.scene.add.image(0, 0, partSilhouetteKey(item.partRole));
      icon.setDisplaySize(scaled(14), scaled(14));
      icon.setTint(0x4ec9b0);
      icon.setAlpha(0.7);
      nameRow.add(icon, { proportion: 0, align: 'center' });
    }

    nameRow.add(this.scene.add.text(0, 0, item.name, {
      fontFamily: 'monospace',
      fontSize: px(12),
      color: '#aabbbb',
      wordWrap: { width: scaled(212) },
      resolution: UI_TEXT_RESOLUTION,
    }), { proportion: 1, align: 'center' });

    if (item.stackCount > 1) {
      nameRow.add(this.scene.add.text(0, 0, `x${item.stackCount}`, {
        fontFamily: 'monospace',
        fontSize: px(10),
        color: '#668899',
        resolution: UI_TEXT_RESOLUTION,
      }), { proportion: 0, align: 'center' });
    }

    const detailRow = (this.scene as any).rexUI.add.sizer({ orientation: 'x', space: { item: scaled(6) } });
    detailRow.add(this.scene.add.text(0, 0, this.getInventoryDetail(item), {
      fontFamily: 'monospace',
      fontSize: px(10),
      color: '#556666',
      wordWrap: { width: scaled(202) },
      resolution: UI_TEXT_RESOLUTION,
    }), { proportion: 1, align: 'center' });

    if (!craftMode) {
      detailRow.add(this.createActionButton('drop', 0xe94560, () => {
        this.onDrop?.(item.eid);
      }), { proportion: 0, align: 'center' });
    }

    card.add(nameRow, { proportion: 0, expand: true });
    card.add(detailRow, { proportion: 0, expand: true });

    if (craftMode || item.isPart) {
      card.setInteractive({ useHandCursor: true })
        .on('pointerover', () => background.setStrokeStyle(1, this.getCardHoverStroke(item.selected, item.isPart, false), 0.9))
        .on('pointerout', () => background.setStrokeStyle(1, this.getCardStroke(item.selected, item.isPart, false), this.getCardStrokeAlpha(item.selected, item.isPart, false)))
        .on('pointerdown', () => this.handleInventoryCardPress(item, craftMode));
    }

    return card;
  }

  private createFloorCard(item: FloorItemInfo): any {
    const card = (this.scene as any).rexUI.add.sizer({
      orientation: 'y',
      space: { left: scaled(6), right: scaled(6), top: scaled(4), bottom: scaled(4), item: scaled(2) },
    });

    const background = (this.scene as any).rexUI.add.roundRectangle(0, 0, 2, 2, 0, this.getCardFill(false, item.isPart, true), 0.9)
      .setStrokeStyle(1, this.getCardStroke(false, item.isPart, true), this.getCardStrokeAlpha(false, item.isPart, true));
    card.addBackground(background);

    const nameRow = (this.scene as any).rexUI.add.sizer({ orientation: 'x', space: { item: scaled(4) } });
    if (item.isPart && item.partRole) {
      const icon = this.scene.add.image(0, 0, partSilhouetteKey(item.partRole));
      icon.setDisplaySize(scaled(14), scaled(14));
      icon.setTint(0x4ec9b0);
      icon.setAlpha(0.7);
      nameRow.add(icon, { proportion: 0, align: 'center' });
    }

    nameRow.add(this.scene.add.text(0, 0, item.name, {
      fontFamily: 'monospace',
      fontSize: px(12),
      color: '#aabbbb',
      wordWrap: { width: scaled(212) },
      resolution: UI_TEXT_RESOLUTION,
    }), { proportion: 1, align: 'center' });

    const detailRow = (this.scene as any).rexUI.add.sizer({ orientation: 'x', space: { item: scaled(6) } });
    detailRow.add(this.scene.add.text(0, 0, this.getFloorDetail(item), {
      fontFamily: 'monospace',
      fontSize: px(10),
      color: '#556666',
      wordWrap: { width: scaled(202) },
      resolution: UI_TEXT_RESOLUTION,
    }), { proportion: 1, align: 'center' });
    detailRow.add(this.createActionButton('pick up', 0x4ec9b0, () => {
      this.onPickUp?.(item.eid);
    }), { proportion: 0, align: 'center' });

    card.add(nameRow, { proportion: 0, expand: true });
    card.add(detailRow, { proportion: 0, expand: true });
    card.setInteractive({ useHandCursor: true })
      .on('pointerover', () => background.setStrokeStyle(1, 0x4ec9b0, 0.8))
      .on('pointerout', () => background.setStrokeStyle(1, this.getCardStroke(false, item.isPart, true), this.getCardStrokeAlpha(false, item.isPart, true)));

    return card;
  }

  private createLootCard(item: LootItemInfo, actionLabel: string, onAction: () => void): any {
    const card = (this.scene as any).rexUI.add.sizer({
      orientation: 'y',
      space: { left: scaled(6), right: scaled(6), top: scaled(4), bottom: scaled(4), item: scaled(2) },
    });

    const background = (this.scene as any).rexUI.add.roundRectangle(0, 0, 2, 2, 0, this.getCardFill(false, item.isPart, true), 0.9)
      .setStrokeStyle(1, this.getCardStroke(false, item.isPart, true), this.getCardStrokeAlpha(false, item.isPart, true));
    card.addBackground(background);

    const nameRow = (this.scene as any).rexUI.add.sizer({ orientation: 'x', space: { item: scaled(4) } });
    if (item.isPart && item.partRole) {
      const icon = this.scene.add.image(0, 0, partSilhouetteKey(item.partRole));
      icon.setDisplaySize(scaled(14), scaled(14));
      icon.setTint(0x4ec9b0);
      icon.setAlpha(0.7);
      nameRow.add(icon, { proportion: 0, align: 'center' });
    }

    nameRow.add(this.scene.add.text(0, 0, item.name, {
      fontFamily: 'monospace',
      fontSize: px(12),
      color: '#aabbbb',
      wordWrap: { width: scaled(212) },
      resolution: UI_TEXT_RESOLUTION,
    }), { proportion: 1, align: 'center' });

    if (item.stackCount > 1) {
      nameRow.add(this.scene.add.text(0, 0, `x${item.stackCount}`, {
        fontFamily: 'monospace',
        fontSize: px(10),
        color: '#668899',
        resolution: UI_TEXT_RESOLUTION,
      }), { proportion: 0, align: 'center' });
    }

    const detailRow = (this.scene as any).rexUI.add.sizer({ orientation: 'x', space: { item: scaled(6) } });
    detailRow.add(this.scene.add.text(0, 0, item.isPart ? `${item.material}  ${item.partRole ?? 'part'}` : `${item.material}  ${item.size}`, {
      fontFamily: 'monospace',
      fontSize: px(10),
      color: '#556666',
      wordWrap: { width: scaled(202) },
      resolution: UI_TEXT_RESOLUTION,
    }), { proportion: 1, align: 'center' });
    detailRow.add(this.createActionButton(actionLabel, 0x4ec9b0, onAction), { proportion: 0, align: 'center' });

    card.add(nameRow, { proportion: 0, expand: true });
    card.add(detailRow, { proportion: 0, expand: true });
    card.setInteractive({ useHandCursor: true })
      .on('pointerover', () => background.setStrokeStyle(1, 0x4ec9b0, 0.8))
      .on('pointerout', () => background.setStrokeStyle(1, this.getCardStroke(false, item.isPart, true), this.getCardStrokeAlpha(false, item.isPart, true)));

    return card;
  }

  private createCraftPanel(selectedCount: number, matches: RecipeMatch[]): any {
    const panel = (this.scene as any).rexUI.add.sizer({
      orientation: 'y',
      space: { left: scaled(8), right: scaled(8), top: scaled(8), bottom: scaled(8), item: scaled(6) },
    });
    panel.addBackground((this.scene as any).rexUI.add.roundRectangle(0, 0, 2, 2, 0, 0x0a0a12, 0.01)
      .setStrokeStyle(1, 0x334455, 1));

    panel.add(this.scene.add.text(0, 0, `${selectedCount} items selected`, {
      fontFamily: 'monospace',
      fontSize: px(10),
      color: '#668899',
      resolution: UI_TEXT_RESOLUTION,
    }), { proportion: 0, expand: true });

    for (const match of matches) {
      panel.add(this.createRecipeButton(
        match.recipe.name ?? match.recipe.id,
        match.recipe.description,
        0x4ec9b0,
        () => this.onCraft?.(match),
      ), { proportion: 0, expand: true });
    }

    panel.add(this.createRecipeButton(
      'Crude Composite',
      'Merge items into an improvised result',
      0x887755,
      () => this.onCrudeCraft?.(inventoryStore.getSelectedItems()),
    ), { proportion: 0, expand: true });

    return panel;
  }

  private createSectionLabel(text: string): any {
    return this.scene.add.text(0, 0, text.toUpperCase(), {
      fontFamily: 'monospace',
      fontSize: px(10),
      color: '#556666',
      fontStyle: 'bold',
      letterSpacing: 1,
      resolution: UI_TEXT_RESOLUTION,
    });
  }

  private createEmptyLabel(text: string): any {
    return this.scene.add.text(0, 0, text, {
      fontFamily: 'monospace',
      fontSize: px(11),
      color: '#334455',
      fontStyle: 'italic',
      resolution: UI_TEXT_RESOLUTION,
    });
  }

  private createActionButton(label: string, borderColor: number, onClick: () => void): any {
    const button = (this.scene as any).rexUI.add.label({
      background: (this.scene as any).rexUI.add.roundRectangle(0, 0, 2, 2, 3, 0x121622, 1)
        .setStrokeStyle(1, borderColor, 0.75),
      text: this.scene.add.text(0, 0, label, {
        fontFamily: 'monospace',
        fontSize: px(10),
        color: '#889999',
        resolution: UI_TEXT_RESOLUTION,
      }),
      space: { left: scaled(6), right: scaled(6), top: scaled(2), bottom: scaled(2) },
    });

    const background = button.getElement('background') as any;
    button.setInteractive({ useHandCursor: true })
      .on('pointerover', () => background.setStrokeStyle(1, borderColor, 1))
      .on('pointerout', () => background.setStrokeStyle(1, borderColor, 0.75))
      .on('pointerdown', onClick);

    return button;
  }

  private createRecipeButton(
    label: string,
    description: string | undefined,
    borderColor: number,
    onClick: () => void,
  ): any {
    const button = (this.scene as any).rexUI.add.label({
      width: scaled(318),
      align: 'left',
      background: (this.scene as any).rexUI.add.roundRectangle(0, 0, 2, 2, 4, 0x121622, 1)
        .setStrokeStyle(1, borderColor, 0.75),
      text: this.scene.add.text(0, 0, description ? `${label}\n${description}` : label, {
        fontFamily: 'monospace',
        fontSize: px(11),
        color: '#aabbbb',
        wordWrap: { width: scaled(286) },
        resolution: UI_TEXT_RESOLUTION,
      }),
      space: { left: scaled(8), right: scaled(8), top: scaled(6), bottom: scaled(6) },
    });

    const background = button.getElement('background') as any;
    button.setInteractive({ useHandCursor: true })
      .on('pointerover', () => background.setStrokeStyle(1, borderColor, 1))
      .on('pointerout', () => background.setStrokeStyle(1, borderColor, 0.75))
      .on('pointerdown', onClick);

    return button;
  }

  private handleInventoryCardPress(item: InventoryItemInfo, craftMode: boolean): void {
    if (craftMode) {
      inventoryStore.toggleItemSelection(item.eid);
      return;
    }

    if (!item.isPart) return;

    const now = this.scene.time.now;
    if (this.lastClickedItemEid === item.eid && (now - this.lastClickedAt) <= 250) {
      this.lastClickedItemEid = -1;
      this.lastClickedAt = 0;
      this.onAutoAttach?.(item.eid);
      return;
    }

    this.lastClickedItemEid = item.eid;
    this.lastClickedAt = now;
  }

  private getInventoryDetail(item: InventoryItemInfo): string {
    if (item.isPart) {
      return `${item.material}  ${item.partRole ?? 'part'}`;
    }
    return `${item.material}  ${item.size}  ${item.volume}vol`;
  }

  private getFloorDetail(item: FloorItemInfo): string {
    if (item.isPart) {
      return `${item.material}  ${item.partRole ?? 'part'}`;
    }
    return `${item.material}  ${item.size}`;
  }

  private getCardFill(selected: boolean, isPart: boolean, isFloor: boolean): number {
    if (selected) return 0x34131f;
    if (isFloor) return 0x17140e;
    if (isPart) return 0x0d1419;
    return 0x0f1016;
  }

  private getCardStroke(selected: boolean, isPart: boolean, isFloor: boolean): number {
    if (selected) return 0xe94560;
    if (isFloor) return 0x6b5f3c;
    if (isPart) return 0x4ec9b0;
    return 0x334455;
  }

  private getCardStrokeAlpha(selected: boolean, isPart: boolean, isFloor: boolean): number {
    if (selected) return 0.8;
    if (isFloor) return 0.22;
    if (isPart) return 0.18;
    return 0.12;
  }

  private getCardHoverStroke(selected: boolean, isPart: boolean, isFloor: boolean): number {
    if (selected) return 0xe94560;
    if (isFloor) return 0x4ec9b0;
    if (isPart) return 0x4ec9b0;
    return 0x667799;
  }
}
