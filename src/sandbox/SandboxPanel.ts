/**
 * SandboxPanel — DOM overlay sidebar for sandbox mode.
 *
 * Built entirely with createElement (no innerHTML). Sits on top of the
 * Phaser canvas at the right edge. Communicates with the game exclusively
 * through SandboxController.
 *
 * The entity inspector is component-driven: it queries the DebugOverlayRegistry
 * for each ECS component the selected entity has, showing a collapsible section
 * per component with optional debug overlay toggles.
 */
import type { SandboxController } from './SandboxController';
import type { SandboxTool, TileInspectData } from './types';

// ═══════════════════════════════════════════════════════════
// CSS
// ═══════════════════════════════════════════════════════════

const CSS = `
#sandbox-panel {
  position: fixed;
  top: 0;
  right: 0;
  width: 280px;
  height: 100vh;
  background: #111118;
  color: #889999;
  font-family: monospace;
  font-size: 12px;
  z-index: 1000;
  overflow-y: auto;
  transform: translateX(100%);
  transition: transform 0.2s ease;
  border-left: 1px solid #334;
  box-sizing: border-box;
  user-select: none;
}
#sandbox-panel.open {
  transform: translateX(0);
}
#sandbox-panel * {
  box-sizing: border-box;
}

.sb-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: #0a0a12;
  border-bottom: 1px solid #334;
}
.sb-header h3 {
  margin: 0;
  font-size: 13px;
  color: #ccdddd;
  letter-spacing: 2px;
}
.sb-close {
  background: none;
  border: none;
  color: #667;
  font-size: 16px;
  cursor: pointer;
  padding: 0 4px;
  font-family: monospace;
}
.sb-close:hover { color: #e94560; }

.sb-section {
  padding: 8px 12px;
  border-bottom: 1px solid #1a1a2e;
}
.sb-section-title {
  font-size: 10px;
  color: #556666;
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-bottom: 6px;
}

/* Tool buttons */
.sb-tools {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.sb-tool-btn {
  background: #1a1a2e;
  border: 1px solid #334;
  color: #889999;
  font-family: monospace;
  font-size: 11px;
  padding: 4px 8px;
  cursor: pointer;
  border-radius: 2px;
}
.sb-tool-btn:hover { background: #252540; border-color: #558; }
.sb-tool-btn.active { background: #2a2a4e; border-color: #e94560; color: #ccdddd; }
.sb-tool-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

/* Tool options area */
.sb-tool-options {
  min-height: 28px;
}

/* Paint type buttons */
.sb-paint-types {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.sb-paint-btn {
  background: #1a1a2e;
  border: 1px solid #334;
  color: #889999;
  font-family: monospace;
  font-size: 10px;
  padding: 3px 6px;
  cursor: pointer;
  border-radius: 2px;
}
.sb-paint-btn:hover { background: #252540; }
.sb-paint-btn.active { border-color: #e94560; color: #ccdddd; }

/* Inspector */
.sb-inspect {
  font-size: 11px;
  line-height: 1.6;
}
.sb-inspect-label {
  color: #556666;
}
.sb-inspect-value {
  color: #ccdddd;
}
.sb-no-selection {
  color: #445;
  font-style: italic;
}

/* Component inspector sections */
.sb-comp-header {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  padding: 3px 0;
}
.sb-comp-toggle {
  font-size: 9px;
  color: #556666;
  width: 10px;
}
.sb-comp-name {
  font-size: 11px;
  color: #aabbbb;
  font-weight: bold;
}
.sb-comp-body {
  padding-left: 16px;
  margin-bottom: 2px;
}
.sb-comp-body.collapsed {
  display: none;
}
.sb-debug-label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  color: #7799aa;
  cursor: pointer;
  margin-bottom: 2px;
  padding-left: 16px;
}
.sb-debug-label input {
  accent-color: #e94560;
}

/* Sim controls */
.sb-sim-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}
.sb-sim-btn {
  background: #1a1a2e;
  border: 1px solid #334;
  color: #889999;
  font-family: monospace;
  font-size: 11px;
  padding: 4px 10px;
  cursor: pointer;
  border-radius: 2px;
  width: 100%;
}
.sb-sim-btn:hover { background: #252540; }
.sb-sim-btn:disabled { opacity: 0.35; cursor: not-allowed; }

.sb-checkbox-label {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  font-size: 11px;
}
.sb-checkbox-label:has(input:disabled) {
  opacity: 0.35;
  cursor: not-allowed;
}

.sb-slider-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.sb-slider-row input[type="range"] {
  flex: 1;
  accent-color: #e94560;
}
.sb-slider-value {
  color: #ccdddd;
  min-width: 32px;
  text-align: right;
}

/* Delete button */
.sb-delete-btn {
  background: #3a1520;
  border: 1px solid #e94560;
  color: #e94560;
  font-family: monospace;
  font-size: 11px;
  padding: 3px 10px;
  cursor: pointer;
  border-radius: 2px;
  margin-top: 6px;
}
.sb-delete-btn:hover { background: #5a2030; }
.sb-delete-btn:disabled { opacity: 0.35; cursor: not-allowed; }

/* Phase label */
.sb-phase-label {
  font-size: 10px;
  color: #445;
  margin-left: 4px;
}
`;

