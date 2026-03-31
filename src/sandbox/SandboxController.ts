/**
 * SandboxController — mediates between the DOM panel and ECS/TileMap.
 *
 * The panel never imports bitECS directly. All game-state queries and
 * mutations flow through this controller, keeping the logic/visual
 * separation intact.
 */
import { query, addEntity, addComponent, removeEntity, hasComponent } from 'bitecs';
import { Position, Renderable, Turn, FOV, PlayerTag, BlocksMovement, AI, Health, Faction, CombatStats, Dead } from '../ecs/components';
import { getFactionIndex, getFactionId } from '../ecs/factions';
import { TileMap } from '../map/TileMap';
import { Visibility } from '../types';
import { getRegistry } from '../data/loader';
import type { SpeciesData } from '../types';
import type { TurnSystem } from '../ecs/systems/turnSystem';
import type { VisualEventQueue } from '../visual/EventQueue';
import type { SandboxTool, TileInspectData, EntityInspectData } from './types';

const VIS_NAMES: Record<number, string> = {
  [Visibility.UNSEEN]: 'Unseen',
  [Visibility.SEEN]: 'Seen',
  [Visibility.VISIBLE]: 'Visible',
};

type Listener = (event: string, data?: unknown) => void;

export class SandboxController {
  // ── Mode state ──
  active = false;
  revealAll = false;

  // ── Selection ──
  selectedTile: { x: number; y: number } | null = null;
  selectedEntity: number | null = null;

  // ── Tool state ──
  activeTool: SandboxTool = 'inspect';
  paintTileIndex = 2; // default: wall (index from tile data)
  selectedSpeciesId = '';  // set to first non-player species on init

  // ── Simulation ──
  autoPlay = false;
  autoPlaySpeed = 3; // turns per second
  aiOnly = false;

  // ── Refs (set by GameScene) ──
  private tileMap!: TileMap;
  private world!: object;
  private turnSystem!: TurnSystem;
  private eventQueue!: VisualEventQueue;

  // ── Event emitter ──
  private listeners: Listener[] = [];

  /** Bind game references. Called once from GameScene.create(). */
  bind(tileMap: TileMap, world: object, turnSystem: TurnSystem, eventQueue: VisualEventQueue): void {
    this.tileMap = tileMap;
    this.world = world;
    this.turnSystem = turnSystem;
    this.eventQueue = eventQueue;

    // Default to first non-playerStart species
    const registry = getRegistry();
    for (const [, sp] of registry.species) {
      if (!sp.playerStart) {
        this.selectedSpeciesId = sp.id;
        break;
      }
    }
  }

  on(cb: Listener): void {
    this.listeners.push(cb);
  }

  emit(event: string, data?: unknown): void {
    for (const cb of this.listeners) cb(event, data);
  }

  // ═══════════════════════════════════════════════════════════
  // MODE
  // ═══════════════════════════════════════════════════════════

  toggle(): void {
    this.active = !this.active;
    if (!this.active) {
      this.selectedTile = null;
      this.selectedEntity = null;
      this.autoPlay = false;
    }
    this.emit('toggle');
  }

  // ═══════════════════════════════════════════════════════════
  // QUERIES
  // ═══════════════════════════════════════════════════════════

  getTileInfo(x: number, y: number): TileInspectData | null {
    if (!this.tileMap.inBounds(x, y)) return null;
    const idx = this.tileMap.idx(x, y);
    const tileIndex = this.tileMap.tiles[idx];
    const tileData = getRegistry().tilesByIndex.get(tileIndex);
    const materialId = tileData?.material ?? null;
    const material = materialId ? getRegistry().materials.get(materialId) : null;
    return {
      x,
      y,
      tileType: tileData?.name ?? 'Unknown',
      tileTypeId: tileIndex,
      materialName: material?.name ?? 'None',
      visibility: VIS_NAMES[this.tileMap.visibility[idx]] ?? 'Unknown',
      light: this.tileMap.light[idx],
      fluids: {},
      gases: {},
      temperature: 0,
      surfaceStates: [],
    };
  }

  findEntityAt(x: number, y: number): number | null {
    const entities = query(this.world, [Position]);
    for (const eid of entities) {
      if (hasComponent(this.world, eid, Dead)) continue;
      if (Position.x[eid] === x && Position.y[eid] === y) return eid;
    }
    return null;
  }

