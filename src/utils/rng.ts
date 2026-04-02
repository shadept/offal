/**
 * Seeded pseudo-random number generator (mulberry32).
 * Deterministic: same seed always produces same sequence.
 * Used by dungeon generation for reproducible ship layouts.
 */

/** Hash a string seed into a 32-bit integer. */
function hashSeed(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

export class SeededRNG {
  private state: number;
  readonly seed: string;

  constructor(seed?: string) {
    this.seed = seed ?? String(Date.now());
    this.state = hashSeed(this.seed);
    // Warm up — discard first few values to reduce seed correlation
    for (let i = 0; i < 8; i++) this.next();
  }

  /** Returns a float in [0, 1). */
  next(): number {
    this.state |= 0;
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Returns an integer in [min, max] (inclusive). */
  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  /** Pick a random element from an array. */
  pick<T>(arr: readonly T[]): T {
    return arr[this.int(0, arr.length - 1)];
  }

  /** Shuffle an array in place (Fisher-Yates). */
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /** Returns true with probability p (0–1). */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /** Weighted random pick. weights[i] is the relative weight for items[i]. */
  weightedPick<T>(items: readonly T[], weights: readonly number[]): T {
    const total = weights.reduce((s, w) => s + w, 0);
    let r = this.next() * total;
    for (let i = 0; i < items.length; i++) {
      r -= weights[i];
      if (r <= 0) return items[i];
    }
    return items[items.length - 1];
  }
}