// ═══════════════════════════════════════════════════════════
// PANEL
// ═══════════════════════════════════════════════════════════

export class SandboxPanel {
  private root: HTMLDivElement;
  private ctrl: SandboxController;

  // Dynamic content areas
  private toolOptionsEl!: HTMLDivElement;
  private tileInspectEl!: HTMLDivElement;
  private entityInspectEl!: HTMLDivElement;
  private speedValueEl!: HTMLSpanElement;
  private toolButtons: HTMLButtonElement[] = [];
  private paintButtons: HTMLButtonElement[] = [];

  // Collapse state for component sections (persists across updates)
  private collapsedComponents = new Set<string>();

  constructor(controller: SandboxController) {
    this.ctrl = controller;

    // Inject CSS
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    // Build DOM
    this.root = document.createElement('div');
    this.root.id = 'sandbox-panel';
    this.buildPanel();
    document.body.appendChild(this.root);

    // Block pointer events from reaching Phaser canvas
    for (const evt of ['pointerdown', 'pointerup', 'pointermove', 'mousedown', 'mouseup', 'click'] as const) {
      this.root.addEventListener(evt, (e) => e.stopPropagation());
    }

    // Subscribe to controller events
    this.ctrl.on((event) => {
      if (event === 'toggle') this.onToggle();
      if (event === 'selection_changed') this.updateInspector();
      if (event === 'tool_changed') this.onToolChanged();
      if (event === 'turn_advanced') this.updateInspector();
    });
  }

  // ═══════════════════════════════════════════════════════════
  // BUILD
  // ═══════════════════════════════════════════════════════════

  private buildPanel(): void {
    // Header
    const header = this.el('div', 'sb-header');
    const title = this.el('h3');
    title.textContent = 'SANDBOX';
    const closeBtn = this.el('button', 'sb-close');
    closeBtn.textContent = '\u00d7';
    closeBtn.addEventListener('click', () => this.ctrl.toggle());
    header.append(title, closeBtn);
    this.root.appendChild(header);

    // Tools section
    this.root.appendChild(this.buildToolsSection());

    // Tool options
    const optSection = this.el('div', 'sb-section');
    this.toolOptionsEl = this.el('div', 'sb-tool-options');
    optSection.appendChild(this.toolOptionsEl);
    this.root.appendChild(optSection);
    this.renderToolOptions();

    // Inspector
    this.root.appendChild(this.buildInspectorSection());

    // Simulation controls
    this.root.appendChild(this.buildSimSection());

    // Event triggers
    this.root.appendChild(this.buildEventsSection());
  }

