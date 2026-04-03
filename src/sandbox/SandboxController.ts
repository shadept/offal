/**
 * SandboxController — mediates between the DOM panel and ECS/TileMap.
 *
 * The panel never imports bitECS directly. All game-state queries and
 * mutations flow through this controller, keeping the logic/visual
 * separation intact.
 */
import { query, addEntity, addComponent, removeEntity, hasComponent } from 'bitecs';
import { Position, Renderable, Turn, FOV, PlayerTag, BlocksMovement, AI, Health, Faction, CombatStats, Dead } from '../ecs/components';
import { getFactionIndex } from '../ecs/factions';
import { spawnBodyForCreature, detachPart, getPartData } from '../ecs/body';
import { AttachedTo, Body } from '../ecs/components';
import { checkCreatureDeath } from '../ecs/damage';
import { TileMap } from '../map/TileMap';
import { Visibility } from '../types';
import { getRegistry } from '../data/loader';
import type { SpeciesData } from '../types';
import type { TurnSystem } from '../ecs/systems/turnSystem';
import type { VisualEventQueue } from '../visual/EventQueue';
import type { TilePhysicsMap } from '../ecs/systems/tilePhysics';
import { DebugOverlayRegistry } from './debugOverlays';
import { clearEntityAICache } from '../ecs/systems/aiSystem';
import type { SandboxTool, TileInspectData, EntityInspectData, ComponentSectionData } from './types';

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
  selectedEntity: number | null = null;  // first entity (backward compat)
  selectedEntities: number[] = [];       // all entities at selected tile

  // ── Tool state ──
  activeTool: SandboxTool = 'inspect';
  paintTileIndex = 2; // default: wall (index from tile data)
  selectedSpeciesId = '';  // set to first non-player species on init
  selectedFluidId = 'water';  // default fluid for placer
  selectedGasId = 'smoke';    // default gas for placer

  // ── Simulation ──
  autoPlay = false;
  autoPlaySpeed = 3; // turns per second
  aiOnly = false;

  // ── Debug overlays ──
  readonly debugRegistry = new DebugOverlayRegistry();
  /** Per-entity pinned overlays: eid → Set<componentName> */
  readonly pinnedOverlays = new Map<number, Set<string>>();

  // ── Refs (set by GameScene) ──
  private tileMap!: TileMap;
  private world!: object;
  private turnSystem!: TurnSystem;
  private eventQueue!: VisualEventQueue;
  private tilePhysics!: TilePhysicsMap;

  // ── Event emitter ──
  private listeners: Listener[] = [];

  /** Bind game references. Called once from GameScene.create(). */
  bind(tileMap: TileMap, world: object, turnSystem: TurnSystem, eventQueue: VisualEventQueue, tilePhysics?: TilePhysicsMap): void {
    this.tileMap = tileMap;
    this.world = world;
    this.turnSystem = turnSystem;
    this.eventQueue = eventQueue;
    if (tilePhysics) this.tilePhysics = tilePhysics;

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
      this.selectedEntities = [];
      this.autoPlay = false;
      // pinnedOverlays intentionally NOT cleared — survive panel close
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
    // Read physics state
    const physState = this.tilePhysics?.get(x, y);
    const fluids: Record<string, number> = {};
    const gases: Record<string, number> = {};
    let temperature = 0;
    let surfaceStates: string[] = [];
    if (physState) {
      for (const [id, conc] of physState.fluids) fluids[id] = conc;
      for (const [id, conc] of physState.gases) gases[id] = conc;
      temperature = physState.temperature;
      surfaceStates = Array.from(physState.surfaceStates);
    }

    return {
      x,
      y,
      tileType: tileData?.name ?? 'Unknown',
      tileTypeId: tileIndex,
      materialName: material?.name ?? 'None',
      visibility: VIS_NAMES[this.tileMap.visibility[idx]] ?? 'Unknown',
      light: this.tileMap.light[idx],
      fluids,
      gases,
      temperature,
      surfaceStates,
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

  findAllEntitiesAt(x: number, y: number): number[] {
    const result: number[] = [];
    const entities = query(this.world, [Position]);
    for (const eid of entities) {
      if (hasComponent(this.world, eid, Dead)) continue;
      if (Position.x[eid] === x && Position.y[eid] === y) result.push(eid);
    }
    return result;
  }

  getEntityInfo(eid: number): EntityInspectData | null {
    const entities = query(this.world, [Position]);
    if (!entities.includes(eid)) return null;

    const players = query(this.world, [PlayerTag]);
    return {
      eid,
      isPlayer: players.includes(eid),
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
    AI.state[eid] = 0;
    AI.targetEid[eid] = -1;
    AI.lastKnownX[eid] = -1;
    AI.lastKnownY[eid] = -1;
    AI.searchBudget[eid] = 0;
    AI.cachedTargetX[eid] = -1;
    AI.cachedTargetY[eid] = -1;

    spawnBodyForCreature(this.world, eid, species, getRegistry());

    this.emit('entity_spawned', { eid, x, y, speciesId: species.id });
    return eid;
  }

  /** Place fluid on a tile */
  placeFluid(x: number, y: number): void {
    if (!this.tileMap.inBounds(x, y) || !this.tilePhysics) return;
    this.tilePhysics.addFluid(x, y, this.selectedFluidId, 0.5);
    this.emit('physics_changed', { x, y });
  }

  /** Place gas on a tile */
  placeGas(x: number, y: number): void {
    if (!this.tileMap.inBounds(x, y) || !this.tilePhysics) return;
    this.tilePhysics.addGas(x, y, this.selectedGasId, 0.5);
    this.emit('physics_changed', { x, y });
  }

  /** Ignite fire on a tile */
  igniteTile(x: number, y: number): void {
    if (!this.tileMap.inBounds(x, y) || !this.tilePhysics) return;
    this.tilePhysics.addSurfaceState(x, y, 'on_fire');
    const state = this.tilePhysics.get(x, y);
    if (state) state.temperature = Math.min(500, state.temperature + 100);
    this.emit('physics_changed', { x, y });
  }

  /** Get available fluids for the placer tool */
  getPlaceableFluids(): { id: string; name: string }[] {
    const result: { id: string; name: string }[] = [];
    for (const [, mat] of getRegistry().materials) {
      if (mat.tags?.includes('fluid')) {
        result.push({ id: mat.id, name: mat.name });
      }
    }
    return result;
  }

  /** Get available gases for the placer tool */
  getPlaceableGases(): { id: string; name: string }[] {
    const result: { id: string; name: string }[] = [];
    for (const [, mat] of getRegistry().materials) {
      if (mat.tags?.includes('gas')) {
        result.push({ id: mat.id, name: mat.name });
      }
    }
    return result;
  }

  /** Get tile physics map ref. */
  getTilePhysics(): TilePhysicsMap { return this.tilePhysics; }

  deleteEntity(eid: number): boolean {
    const players = query(this.world, [PlayerTag]);
    if (players.includes(eid)) return false;

    clearEntityAICache(eid);
    removeEntity(this.world, eid);
    this.pinnedOverlays.delete(eid);
    this.selectedEntities = this.selectedEntities.filter(e => e !== eid);
    this.selectedEntity = this.selectedEntities[0] ?? null;
    this.emit('entity_removed', { eid });
    return true;
  }

  /** Execute a field action by type. Called from ComponentSection. */
  runFieldAction(actionType: string, data: Record<string, number>): void {
    if (actionType === 'sever_part') {
      this.severPart(data.creatureEid, data.partEid);
    }
  }

  /** Sever a part from a creature body. */
  private severPart(creatureEid: number, partEid: number): void {
    if (!hasComponent(this.world, creatureEid, Body)) return;
    if (!hasComponent(this.world, partEid, AttachedTo)) return;

    const x = Position.x[creatureEid];
    const y = Position.y[creatureEid];
    const partDef = getPartData(partEid);

    detachPart(this.world, partEid, creatureEid, x, y);

    this.eventQueue.push({
      type: 'part_severed',
      entityId: creatureEid,
      data: { partEid, partName: partDef?.name ?? 'part', x, y },
    });

    checkCreatureDeath(creatureEid, this.world, this.eventQueue);
    this.emit('selection_changed');
  }

  selectTile(x: number, y: number): void {
    if (!this.tileMap.inBounds(x, y)) return;
    this.selectedTile = { x, y };
    this.selectedEntities = this.findAllEntitiesAt(x, y);
    this.selectedEntity = this.selectedEntities[0] ?? null;
    this.emit('selection_changed');
  }

  /** Toggle a debug overlay pin for the currently selected entity. */
  toggleOverlay(name: string): void {
    const eid = this.selectedEntity;
    if (eid === null) return;

    let set = this.pinnedOverlays.get(eid);
    if (set?.has(name)) {
      set.delete(name);
      if (set.size === 0) this.pinnedOverlays.delete(eid);
    } else {
      if (!set) {
        set = new Set();
        this.pinnedOverlays.set(eid, set);
      }
      set.add(name);
    }
    this.emit('overlays_changed');
  }

  /** Is an overlay pinned for the currently selected entity? */
  isOverlayEnabled(name: string): boolean {
    if (this.selectedEntity === null) return false;
    return this.pinnedOverlays.get(this.selectedEntity)?.has(name) ?? false;
  }

  /** Clear all pinned overlays for all entities. */
  clearAllOverlays(): void {
    this.pinnedOverlays.clear();
    this.emit('overlays_changed');
  }

  /** Check if any overlays are pinned anywhere. */
  hasAnyOverlays(): boolean {
    return this.pinnedOverlays.size > 0;
  }

  /** Expose world for debug registry. */
  getWorld(): object { return this.world; }

  /** Get component section data for an entity (drives the inspector panel). */
  getComponentSections(eid: number): ComponentSectionData[] {
    const inspectors = this.debugRegistry.getFor(this.world, eid);
    return inspectors.map(i => ({
      name: i.name,
      fields: i.getFields(this.world, eid, this.tileMap),
      hasOverlay: i.hasOverlay,
    }));
  }

  // ═══════════════════════════════════════════════════════════
  // SIMULATION
  // ═══════════════════════════════════════════════════════════

  /** Request a sandbox turn advance. GameScene handles the actual processing. */
  advanceTurn(): void {
    this.emit('advance_turn');
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

  setSelectedFluid(id: string): void {
    this.selectedFluidId = id;
    this.emit('fluid_changed', id);
  }

  setSelectedGas(id: string): void {
    this.selectedGasId = id;
    this.emit('gas_changed', id);
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

  setAiOnly(v: boolean): void {
    this.aiOnly = v;
    this.emit('aionly_changed', v);
  }

  /** Request ship regeneration. GameScene handles the actual work. */
  generateNewShip(seed?: string): void {
    this.selectedTile = null;
    this.selectedEntity = null;
    this.selectedEntities = [];
    this.autoPlay = false;
    this.emit('generate_ship', { seed });
  }
}
