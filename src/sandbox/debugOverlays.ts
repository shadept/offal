/**
 * Debug overlay registry — component-driven inspector + map overlays.
 *
 * Each ComponentInspector describes one ECS component: how to detect it,
 * what fields to show in the panel, and optionally how to render a debug
 * overlay on the map.  The registry is extensible — future phases can
 * register new inspectors (e.g. physics, fluids).
 */
import { hasComponent } from 'bitecs';
import {
  Position, FOV, AI, AIState, Health, Turn, Faction,
  CombatStats, Renderable, PlayerTag, Body, CachedCapacity, PartIdentity,
} from '../ecs/components';
import { getFactionId } from '../ecs/factions';
import { getPartsOf, getPartData, getSlotName, getSpeciesId } from '../ecs/body';
import { AttachedTo } from '../ecs/components';
import { getAIPath } from '../ecs/systems/aiSystem';
import { computeFOVTiles } from '../map/fov';
import { TileMap, TILE_SIZE } from '../map/TileMap';

// ── Minimal drawing interface (matches Phaser.GameObjects.Graphics) ──

export interface OverlayGraphics {
  fillStyle(color: number, alpha: number): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  lineStyle(width: number, color: number, alpha: number): void;
  strokeRect(x: number, y: number, w: number, h: number): void;
  lineBetween(x1: number, y1: number, x2: number, y2: number): void;
}

// ── Inspector interface ──

/** An action button rendered next to a field row. */
export interface FieldAction {
  label: string;
  /** field key this action belongs to */
  field: string;
  /** type tag for routing through the controller */
  actionType?: string;
  /** additional data for the action */
  data?: Record<string, number>;
}

export interface ComponentInspector {
  /** Display name shown in the panel section header. */
  name: string;
  /** Returns true if the entity has this component. */
  hasComponent(world: object, eid: number): boolean;
  /** Key-value pairs shown in the inspector panel. */
  getFields(world: object, eid: number, map: TileMap): [string, string][];
  /** Whether this inspector can render a map overlay. */
  hasOverlay: boolean;
  /** Draw the debug overlay. Only called when hasOverlay is true. */
  renderOverlay?(gfx: OverlayGraphics, world: object, eid: number, map: TileMap): void;
  /** Per-field action buttons (e.g. "sever" on body parts). */
  getActions?(world: object, eid: number): FieldAction[];
  /** Field labels that can be edited directly in the inspector. */
  editableFields?: ReadonlySet<string>;
  /** Set a field value from a string. Only called for editable fields. */
  setField?(world: object, eid: number, label: string, value: string): void;
}

// ── Built-in inspectors ──

const AI_STATES: Record<number, string> = {
  [AIState.IDLE]: 'Idle',
  [AIState.WANDER]: 'Wander',
  [AIState.SEEK]: 'Seek',
  [AIState.SEARCHING]: 'Searching',
};

