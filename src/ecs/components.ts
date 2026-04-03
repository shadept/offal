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
  attackDamageMin: new Int32Array(MAX_ENTITIES),
  attackDamageMax: new Int32Array(MAX_ENTITIES),
});

// ── Door ──────────────────────────────────────────────────────
// isOpen: 0 = closed, 1 = open
export const Door = soa({
  isOpen: new Uint8Array(MAX_ENTITIES),
});

// ── Teleporter ───────────────────────────────────────────────
// Paired teleporter pads — stepping on one warps to the linked pad.
// linkedEid: entity ID of the partner teleporter
export const Teleporter = soa({
  linkedEid: new Int32Array(MAX_ENTITIES),
});

// ── Body system ──────────────────────────────────────────────

// Part identity — links part entity to its definition
export const PartIdentity = soa({
  partDefId: new Uint16Array(MAX_ENTITIES),   // index into partDef registry
  typeId: new Uint8Array(MAX_ENTITIES),        // PartType enum value
  speciesId: new Uint16Array(MAX_ENTITIES),    // index into species registry
});

// Part material — physical material of a body part
export const PartMaterial = soa({
  materialId: new Uint8Array(MAX_ENTITIES),    // index into material registry
});

// Attached to — links part entity to parent creature
export const AttachedTo = soa({
  parentEid: new Int32Array(MAX_ENTITIES),     // creature entity ID
  slotId: new Uint16Array(MAX_ENTITIES),       // index into slot name registry
});

// Body — creature-level aggregate (present on creatures with body parts)
// Body HP is tracked via Health.hp/maxHp on the creature entity directly.
// Parts have their own Health.hp for severing thresholds.
export const Body = soa({
  speciesIdx: new Uint16Array(MAX_ENTITIES),   // species index for lookups
});

// Cached capacity — derived from functional attached parts
export const CachedCapacity = soa({
  mobility: new Uint8Array(MAX_ENTITIES),            // 0-100 percentage
  manipulation: new Uint8Array(MAX_ENTITIES),
  consciousness: new Uint8Array(MAX_ENTITIES),
  circulation: new Uint8Array(MAX_ENTITIES),
  structuralIntegrity: new Uint8Array(MAX_ENTITIES),
});

// ── Item system ──────────────────────────────────────────────

// Item identity — links item entity to its data definition
export const Item = soa({
  itemDefIdx: new Uint16Array(MAX_ENTITIES),   // index into item data registry
  materialIdx: new Uint8Array(MAX_ENTITIES),   // index into material registry
  stackCount: new Uint8Array(MAX_ENTITIES),    // 1 for non-stackable, N for stacks
});

// HeldBy — links an item to the creature carrying it (mutually exclusive with Position)
export const HeldBy = soa({
  ownerEid: new Int32Array(MAX_ENTITIES),      // creature entity ID
});

// Inventory — capacity component on creatures (and body-part containers)
export const Inventory = soa({
  capacity: new Uint16Array(MAX_ENTITIES),     // max volume units
  usedVolume: new Uint16Array(MAX_ENTITIES),   // current volume used
});

// ── Tag components (no data, just markers) ─────────────────────
export const PlayerTag = {};
export const BlocksMovement = {};
export const Dead = {}; // marks entities pending removal
