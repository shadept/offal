/**
 * bitECS 0.4 SoA components for OFFAL.
 * All game state lives here — Phaser never mutates these directly.
 */
import { soa } from 'bitecs';

const MAX_ENTITIES = 10_000;

// ── Grid position ──────────────────────────────────────────────
export const Position = soa({
  x: new Int32Array(MAX_ENTITIES),
  y: new Int32Array(MAX_ENTITIES),
});

// ── Visual representation ──────────────────────────────────────
// spriteKey is an index into a lookup table maintained by the scene
export const Renderable = soa({
  spriteIndex: new Uint16Array(MAX_ENTITIES),
  layer: new Uint8Array(MAX_ENTITIES), // 0=floor, 1=objects, 2=entities
});

// ── Time-energy turn scheduling ────────────────────────────────
export const Turn = soa({
  energy: new Float32Array(MAX_ENTITIES),
  speed: new Float32Array(MAX_ENTITIES),       // energy gained per tick
  actionCost: new Float32Array(MAX_ENTITIES),   // cost of last action taken
});

// ── Field of view ──────────────────────────────────────────────
export const FOV = soa({
  range: new Uint8Array(MAX_ENTITIES), // vision radius in tiles
});

// ── AI ────────────────────────────────────────────────────────
// state: 0 = idle, 1 = wander, 2 = seek, 3 = searching
export const AI = soa({
  state: new Uint8Array(MAX_ENTITIES),
  targetEid: new Int32Array(MAX_ENTITIES),      // -1 = no target
  lastKnownX: new Int32Array(MAX_ENTITIES),     // -1 = none
  lastKnownY: new Int32Array(MAX_ENTITIES),     // -1 = none
  searchBudget: new Uint8Array(MAX_ENTITIES),
  cachedTargetX: new Int32Array(MAX_ENTITIES),  // path cache: target pos
  cachedTargetY: new Int32Array(MAX_ENTITIES),
  lastDirX: new Int8Array(MAX_ENTITIES),        // last wander direction
  lastDirY: new Int8Array(MAX_ENTITIES),
});

export const AIState = {
  IDLE: 0,
  WANDER: 1,
  SEEK: 2,
  SEARCHING: 3,
} as const;

// ── Health ────────────────────────────────────────────────────
export const Health = soa({
  hp: new Int32Array(MAX_ENTITIES),
  maxHp: new Int32Array(MAX_ENTITIES),
});

// ── Faction ───────────────────────────────────────────────────
// factionIndex: index into a runtime string→number mapping
export const Faction = soa({
  factionIndex: new Uint8Array(MAX_ENTITIES),
});

// ── Combat stats ──────────────────────────────────────────────
export const CombatStats = soa({
  attackDamage: new Int32Array(MAX_ENTITIES),
});

// ── Tag components (no data, just markers) ─────────────────────
export const PlayerTag = {};
export const BlocksMovement = {};
export const Dead = {}; // marks entities pending removal
