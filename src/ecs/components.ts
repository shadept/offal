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
// behaviour: 0 = idle, 1 = wander, 2 = seek
export const AI = soa({
  behaviour: new Uint8Array(MAX_ENTITIES),
});

export const AIBehaviour = {
  IDLE: 0,
  WANDER: 1,
  SEEK: 2,
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
export const ActedThisTurn = {}; // marks entities that have acted in current tick
export const Dead = {}; // marks entities pending removal
