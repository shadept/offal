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
  Position, FOV, AI, Health, Turn, Faction,
  CombatStats, Renderable, PlayerTag,
} from '../ecs/components';
import { getFactionId } from '../ecs/factions';
import { bfsFullPath } from '../ecs/systems/aiSystem';
import { computeFOVTiles } from '../map/fov';
import { TileMap, TILE_SIZE } from '../map/TileMap';

// ── Minimal drawing interface (matches Phaser.GameObjects.Graphics) ──

export interface OverlayGraphics {
  fillStyle(color: number, alpha: number): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  lineStyle(width: number, color: number, alpha: number): void;
  strokeRect(x: number, y: number, w: number, h: number): void;
}

// ── Inspector interface ──

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
}

// ── Built-in inspectors ──

const AI_STATES: Record<number, string> = { 0: 'Idle', 1: 'Wander', 2: 'Seek', 3: 'Searching' };

const BUILTIN_INSPECTORS: ComponentInspector[] = [
  {
    name: 'Position',
    hasComponent: (w, eid) => hasComponent(w, eid, Position),
    getFields: (_w, eid) => [
      ['x', String(Position.x[eid])],
      ['y', String(Position.y[eid])],
    ],
    hasOverlay: false,
  },
  {
    name: 'Health',
    hasComponent: (w, eid) => hasComponent(w, eid, Health),
    getFields: (_w, eid) => [
      ['HP', `${Health.hp[eid]} / ${Health.maxHp[eid]}`],
    ],
    hasOverlay: false,
  },
  {
    name: 'Turn',
    hasComponent: (w, eid) => hasComponent(w, eid, Turn),
    getFields: (_w, eid) => [
      ['Energy', Turn.energy[eid].toFixed(0)],
      ['Speed', Turn.speed[eid].toFixed(0)],
    ],
    hasOverlay: false,
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
    getFields: (w, eid, map) => {
      const behaviour = AI.state[eid];
      const targetEid = AI.targetEid[eid];
      const fields: [string, string][] = [
        ['State', AI_STATES[behaviour] ?? `Unknown(${behaviour})`],
        ['Target', targetEid >= 0 ? `EID ${targetEid}` : 'None'],
      ];
      if (targetEid >= 0) {
        const path = bfsFullPath(
          Position.x[eid], Position.y[eid],
          Position.x[targetEid], Position.y[targetEid],
          map, eid, w,
        );
        fields.push(['Path Len', String(path.length)]);
      }
      return fields;
    },
    hasOverlay: true,
    renderOverlay(gfx, world, eid, map) {
      const targetEid = AI.targetEid[eid];
      if (targetEid < 0) return;
      const path = bfsFullPath(
        Position.x[eid], Position.y[eid],
        Position.x[targetEid], Position.y[targetEid],
        map, eid, world,
      );
      // Path tiles (semi-transparent blue)
      if (path.length > 0) {
        gfx.fillStyle(0x3366ff, 0.25);
        for (const tile of path) {
          gfx.fillRect(tile.x * TILE_SIZE, tile.y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        }
      }
      // Target tile (red outline)
      const tx = Position.x[targetEid];
      const ty = Position.y[targetEid];
      gfx.lineStyle(2, 0xff3333, 0.8);
      gfx.strokeRect(tx * TILE_SIZE + 1, ty * TILE_SIZE + 1, TILE_SIZE - 2, TILE_SIZE - 2);
    },
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
