# Body System

> Companion to GDD.md Section 2. Implementation-level design for the modular body system.

---

## Data Hierarchy

```
Faction  (political — drives relations)
  └─ Species  (biology + body plan + wound behaviour + part layout)
       └─ Individual  (runtime instance — actual part states, damage, status effects)
```

---

## Parts

Parts are ECS entities. A part can be a limb, an organ, a sensor, a weapon — anything attached to a body. A part can be attached to a body, on the floor, on fire, wet, corroding, or hostile. The same physics that applies to tiles and items applies to parts.

### Part Data Files

`data/parts/*.json5`

```json5
{
  id: "human_arm",
  name: "Human Arm",
  type: "arm",                   // capability role: arm, leg, head, organ, sensor, mouth, segment, rotor
  species: "salvager",           // species of origin — drives wound response, decay, visuals
  material: "organic",           // drives physics interactions (burning, conductivity, etc.)
  maxHp: 15,
  hitWeight: 15,                 // targeting weight for damage rolls
  depth: "external",             // "external" | "internal"

  // Biology
  woundEffect: "bleeding",      // status applied to body on severance (null for inert)
  detachedDecayRate: 2,          // HP lost per turn when detached (0 = stable)
  onDetach: null,                // null or DetachAction (see below)

  // Combat (optional — present when the part is itself a weapon)
  weaponDamage: null,
  weaponRange: null,
  weaponDamageType: null,        // "blunt" | "cut" | "stab" | "energy"
}
```

### Part States

| State | HP | Attached | Effect |
|---|---|---|---|
| **Functional** | > 0 | yes | Normal operation, contributes to capacities |
| **Deactivated** | 0 | yes | Dead weight (mass cost, no capability). Healable. |
| **Severed** | > 0 | no | On floor as entity. Body receives wound effect. |
| **Destroyed** | 0 | no | Leaves remains: scrap, inert flesh, debris. |

### State Transitions

```
Functional ──(HP reaches 0)──► Deactivated
Functional ──(critical/precise hit severs)──► Severed
Deactivated ──(healing)──► Functional
Deactivated ──(severance)──► Severed
Severed ──(HP reaches 0 on floor)──► Destroyed (becomes remains)
Severed ──(reattachment)──► Functional or Deactivated
```

### Severance

A part is severed when:
- A critical or precise hit exceeds a severance threshold (even with HP > 0)
- Voluntary amputation with a bladed item

On severance:
1. Part entity detached from body
2. Part entity receives Position (dropped on current tile)
3. Body receives wound effect from the part's `woundEffect` field
4. Body capacities recalculate
5. Visual events fire: severance animation, part appears on ground

---

## Species

Species defines biological identity and body plan in a single data file.

`data/species/*.json5`

```json5
{
  id: "salvager",
  name: "Salvager",
  description: "Corporate clone. Expendable.",
  faction: "corporation",
  fovRange: 8,
  color: "#00ff88",
  spawnTags: ["humanoid"],

  baseSpeed: 100,
  parts: [
    { id: "head",    role: "head",   position: "top",      default: "human_head" },
    { id: "torso",   role: "torso",  position: "front",    default: "human_torso" },
    { id: "arm_l",   role: "arm",    position: "left",     default: "human_arm" },
    { id: "arm_r",   role: "arm",    position: "right",    default: "human_arm" },
    { id: "leg_l",   role: "leg",    position: "left",     default: "human_leg" },
    { id: "leg_r",   role: "leg",    position: "right",    default: "human_leg" },
    { id: "eyes",    role: "sensor", position: "top",      default: "human_eyes" },
    { id: "heart",   role: "organ",  position: "internal", default: "human_heart" },
    { id: "lungs",   role: "organ",  position: "internal", default: "human_lungs" },
    { id: "stomach", role: "organ",  position: "internal", default: "human_stomach" },
  ],

  compatibleWith: ["organic"],
  requiredParts: ["heart", "lungs", "head"],
  locomotionBaseline: "biped",
}
```

The `parts` list is the default body shape for the species — what it spawns with. It is not a hard constraint. Parts can be added beyond this layout if the heart supports it.

