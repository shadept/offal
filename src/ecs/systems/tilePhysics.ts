/**
 * TilePhysicsMap — per-tile physics state.
 *
 * Stores fluid concentrations, gas concentrations, temperature, and surface
 * states for each tile. This is a parallel data structure to TileMap —
 * tiles are not ECS entities, so we store physics state separately.
 *
 * The engine reads material properties from the data registry to determine
 * how physics propagates. No hardcoded knowledge of specific substances.
 */

/** Physics state for a single tile */
export interface TilePhysicsState {
  /** Fluid ID → concentration (0–1) */
  fluids: Map<string, number>;
  /** Gas ID → concentration (0–1) */
  gases: Map<string, number>;
  /** Temperature (ambient = 0, fire raises it) */
  temperature: number;
  /** Active surface states (e.g., "on_fire", "wet") */
  surfaceStates: Set<string>;
  /** Fire spread delay counter (turns remaining before fire can propagate from this tile) */
  fireDelay: number;
}

export class TilePhysicsMap {
  readonly width: number;
  readonly height: number;
  private states: TilePhysicsState[];
  /**
   * Per-tile hit points. -1 = indestructible. Initialized from tile data
   * via initTileHp(). Fire (and other sources) reduce this; when it reaches
   * 0 the tile is destroyed.
   */
  tileHp: number[];

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    const size = width * height;
    this.states = new Array(size);
    this.tileHp = new Array(size).fill(-1);
    for (let i = 0; i < size; i++) {
      this.states[i] = {
        fluids: new Map(),
        gases: new Map(),
        temperature: 0,
        surfaceStates: new Set(),
        fireDelay: 0,
      };
    }
  }

  /** Convert (x, y) to flat index */
  idx(x: number, y: number): number {
    return y * this.width + x;
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && x < this.width && y >= 0 && y < this.height;
  }

  /** Get physics state at (x, y) */
  get(x: number, y: number): TilePhysicsState | null {
    if (!this.inBounds(x, y)) return null;
    return this.states[this.idx(x, y)];
  }

  /** Check if tile has a specific surface state */
  hasSurfaceState(x: number, y: number, state: string): boolean {
    const s = this.get(x, y);
    return s ? s.surfaceStates.has(state) : false;
  }

  /** Add a surface state to a tile */
  addSurfaceState(x: number, y: number, state: string): void {
    const s = this.get(x, y);
    if (s) s.surfaceStates.add(state);
  }

  /** Remove a surface state from a tile */
  removeSurfaceState(x: number, y: number, state: string): void {
    const s = this.get(x, y);
    if (s) s.surfaceStates.delete(state);
  }

  /** Add fluid concentration to a tile */
  addFluid(x: number, y: number, fluidId: string, amount: number): void {
    const s = this.get(x, y);
    if (!s) return;
    const current = s.fluids.get(fluidId) ?? 0;
    s.fluids.set(fluidId, Math.min(1, current + amount));
  }

  /** Get fluid concentration at a tile */
  getFluid(x: number, y: number, fluidId: string): number {
    const s = this.get(x, y);
    if (!s) return 0;
    return s.fluids.get(fluidId) ?? 0;
  }

  /** Add gas concentration to a tile */
  addGas(x: number, y: number, gasId: string, amount: number): void {
    const s = this.get(x, y);
    if (!s) return;
    const current = s.gases.get(gasId) ?? 0;
    s.gases.set(gasId, Math.min(1, current + amount));
  }

  /** Get gas concentration at a tile */
  getGas(x: number, y: number, gasId: string): number {
    const s = this.get(x, y);
    if (!s) return 0;
    return s.gases.get(gasId) ?? 0;
  }
}