  getEntityInfo(eid: number): EntityInspectData | null {
    const entities = query(this.world, [Position]);
    if (!entities.includes(eid)) return null;

    const players = query(this.world, [PlayerTag]);
    const aiEntities = query(this.world, [AI]);
    const hasAI = aiEntities.includes(eid);
    const speciesId = Renderable.spriteIndex[eid];
    const factionIdx = hasComponent(this.world, eid, Faction) ? Faction.factionIndex[eid] : 255;
    const factionName = getFactionId(factionIdx) ?? 'none';
    return {
      eid,
      position: { x: Position.x[eid], y: Position.y[eid] },
      spriteIndex: speciesId,
      layer: Renderable.layer[eid],
      energy: Turn.energy[eid],
      speed: Turn.speed[eid],
      fovRange: FOV.range[eid],
      isPlayer: players.includes(eid),
      hasAI,
      aiBehaviour: hasAI ? AI.behaviour[eid] : 0,
      hp: hasComponent(this.world, eid, Health) ? Health.hp[eid] : 0,
      maxHp: hasComponent(this.world, eid, Health) ? Health.maxHp[eid] : 0,
      faction: factionName,
      attackDamage: hasComponent(this.world, eid, CombatStats) ? CombatStats.attackDamage[eid] : 0,
    };
  }

  /** Get all species available for spawning (non-playerStart) */
  getSpawnableSpecies(): SpeciesData[] {
    const result: SpeciesData[] = [];
    for (const [, sp] of getRegistry().species) {
      if (!sp.playerStart) result.push(sp);
    }
    return result;
  }

  /** Get paintable tile definitions */
  getPaintableTiles(): { index: number; name: string }[] {
    const result: { index: number; name: string }[] = [];
    for (const [, td] of getRegistry().tilesByIndex) {
      result.push({ index: td.index, name: td.name });
    }
    return result.sort((a, b) => a.index - b.index);
  }

  // ═══════════════════════════════════════════════════════════
  // ACTIONS
  // ═══════════════════════════════════════════════════════════

  paintTile(x: number, y: number): void {
    if (!this.tileMap.inBounds(x, y)) return;
    this.tileMap.set(x, y, this.paintTileIndex);
    this.emit('tile_painted', { x, y, type: this.paintTileIndex });
  }

  spawnEntity(x: number, y: number): number {
    const species = getRegistry().species.get(this.selectedSpeciesId);
    if (!species) return -1;

    const eid = addEntity(this.world);
    addComponent(this.world, eid, Position);
    addComponent(this.world, eid, Renderable);
    addComponent(this.world, eid, Turn);
    addComponent(this.world, eid, BlocksMovement);
    addComponent(this.world, eid, AI);
    addComponent(this.world, eid, FOV);
    addComponent(this.world, eid, Health);
    addComponent(this.world, eid, Faction);
    addComponent(this.world, eid, CombatStats);

    Position.x[eid] = x;
    Position.y[eid] = y;
    Renderable.spriteIndex[eid] = 0;
    Renderable.layer[eid] = 2;
    Turn.energy[eid] = 0;
    Turn.speed[eid] = species.speed;
    Turn.actionCost[eid] = 0;
    FOV.range[eid] = species.fovRange;

    const hp = species.maxHp ?? 10;
    Health.hp[eid] = hp;
    Health.maxHp[eid] = hp;
    Faction.factionIndex[eid] = getFactionIndex(species.faction ?? 'creatures');
    CombatStats.attackDamage[eid] = species.attackDamage ?? 1;

    this.emit('entity_spawned', { eid, x, y, speciesId: species.id });
    return eid;
  }

  deleteEntity(eid: number): boolean {
    const players = query(this.world, [PlayerTag]);
    if (players.includes(eid)) return false;

    removeEntity(this.world, eid);
    this.selectedEntity = null;
    this.emit('entity_removed', { eid });
    return true;
  }

  selectTile(x: number, y: number): void {
    if (!this.tileMap.inBounds(x, y)) return;
    this.selectedTile = { x, y };
    this.selectedEntity = this.findEntityAt(x, y);
    this.emit('selection_changed');
  }

  // ═══════════════════════════════════════════════════════════
  // SIMULATION
  // ═══════════════════════════════════════════════════════════

  advanceTurn(): void {
    this.turnSystem.forceTick(this.world);
    this.emit('turn_advanced');
  }

  /** Get map ref (for AI system calls from GameScene). */
  getMap(): TileMap { return this.tileMap; }

  /** Get event queue ref. */
  getEventQueue(): VisualEventQueue { return this.eventQueue; }

  setTool(tool: SandboxTool): void {
    this.activeTool = tool;
    this.emit('tool_changed', tool);
  }

  setPaintType(index: number): void {
    this.paintTileIndex = index;
    this.emit('paint_type_changed', index);
  }

  setSelectedSpecies(id: string): void {
    this.selectedSpeciesId = id;
    this.emit('species_changed', id);
  }

  setRevealAll(v: boolean): void {
    this.revealAll = v;
    this.emit('reveal_changed', v);
  }

  setAutoPlay(v: boolean): void {
    this.autoPlay = v;
    this.emit('autoplay_changed', v);
  }

  setAutoPlaySpeed(v: number): void {
    this.autoPlaySpeed = Math.max(1, Math.min(10, v));
    this.emit('speed_changed', this.autoPlaySpeed);
  }
}