### Species Body Plans

| Species | Material | Limbs | Organs | Locomotion |
|---|---|---|---|---|
| salvager | organic | head, torso, arm_L, arm_R, leg_L, leg_R, eyes | heart, lungs, stomach | biped |
| security_bot | metal | head, torso, arm_L, arm_R, leg_L, leg_R, sensors | power_core | biped |
| void_rat | organic | head, torso, leg_FL, leg_FR, leg_BL, leg_BR, eyes | heart, lungs, stomach | quadruped |
| drone_scout | metal | torso (core), rotor_L, rotor_R, sensors | power_core | hover |
| hull_leech | organic | mouth, segment, eyes | heart, stomach | serpentine |

### Required Parts

Each species defines `requiredParts` — parts that must remain functional (attached and HP > 0) for survival. Can be organs or external parts.

- **Heart / power_core**: circulation/power. Loss = rapid death.
- **Lungs**: respiration. Required only by species that breathe atmosphere. Species without lungs are immune to vacuum and toxic gas.
- **Head**: consciousness (the part itself contributes to consciousness capacity). Required by most species.

Parts not in `requiredParts` are non-fatal to lose. A stomach is not required — losing it blocks food-based healing, leading to eventual death by starvation, but not immediate death.

A player can voluntarily sever any part, including required ones. The system does not prevent it.

### Heart Capacity

The heart (or power_core) determines the maximum number of parts the body supports at full performance.

The default heart supports:
- **6 limbs** (e.g., 2 legs, 2 arms, 1 head, 1 extra)
- **~4 organs** (not counting itself — e.g., eyes, stomach, lungs, and room for one more)

Parts beyond heart capacity suffer performance penalties. Upgrading the heart is a meaningful progression milestone — it directly enables larger body configurations.

This applies equally to all species. A gelatinous blob's heart has the same relative capacity as a human's.

---

## Damage Targeting

Weighted random by size/exposure, damage type filters valid targets, then armor.

### 1. Select Target Part

Roll weighted random across all attached parts. Weight = part's `hitWeight`.

Depth filter applied before the roll:
- **Blunt / cut**: `depth: "external"` only
- **Stab / pierce**: external and internal
- **Energy**: external and internal

### 2. Resolve Armor

After part selection, before damage application. Hook exists in the damage pipeline for future armor system.

### 3. Apply Damage

Damage applied to selected part's HP. If HP reaches 0, part becomes deactivated. If a severance threshold is met, part is severed instead.

---

## Wound Effects

Wound effects are species-driven. Material governs physics (burns, conducts). Species governs biology (what happens when flesh is torn).

| Species type | Wound effect | Behaviour |
|---|---|---|
| Organic | `bleeding` | Stacks per severance, drains HP over time, kills if untreated |
| Robotic | `sparking` | Energy drain or localised malfunction |
| Plant-creature | species-specific | May be inert, may spawn hostile entity |
| Crystal | `fracture_propagation` | Crack spread to adjacent parts |

### Detached Part Behaviour

Passive decay is driven by `detachedDecayRate` (HP lost per turn on floor, 0 = stable).

Active behaviour on severance is driven by `onDetach` — a discriminated union. Each action type maps to a handler in code; parameters are data-driven.

```json5
// Most parts — no special behaviour
onDetach: null

// Part gains AI, fights independently
onDetach: { action: "become_hostile", faction: "same" }

// Part explodes on severance (onlyViolent: true = not on gentle amputation)
onDetach: { action: "explode", damage: 10, radius: 2, onlyViolent: true }

// Part flails randomly, attacking adjacent tiles for N turns then stops
onDetach: { action: "flailing", turns: 3, damage: 4 }

// Part releases gas on severance
onDetach: { action: "release_spores", gas: "fungal_spores", concentration: 0.6 }

// Part seeks original or compatible host; falls back if none available
onDetach: { action: "seek_host", fallback: "become_hostile" }
```

---

## Capacity Derivation

Derived from functional parts. Cached and recomputed on part attachment, removal, or state change.

