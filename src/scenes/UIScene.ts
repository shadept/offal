import { Scene } from 'phaser';
import { GameLogPanel } from '../ui/canvas/GameLogPanel';
import { InventoryPanel } from '../ui/canvas/InventoryPanel';
import { FloorItemsPanel } from '../ui/canvas/FloorItemsPanel';
import { PlayerStatusPanel } from '../ui/canvas/PlayerStatusPanel';
import { TopLeftHud } from '../ui/canvas/TopLeftHud';
import { TopRightHud } from '../ui/canvas/TopRightHud';
import { VisorWarpFilter } from '../ui/canvas/VisorWarpFilter';
import { createVisorWarpFilterNode } from '../ui/canvas/VisorWarpFilterNode';
import { VisorStyleFilter } from '../ui/canvas/VisorStyleFilter';
import { createVisorStyleFilterNode } from '../ui/canvas/VisorStyleFilterNode';
import { inventoryStore } from '../ui/inventoryStore';
import { bodyStore } from '../ui/bodyStore';
import { getUIInitPayload, type UIInitPayload, uiEventBus } from '../ui/uiEventBus';
import { lootStore } from '../ui/lootStore';
import { getWarpSafeInsets, installPhaserInputWarp, UI_VISOR_WARP_CONFIG } from '../ui/visorWarp';

export class UIScene extends Scene {
  private uiScale = 1;
  private currentTurn = 0;
  private topLeftHud!: TopLeftHud;
  private topRightHud!: TopRightHud;
  private statusPanel!: PlayerStatusPanel;
  private gameLogPanel!: GameLogPanel;
  private floorItemsPanel!: FloorItemsPanel;
  private inventory?: InventoryPanel;
  private corpseInventory?: InventoryPanel;
  private playerEid: number | null = null;
  private world: any = null;
  private inventorySyncHandler?: () => void;
  private corpseInventorySyncHandler?: () => void;
  private corpseInventoryTargetEid = -1;

  private visorFilter!: VisorWarpFilter;
  private visorStyleFilter!: VisorStyleFilter;

  constructor() {
    super({ key: 'UIScene' });
  }

  init(data?: { playerEid?: number, world?: any }): void {
    if (data?.playerEid != null) this.playerEid = data.playerEid;
    if (data?.world != null) this.world = data.world;
  }

  create(): void {
    this.installVisorWarpNode();
    installPhaserInputWarp(this.input.manager, this.game.canvas, UI_VISOR_WARP_CONFIG);

    // Apply VisorWarp filter to UI camera
    try {
      this.visorFilter = new VisorWarpFilter(this.cameras.main, UI_VISOR_WARP_CONFIG);
      (this.cameras.main.filters as any).external.add(this.visorFilter);
      this.visorStyleFilter = new VisorStyleFilter(this.cameras.main, UI_VISOR_WARP_CONFIG);
      (this.cameras.main.filters as any).external.add(this.visorStyleFilter);
    } catch (error) {
      console.warn('[ui] Failed to attach visor warp filter', error);
    }

    this.topLeftHud = new TopLeftHud(this);
    this.topRightHud = new TopRightHud(this, () => uiEventBus.emit('toggle-keys'));
    this.statusPanel = new PlayerStatusPanel(this);
    this.gameLogPanel = new GameLogPanel(this);

    // ── Floor Items Panel ──
    this.floorItemsPanel = new FloorItemsPanel(this);

    const initPayload = getUIInitPayload();
    if (initPayload) this.ensureInventory(initPayload);

    const handleResize = () => {
      this.layoutHud();
    };
    this.scale.on('resize', handleResize);
    this.events.once('shutdown', () => this.scale.off('resize', handleResize));
    this.layoutHud();

    // ── Listen for events ──
    const handleUIInit = (payload: UIInitPayload) => this.ensureInventory(payload);
    const handleUpdateHUD = (data: any) => {
      this.currentTurn = data.turn || 0;
      this.topLeftHud.refresh({ shipType: data.shipType, location: data.location, turn: data.turn });
      this.topRightHud.refresh(data.fps || 0);
      this.statusPanel.refresh({
        hp: data.hp,
        maxHp: data.maxHp,
        mobility: data.mobility,
        manipulation: data.manipulation,
        consciousness: data.consciousness,
        circulation: data.circulation,
      });

      this.floorItemsPanel.refresh(
        data.floorItems || [],
        data.floorSelectedIndex ?? -1,
        data.interactHoldProgress ?? 0,
      );

      this.refreshLog();
    };

    uiEventBus.on('ui-init', handleUIInit);
    uiEventBus.on('update-hud', handleUpdateHUD);
    this.events.once('shutdown', () => {
      uiEventBus.off('ui-init', handleUIInit);
      uiEventBus.off('update-hud', handleUpdateHUD);
      if (this.inventorySyncHandler) inventoryStore.removeListener(this.inventorySyncHandler);
      if (this.corpseInventorySyncHandler) lootStore.removeListener(this.corpseInventorySyncHandler);
      this.corpseInventory?.destroy();
    });

    import('../ui/gameLog').then(({ gameLog }) => {
      gameLog.onChange(() => this.refreshLog());
      this.refreshLog();
    });
  }