  private buildToolsSection(): HTMLDivElement {
    const section = this.el('div', 'sb-section');
    const label = this.el('div', 'sb-section-title');
    label.textContent = 'Tools';
    section.appendChild(label);

    const tools = this.el('div', 'sb-tools');
    const toolDefs: { id: SandboxTool; label: string; disabled?: boolean; phase?: string }[] = [
      { id: 'inspect', label: 'Inspect' },
      { id: 'tile_paint', label: 'Paint Tile' },
      { id: 'entity_spawn', label: 'Spawn Entity' },
      { id: 'fluid_place', label: 'Place Fluid', disabled: true, phase: '3' },
      { id: 'gas_place', label: 'Place Gas', disabled: true, phase: '3' },
    ];

    for (const def of toolDefs) {
      const btn = this.el('button', 'sb-tool-btn');
      btn.textContent = def.label;
      if (def.phase) {
        const ph = this.el('span', 'sb-phase-label');
        ph.textContent = `(Phase ${def.phase})`;
        btn.appendChild(ph);
      }
      btn.disabled = !!def.disabled;
      if (def.id === this.ctrl.activeTool) btn.classList.add('active');
      btn.addEventListener('click', () => {
        if (!def.disabled) this.ctrl.setTool(def.id);
      });
      tools.appendChild(btn);
      this.toolButtons.push(btn);
    }

    section.appendChild(tools);
    return section;
  }

  private buildInspectorSection(): HTMLDivElement {
    const section = this.el('div', 'sb-section');
    const label = this.el('div', 'sb-section-title');
    label.textContent = 'Inspector';
    section.appendChild(label);

    this.tileInspectEl = this.el('div', 'sb-inspect');
    this.entityInspectEl = this.el('div', 'sb-inspect');

    const noSel = this.el('div', 'sb-no-selection');
    noSel.textContent = 'Click a tile to inspect';
    this.tileInspectEl.appendChild(noSel);

    section.append(this.tileInspectEl, this.entityInspectEl);
    return section;
  }

  private buildSimSection(): HTMLDivElement {
    const section = this.el('div', 'sb-section');
    const label = this.el('div', 'sb-section-title');
    label.textContent = 'Simulation';
    section.appendChild(label);

    // Advance Turn
    const advBtn = this.el('button', 'sb-sim-btn');
    advBtn.textContent = 'Advance Turn (N)';
    advBtn.addEventListener('click', () => this.ctrl.advanceTurn());
    section.appendChild(advBtn);

    // Auto-play
    const autoRow = this.el('div', 'sb-sim-row');
    const autoLabel = this.el('label', 'sb-checkbox-label');
    const autoCb = document.createElement('input');
    autoCb.type = 'checkbox';
    autoCb.checked = this.ctrl.autoPlay;
    autoCb.addEventListener('change', () => this.ctrl.setAutoPlay(autoCb.checked));
    autoLabel.append(autoCb, 'Auto-play');
    autoRow.appendChild(autoLabel);
    section.appendChild(autoRow);

    // Speed
    const speedRow = this.el('div', 'sb-slider-row');
    const speedLabel = document.createTextNode('Speed ');
    const speedSlider = document.createElement('input');
    speedSlider.type = 'range';
    speedSlider.min = '1';
    speedSlider.max = '10';
    speedSlider.value = String(this.ctrl.autoPlaySpeed);
    this.speedValueEl = this.el('span', 'sb-slider-value');
    this.speedValueEl.textContent = `${this.ctrl.autoPlaySpeed} tps`;
    speedSlider.addEventListener('input', () => {
      const v = parseInt(speedSlider.value, 10);
      this.ctrl.setAutoPlaySpeed(v);
      this.speedValueEl.textContent = `${v} tps`;
    });
    speedRow.append(speedLabel, speedSlider, this.speedValueEl);
    section.appendChild(speedRow);

    // Reveal All
    const revealRow = this.el('div', 'sb-sim-row');
    const revealLabel = this.el('label', 'sb-checkbox-label');
    const revealCb = document.createElement('input');
    revealCb.type = 'checkbox';
    revealCb.checked = this.ctrl.revealAll;
    revealCb.addEventListener('change', () => this.ctrl.setRevealAll(revealCb.checked));
    revealLabel.append(revealCb, 'Reveal All');
    revealRow.appendChild(revealLabel);
    section.appendChild(revealRow);

    // AI Only
    const aiRow = this.el('div', 'sb-sim-row');
    const aiLabel = this.el('label', 'sb-checkbox-label');
    const aiCb = document.createElement('input');
    aiCb.type = 'checkbox';
    aiCb.checked = this.ctrl.aiOnly;
    aiCb.addEventListener('change', () => {
      this.ctrl.aiOnly = aiCb.checked;
    });
    const aiText = document.createTextNode('AI Only');
    aiLabel.append(aiCb, aiText);
    aiRow.appendChild(aiLabel);
    section.appendChild(aiRow);

    return section;
  }