| Capacity | Source | At zero |
|---|---|---|
| Mobility | Leg / segment / rotor parts | Cannot move (or crawl) |
| Manipulation | Arm / tentacle / claw parts | Cannot interact or attack with arms |
| Consciousness | Head + pain/blood loss | Incapacitated |
| Circulation | Heart / power_core | Part performance degrades, eventual death |
| Structural Integrity | Torso / core | Death |

### Speed

Base speed ~100 (unitless). Meaningful changes only at extremes:

- No legs (species that expects legs): crawling, ~50% speed
- One leg (biped): hobbling, significant penalty
- Extra legs beyond baseline: diminishing returns, +10-20 max

Penalties are relative to `locomotionBaseline`. A hull leech with no legs moves normally (serpentine). A human with no legs crawls.

---

## Part Compatibility

Each species defines `compatibleWith` — material types its biology natively accepts.

- Human: `["organic"]`
- Robot: `["metal"]`

Compatibility is expandable at runtime through augments (e.g., neuro chip adds `"metal"` to a human's list). The system is generic — any species can have augments that modify compatibility.

---

## ECS Implementation

Every part is a full ECS entity. Every creature with a body is also an ECS entity. They are linked at runtime.

### Part Entity Components

| Component | Fields | Notes |
|---|---|---|
| `Health` | hp, maxHp | same component used by all damageable entities (creatures, doors, parts, furniture) |
| `PartIdentity` | partDefId, type, species | reference to data file, role, origin |
| `Material` | materialId | reference to material data |
| `AttachedTo` | parentEid, slotId | present when attached to a body; removed on severance |
| `Position` | x, y | present when on the floor; removed when attached |
| `Renderable` | spriteIndex, layer | present when visible (on floor or as remains) |

`Health` is shared infrastructure. Damage systems, healing systems, and status effects operate on `Health` regardless of whether the entity is a creature, a part, or a door.

Any entity (part, item, weapon) exists in exactly one of three mutually exclusive location states:

| State | Components present | Meaning |
|---|---|---|
| On the floor | `Position`, `Renderable` | Independent world entity |
| Attached to a body | `AttachedTo` | Part of a creature's body |
| In an inventory | `HeldBy` (future) | Stored in a container or backpack |

These are exclusive — an entity has exactly one. Transitioning between states means removing one set and adding the other.

Part functional state is derived from HP: `hp > 0` = functional, `hp === 0` = deactivated.

### Body Entity Components

| Component | Fields | Notes |
|---|---|---|
| `Health` | hp, maxHp | body HP pool — independent from part HPs, set from species.maxHp |
| `Body` | speciesIdx, mobility, manipulation, consciousness, circulation | capacities recomputed on part changes |

### Damage Model

Body HP is an independent pool, not derived from summing part HPs. When a part is hit:
1. Part local HP is reduced (for severing threshold)
2. Body HP is reduced by the same damage amount
3. If part local HP reaches 0: severed (external limbs) or deactivated (organs)
4. If body HP reaches 0: creature dies
5. Torso/segment parts cannot be severed — they stay attached even at 0 local HP

If no parts can be targeted (all destroyed), damage goes directly to body HP.

Existing components remain: `Turn`, `AI`, `FOV`, `Faction`, `PlayerTag`.

### Part Lookup Index

`Map<parentEid, partEid[]>` maintained alongside ECS. Updated on attach/detach. Enables fast per-creature part queries without scanning all part entities in the world.

---

## Visual Events

| Event | Trigger |
|---|---|
| `part_hit` | Damage to specific part. Shows part name and damage in combat log. |
| `part_severed` | Part cut from body. Severance animation, part sprite appears on ground. |
| `part_deactivated` | Part reaches 0 HP while attached. Visual dims/greys out. |
| `part_destroyed` | Part reaches 0 HP on floor. Becomes remains (scrap, debris, organic matter). |

Combat feedback: "void_rat bites your left leg for 5 damage."

---

## UI

- **Body diagram panel**: all parts and their states. HP, material, status effects per part.
- **Game view**: text notifications for hits, severance, state changes.
- **Inspect panel**: expanded to show part-level detail for any entity.

---

*v1.0 — 2026-04-03*