  private installVisorWarpNode(): void {
    try {
      const renderer = this.game.renderer;
      if (!renderer || !('renderNodes' in renderer)) return;
      const webglRenderer = renderer as any;
      if (!webglRenderer.renderNodes.getNode('FilterVisorWarp')) {
        const visorNode = createVisorWarpFilterNode(webglRenderer.renderNodes);
        webglRenderer.renderNodes.addNode('FilterVisorWarp', visorNode);
      }
      if (!webglRenderer.renderNodes.getNode('FilterVisorStyle')) {
        const visorStyleNode = createVisorStyleFilterNode(webglRenderer.renderNodes);
        webglRenderer.renderNodes.addNode('FilterVisorStyle', visorStyleNode);
      }
    } catch (error) {
      console.warn('[ui] Failed to install visor warp node', error);
    }
  }

  private ensureInventory(payload: UIInitPayload): void {
    this.playerEid = payload.playerEid;
    this.world = payload.world;

    if (!this.inventory) {
      this.inventory = new InventoryPanel(this, {
        playerEid: payload.playerEid,
        world: payload.world,
        onDrop: (itemEid) => uiEventBus.emit('drop-item', { itemEid }),
        onPickUp: (itemEid) => uiEventBus.emit('pick-up-item', { itemEid }),
        onCraft: (match) => uiEventBus.emit('craft-items', { match }),
        onCrudeCraft: (itemEids) => uiEventBus.emit('crude-craft-items', { itemEids }),
        onAutoAttach: (partEid) => {
          window.dispatchEvent(new CustomEvent('body-auto-attach', { detail: { partEid } }));
        },
      });

      this.inventorySyncHandler = () => this.syncInventoryVisibility();
      inventoryStore.onChange(this.inventorySyncHandler);

      this.corpseInventorySyncHandler = () => this.syncCorpseInventoryVisibility();
      lootStore.onChange(this.corpseInventorySyncHandler);
    }

    this.syncInventoryVisibility();
    this.syncCorpseInventoryVisibility();
    this.layoutHud();
  }

  private syncInventoryVisibility(): void {
    if (!this.inventory) return;

    const open = inventoryStore.open;
    this.inventory.setVisible(open);
    if (!open) return;

    this.inventory.refresh();
    this.children.bringToTop(this.inventory);
    this.inventory.bringContentToTop();
  }

