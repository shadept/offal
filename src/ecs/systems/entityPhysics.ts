/**
 * EntityPhysicsMap — per-entity physics state (surface states from
 * environmental contact).
 *
 * Tracks contamination from fluids (e.g., "wet" from water, "oily" from oil).
 * Each state has a remaining duration in turns. When duration hits 0 the
 * state is removed. Standing on a fluid resets the duration to the fluid's
 * contaminationDuration value.
 *
 * Parallel to TilePhysicsMap but for entities. Not an ECS component because
 * surface states are variable-length tag maps, not fixed SoA columns.
 */

export class EntityPhysicsMap {
  /** Entity ID → (state name → remaining turns) */
  private states = new Map<number, Map<string, number>>();

  /** Check if entity has a surface state */
  has(eid: number, state: string): boolean {
    return (this.states.get(eid)?.get(state) ?? 0) > 0;
  }

  /** Set a surface state with a duration (resets if already present) */
  set(eid: number, state: string, duration: number): void {
    let m = this.states.get(eid);
    if (!m) {
      m = new Map();
      this.states.set(eid, m);
    }
    // Only reset if new duration is >= current remaining
    const current = m.get(state) ?? 0;
    if (duration >= current) {
      m.set(state, duration);
    }
  }

  /** Get remaining duration for a state (0 = absent) */
  getDuration(eid: number, state: string): number {
    return this.states.get(eid)?.get(state) ?? 0;
  }

  /** Get all states with durations (for inspector display) */
  getStates(eid: number): { state: string; turns: number }[] {
    const m = this.states.get(eid);
    if (!m) return [];
    const result: { state: string; turns: number }[] = [];
    for (const [state, turns] of m) {
      result.push({ state, turns });
    }
    return result;
  }

  /**
   * Tick all durations down by 1. Call once per turn.
   * Returns nothing — expired states are silently removed.
   */
  tick(): void {
    for (const [eid, m] of this.states) {
      const expired: string[] = [];
      for (const [state, turns] of m) {
        const remaining = turns - 1;
        if (remaining <= 0) {
          expired.push(state);
        } else {
          m.set(state, remaining);
        }
      }
      for (const s of expired) m.delete(s);
      if (m.size === 0) this.states.delete(eid);
    }
  }

  /** Remove an entity entirely (on death/removal) */
  delete(eid: number): void {
    this.states.delete(eid);
  }

  /** Clear all state */
  clear(): void {
    this.states.clear();
  }
}