  private buildEventsSection(): HTMLDivElement {
    const section = this.el('div', 'sb-section');
    const label = this.el('div', 'sb-section-title');
    label.textContent = 'Event Triggers';
    section.appendChild(label);

    const events = ['Fire', 'Charge', 'Breach'];
    const row = this.el('div', 'sb-tools');
    for (const name of events) {
      const btn = this.el('button', 'sb-tool-btn');
      btn.disabled = true;
      const text = document.createTextNode(name + ' ');
      const ph = this.el('span', 'sb-phase-label');
      ph.textContent = '(Phase 3)';
      btn.append(text, ph);
      row.appendChild(btn);
    }
    section.appendChild(row);
    return section;
  }

  // ═══════════════════════════════════════════════════════════
  // TOOL OPTIONS
  // ═══════════════════════════════════════════════════════════

  private renderToolOptions(): void {
    this.toolOptionsEl.textContent = '';
    this.paintButtons = [];

    switch (this.ctrl.activeTool) {
      case 'inspect':
        break; // no options needed

      case 'tile_paint': {
        const types = this.el('div', 'sb-paint-types');
        const paintable = this.ctrl.getPaintableTiles();
        for (const t of paintable) {
          const btn = this.el('button', 'sb-paint-btn');
          btn.textContent = t.name;
          if (t.index === this.ctrl.paintTileIndex) btn.classList.add('active');
          btn.addEventListener('click', () => {
            this.ctrl.setPaintType(t.index);
            for (const b of this.paintButtons) b.classList.remove('active');
            btn.classList.add('active');
          });
          types.appendChild(btn);
          this.paintButtons.push(btn);
        }
        this.toolOptionsEl.appendChild(types);
        break;
      }

      case 'entity_spawn': {
        const speciesList = this.ctrl.getSpawnableSpecies();
        const container = this.el('div', 'sb-paint-types');
        for (const sp of speciesList) {
          const btn = this.el('button', 'sb-paint-btn');
          btn.textContent = sp.name;
          btn.title = sp.description;
          if (sp.id === this.ctrl.selectedSpeciesId) btn.classList.add('active');
          btn.addEventListener('click', () => {
            this.ctrl.setSelectedSpecies(sp.id);
            for (const child of container.querySelectorAll('.sb-paint-btn')) {
              child.classList.remove('active');
            }
            btn.classList.add('active');
          });
          container.appendChild(btn);
        }
        this.toolOptionsEl.appendChild(container);
        break;
      }

      case 'fluid_place':
      case 'gas_place': {
        const info = this.el('div');
        info.textContent = 'Coming in Phase 3.';
        info.style.color = '#445';
        info.style.fontStyle = 'italic';
        this.toolOptionsEl.appendChild(info);
        break;
      }
    }
  }

  // ═══════════════════════════════════════════════════════════
  // INSPECTOR UPDATE
  // ═══════════════════════════════════════════════════════════

  updateInspector(): void {
    this.tileInspectEl.textContent = '';
    this.entityInspectEl.textContent = '';

    if (!this.ctrl.selectedTile) {
      const noSel = this.el('div', 'sb-no-selection');
      noSel.textContent = 'Click a tile to inspect';
      this.tileInspectEl.appendChild(noSel);
      return;
    }

    // Tile info
    const tileInfo = this.ctrl.getTileInfo(this.ctrl.selectedTile.x, this.ctrl.selectedTile.y);
    if (tileInfo) {
      this.renderTileInfo(tileInfo);
    }

    // Entity info — component-driven
    if (this.ctrl.selectedEntity !== null) {
      const entInfo = this.ctrl.getEntityInfo(this.ctrl.selectedEntity);
      if (entInfo) {
        this.renderEntityInfo(entInfo.eid, entInfo.isPlayer);
      }
    }
  }