  private syncCorpseInventoryVisibility(): void {
    if (this.playerEid == null) return;

    if (!lootStore.open || lootStore.targetEid < 0) {
      this.corpseInventory?.destroy();
      this.corpseInventory = undefined;
      this.corpseInventoryTargetEid = -1;
      return;
    }

    if (!this.corpseInventory || this.corpseInventoryTargetEid !== lootStore.targetEid) {
      this.corpseInventory?.destroy();
      this.corpseInventoryTargetEid = lootStore.targetEid;

      const bodyInfo = bodyStore.getBodyInfo(lootStore.targetEid);
      const title = bodyInfo ? `${bodyInfo.speciesName} (Dead)` : 'Corpse';

      this.corpseInventory = new InventoryPanel(this, {
        mode: 'corpse',
        title,
        x: 820,
        y: 100,
        playerEid: this.playerEid,
        targetEid: lootStore.targetEid,
        world: this.world,
        onClose: () => lootStore.close(),
        onTakeItem: (ownerEid, itemEid) => uiEventBus.emit('take-corpse-item', { ownerEid, itemEid }),
        onTakePart: (ownerEid, partEid) => uiEventBus.emit('take-corpse-part', { ownerEid, partEid }),
      });
    }

    this.corpseInventory.setVisible(true);
    this.corpseInventory.refresh();
    this.children.bringToTop(this.corpseInventory);
    this.corpseInventory.bringContentToTop();
    this.layoutHud();
  }


  private getUiScale(): number {
    const rect = this.game.canvas.getBoundingClientRect();
    const displayScale = rect.width > 0 ? rect.width / this.scale.width : 1;
    return displayScale > 0 ? 1 / displayScale : 1;
  }

  private layoutHud(): void {
    const safeInsets = getWarpSafeInsets(this.scale.width, this.scale.height, UI_VISOR_WARP_CONFIG);
    const anchorScale = this.getUiScale() * UI_VISOR_WARP_CONFIG.contentScale;
    this.uiScale = anchorScale * UI_VISOR_WARP_CONFIG.layoutScale;
    const REM = 16 * anchorScale;
    const topInsetX = 2.2 * REM;
    const topInsetY = 1.8 * REM;
    const bottomInsetX = 2.0 * REM;
    const bottomInsetY = 1.45 * REM;

    this.topLeftHud?.setUiScale(this.uiScale);
    this.topRightHud?.setUiScale(this.uiScale);
    this.statusPanel?.setUiScale(this.uiScale);
    this.gameLogPanel?.setUiScale(this.uiScale);
    this.floorItemsPanel?.setUiScale(this.uiScale, anchorScale);
    this.floorItemsPanel?.setViewportPadding(safeInsets);
    this.inventory?.setUiScale(this.uiScale, anchorScale);
    this.inventory?.setViewportPadding(safeInsets);
    this.corpseInventory?.setUiScale(this.uiScale, anchorScale);
    this.corpseInventory?.setViewportPadding(safeInsets);

    this.topLeftHud?.setPosition(safeInsets.left + topInsetX, safeInsets.top + topInsetY);
    this.topRightHud?.setPosition(this.scale.width - safeInsets.right - topInsetX, safeInsets.top + topInsetY);
    this.statusPanel?.setPosition(safeInsets.left + bottomInsetX, this.scale.height - safeInsets.bottom - bottomInsetY);
    this.gameLogPanel?.setPosition(this.scale.width - safeInsets.right - bottomInsetX, this.scale.height - safeInsets.bottom - bottomInsetY);
    this.floorItemsPanel?.setPinnedAbove(
      safeInsets.left + bottomInsetX,
      this.scale.height - safeInsets.bottom - bottomInsetY - this.statusPanel.root.displayHeight,
    );
    this.inventory?.clampToViewport();
    this.corpseInventory?.clampToViewport();
  }

  private refreshLog(): void {
    const log = (this.game as any)._gameLog;
    if (!log) {
      import('../ui/gameLog').then(({ gameLog }) => { (this.game as any)._gameLog = gameLog; this.refreshLog(); });
      return;
    }

    this.gameLogPanel.refresh(log.getAll(), this.currentTurn);
  }

  update(): void {
    if (this.visorFilter) {
      this.visorFilter.update(this.time.now);
    }
    if (this.visorStyleFilter) {
      this.visorStyleFilter.update(this.time.now);
    }
    const pointer = this.input.activePointer;
    if (pointer.active) {
      (pointer as any).worldX = pointer.x;
      (pointer as any).worldY = pointer.y;
    }
  }
}