const BUILTIN_INSPECTORS: ComponentInspector[] = [
  {
    name: 'Position',
    hasComponent: (w, eid) => hasComponent(w, eid, Position),
    getFields: (_w, eid) => [
      ['x', String(Position.x[eid])],
      ['y', String(Position.y[eid])],
    ],
    hasOverlay: false,
    editableFields: new Set(['x', 'y']),
    setField(_w, eid, label, value) {
      const n = parseInt(value, 10);
      if (Number.isNaN(n)) return;
      if (label === 'x') Position.x[eid] = n;
      if (label === 'y') Position.y[eid] = n;
    },
  },
  {
    name: 'Health',
    hasComponent: (w, eid) => hasComponent(w, eid, Health),
    getFields: (_w, eid) => [
      ['HP', String(Health.hp[eid])],
      ['Max HP', String(Health.maxHp[eid])],
    ],
    hasOverlay: false,
    editableFields: new Set(['HP', 'Max HP']),
    setField(_w, eid, label, value) {
      const n = parseInt(value, 10);
      if (Number.isNaN(n)) return;
      if (label === 'HP') Health.hp[eid] = n;
      if (label === 'Max HP') Health.maxHp[eid] = n;
    },
  },
  {
    name: 'Turn',
    hasComponent: (w, eid) => hasComponent(w, eid, Turn),
    getFields: (_w, eid) => [
      ['Energy', Turn.energy[eid].toFixed(0)],
      ['Speed', Turn.speed[eid].toFixed(0)],
    ],
    hasOverlay: false,
    editableFields: new Set(['Energy', 'Speed']),
    setField(_w, eid, label, value) {
      const n = parseInt(value, 10);
      if (Number.isNaN(n)) return;
      if (label === 'Energy') Turn.energy[eid] = n;
      if (label === 'Speed') Turn.speed[eid] = n;
    },
  },
  {
    name: 'Faction',
    hasComponent: (w, eid) => hasComponent(w, eid, Faction),
    getFields: (_w, eid) => [
      ['Faction', getFactionId(Faction.factionIndex[eid]) ?? 'none'],
    ],
    hasOverlay: false,
  },
  {
    name: 'CombatStats',
    hasComponent: (w, eid) => hasComponent(w, eid, CombatStats),
    getFields: (_w, eid) => [
      ['Attack', String(CombatStats.attackDamage[eid])],
    ],
    hasOverlay: false,
    editableFields: new Set(['Attack']),
    setField(_w, eid, label, value) {
      const n = parseInt(value, 10);
      if (Number.isNaN(n)) return;
      if (label === 'Attack') CombatStats.attackDamage[eid] = n;
    },
  },
  {
    name: 'Renderable',
    hasComponent: (w, eid) => hasComponent(w, eid, Renderable),
    getFields: (_w, eid) => [
      ['Sprite Index', String(Renderable.spriteIndex[eid])],
      ['Layer', String(Renderable.layer[eid])],
    ],
    hasOverlay: false,
  },
  {
    name: 'FOV',
    hasComponent: (w, eid) => hasComponent(w, eid, FOV),
    getFields: (_w, eid) => [
      ['Range', String(FOV.range[eid])],
    ],
    hasOverlay: true,
    editableFields: new Set(['Range']),
    setField(_w, eid, label, value) {
      const n = parseInt(value, 10);
      if (Number.isNaN(n) || n < 0) return;
      if (label === 'Range') FOV.range[eid] = n;
    },
    renderOverlay(gfx, _world, eid, map) {
      const x = Position.x[eid];
      const y = Position.y[eid];
      const range = FOV.range[eid];
      const tiles = computeFOVTiles(map, x, y, range);
      gfx.fillStyle(0xffdd44, 0.18);
      for (const t of tiles) {
        gfx.fillRect(t.x * TILE_SIZE, t.y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
      }
    },
  },
  {
    name: 'AI',
    hasComponent: (w, eid) => hasComponent(w, eid, AI),
    getFields: (_w, eid) => {
      const state = AI.state[eid];
      const targetEid = AI.targetEid[eid];
      const path = getAIPath(eid);
      const lkx = AI.lastKnownX[eid];
      const lky = AI.lastKnownY[eid];
      const fields: [string, string][] = [
        ['State', AI_STATES[state] ?? `Unknown(${state})`],
        ['Target', targetEid >= 0 ? `EID ${targetEid}` : 'None'],
        ['Path Len', String(path.length)],
      ];
      if (state === AIState.SEARCHING) {
        fields.push(['Search Budget', String(AI.searchBudget[eid])]);
        if (lkx >= 0 && lky >= 0) {
          fields.push(['LKP', `(${lkx}, ${lky})`]);
        }
      }
      return fields;
    },
    hasOverlay: true,
    renderOverlay(gfx, _world, eid, map) {
      const path = getAIPath(eid);
      const state = AI.state[eid];
      const targetEid = AI.targetEid[eid];

      // Path tiles (semi-transparent blue)
      if (path.length > 0) {
        gfx.fillStyle(0x3366ff, 0.25);
        for (const tile of path) {
          gfx.fillRect(tile.x * TILE_SIZE, tile.y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        }
      }

      // Target tile (red outline)
      if (targetEid >= 0) {
        const tx = Position.x[targetEid];
        const ty = Position.y[targetEid];
        gfx.lineStyle(2, 0xff3333, 0.8);
        gfx.strokeRect(tx * TILE_SIZE + 1, ty * TILE_SIZE + 1, TILE_SIZE - 2, TILE_SIZE - 2);
      }

      // LKP tile (orange cross) — shown when searching
      if (state === AIState.SEARCHING) {
        const lkx = AI.lastKnownX[eid];
        const lky = AI.lastKnownY[eid];
        if (lkx >= 0 && lky >= 0) {
          const px = lkx * TILE_SIZE;
          const py = lky * TILE_SIZE;
          gfx.lineStyle(2, 0xff8800, 0.8);
          // Draw X cross
          gfx.lineBetween(px + 4, py + 4, px + TILE_SIZE - 4, py + TILE_SIZE - 4);
          gfx.lineBetween(px + TILE_SIZE - 4, py + 4, px + 4, py + TILE_SIZE - 4);
        }
      }
    },
  },
  {
    name: 'Body',
    hasComponent: (w, eid) => hasComponent(w, eid, Body),
    getFields: (w, eid) => {
      const fields: [string, string][] = [
        ['Body HP', `${Body.cachedHp[eid]} / ${Body.cachedMaxHp[eid]}`],
      ];
      const speciesId = getSpeciesId(Body.speciesIdx[eid]);
      if (speciesId) fields.push(['Species', speciesId]);

      // List all attached parts
      const parts = getPartsOf(eid);
      for (const pEid of parts) {
        const partDef = getPartData(pEid);
        const slotName = getSlotName(AttachedTo.slotId[pEid]) ?? '?';
        const hp = Health.hp[pEid];
        const maxHp = Health.maxHp[pEid];
        const name = partDef?.name ?? 'Unknown';
        const status = hp <= 0 ? ' [DEAD]' : '';
        fields.push([slotName, `${name} ${hp}/${maxHp}${status}`]);
      }
      return fields;
    },
    getActions: (_w, eid) => {
      const actions: FieldAction[] = [];
      const parts = getPartsOf(eid);
      for (const pEid of parts) {
        if (Health.hp[pEid] <= 0) continue;
        const slotName = getSlotName(AttachedTo.slotId[pEid]) ?? '?';
        actions.push({
          label: 'sever',
          field: slotName,
          actionType: 'sever_part',
          data: { creatureEid: eid, partEid: pEid },
        });
      }
      return actions;
    },
    hasOverlay: false,
  },
  {
    name: 'Capacity',
    hasComponent: (w, eid) => hasComponent(w, eid, CachedCapacity),
    getFields: (_w, eid) => [
      ['Mobility', `${CachedCapacity.mobility[eid]}%`],
      ['Manipulation', `${CachedCapacity.manipulation[eid]}%`],
      ['Consciousness', `${CachedCapacity.consciousness[eid]}%`],
      ['Circulation', `${CachedCapacity.circulation[eid]}%`],
      ['Structure', `${CachedCapacity.structuralIntegrity[eid]}%`],
    ],
    hasOverlay: false,
  },
  {
    name: 'PartIdentity',
    hasComponent: (w, eid) => hasComponent(w, eid, PartIdentity),
    getFields: (_w, eid) => {
      const partDef = getPartData(eid);
      const fields: [string, string][] = [];
      if (partDef) {
        fields.push(['Part', partDef.name]);
        fields.push(['Type', partDef.type]);
        fields.push(['Material', partDef.material]);
        fields.push(['Depth', partDef.depth]);
        fields.push(['Decay Rate', String(partDef.detachedDecayRate)]);
      }
      return fields;
    },
    hasOverlay: false,
  },
  {
    name: 'Player',
    hasComponent: (w, eid) => hasComponent(w, eid, PlayerTag),
    getFields: () => [['Tag', 'Yes']],
    hasOverlay: false,
  },
];

// ── Registry ──

export class DebugOverlayRegistry {
  private inspectors: ComponentInspector[] = [...BUILTIN_INSPECTORS];

  /** All inspectors whose component is present on the entity. */
  getFor(world: object, eid: number): ComponentInspector[] {
    return this.inspectors.filter(i => i.hasComponent(world, eid));
  }

  /** Register a new component inspector (for future phases). */
  register(inspector: ComponentInspector): void {
    this.inspectors.push(inspector);
  }
}