  private renderTileInfo(info: TileInspectData): void {
    const lines: [string, string][] = [
      ['Position', `(${info.x}, ${info.y})`],
      ['Tile', info.tileType],
      ['Material', info.materialName],
      ['Visibility', info.visibility],
      ['Light', String(info.light)],
      ['Fluids', 'N/A'],
      ['Gases', 'N/A'],
      ['Temperature', 'N/A'],
    ];

    const tileLabel = this.el('div', 'sb-section-title');
    tileLabel.textContent = 'Tile';
    tileLabel.style.marginTop = '0';
    this.tileInspectEl.appendChild(tileLabel);

    for (const [label, value] of lines) {
      const row = this.el('div');
      const lbl = this.el('span', 'sb-inspect-label');
      lbl.textContent = label + ': ';
      const val = this.el('span', 'sb-inspect-value');
      val.textContent = value;
      row.append(lbl, val);
      this.tileInspectEl.appendChild(row);
    }
  }

  private renderEntityInfo(eid: number, isPlayer: boolean): void {
    const entLabel = this.el('div', 'sb-section-title');
    entLabel.textContent = isPlayer ? `Entity (Player) EID ${eid}` : `Entity (NPC) EID ${eid}`;
    entLabel.style.marginTop = '8px';
    this.entityInspectEl.appendChild(entLabel);

    // Query the registry for all components this entity has
    const world = this.ctrl.getWorld();
    const map = this.ctrl.getMap();
    const inspectors = this.ctrl.debugRegistry.getFor(world, eid);

    for (const inspector of inspectors) {
      const name = inspector.name;
      const isCollapsed = this.collapsedComponents.has(name);

      // Section header (clickable to collapse)
      const header = this.el('div', 'sb-comp-header');
      const toggle = this.el('span', 'sb-comp-toggle');
      toggle.textContent = isCollapsed ? '\u25b8' : '\u25be';
      const nameEl = this.el('span', 'sb-comp-name');
      nameEl.textContent = name;
      header.append(toggle, nameEl);
      header.addEventListener('click', () => {
        if (this.collapsedComponents.has(name)) {
          this.collapsedComponents.delete(name);
        } else {
          this.collapsedComponents.add(name);
        }
        this.updateInspector();
      });
      this.entityInspectEl.appendChild(header);

      // Debug overlay checkbox (if this component has an overlay)
      if (inspector.hasOverlay) {
        const debugLabel = this.el('label', 'sb-debug-label');
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = this.ctrl.isOverlayEnabled(name);
        cb.addEventListener('change', () => {
          this.ctrl.toggleOverlay(name);
        });
        debugLabel.append(cb, 'show debug overlay');
        this.entityInspectEl.appendChild(debugLabel);
      }

      // Section body (collapsible)
      const body = this.el('div', 'sb-comp-body');
      if (isCollapsed) body.classList.add('collapsed');

      const fields = inspector.getFields(world, eid, map);
      for (const [label, value] of fields) {
        const row = this.el('div');
        const lbl = this.el('span', 'sb-inspect-label');
        lbl.textContent = label + ': ';
        const val = this.el('span', 'sb-inspect-value');
        val.textContent = value;
        row.append(lbl, val);
        body.appendChild(row);
      }

      this.entityInspectEl.appendChild(body);
    }

    // Delete button (disabled for player)
    const delBtn = this.el('button', 'sb-delete-btn');
    delBtn.textContent = 'Delete Entity';
    delBtn.disabled = isPlayer;
    delBtn.addEventListener('click', () => {
      this.ctrl.deleteEntity(eid);
    });
    this.entityInspectEl.appendChild(delBtn);
  }

  // ═══════════════════════════════════════════════════════════
  // EVENT HANDLERS
  // ═══════════════════════════════════════════════════════════

  private onToggle(): void {
    this.root.classList.toggle('open', this.ctrl.active);
  }

  private onToolChanged(): void {
    // Update active state on tool buttons
    const toolIds: SandboxTool[] = ['inspect', 'tile_paint', 'entity_spawn', 'fluid_place', 'gas_place'];
    for (let i = 0; i < this.toolButtons.length; i++) {
      this.toolButtons[i].classList.toggle('active', toolIds[i] === this.ctrl.activeTool);
    }
    this.renderToolOptions();
  }

  // ═══════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════

  private el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string): HTMLElementTagNameMap[K] {
    const el = document.createElement(tag);
    if (className) el.className = className;
    return el;
  }
}
