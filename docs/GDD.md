# OFFAL — Game Design Document
*A roguelike about what you're made of*

**Version**: 0.2
**Last updated**: 2026-03-31

---

## Logline

A browser-based turn-based roguelike set in a ship graveyard in deep space. Your body is modular — you graft limbs from enemies, craft with whatever's at hand, and everything interacts with simple physics. The result is systematically logical and frequently absurd.

---

## Setting

**Shipwreck Nebula** — a graveyard of vessels in deep space, each procedurally generated. Technology is steam-punk meets biomechanics: creatures that evolved in isolation for decades, things with radial symmetry floating in zero-gravity corridors, metallic quadrupeds that rusted until they became alive, bipeds so heavily grafted they're barely recognizable.

You are a **Salvager**. Your job was simple — enter, recover cargo, exit. It did not go well.

The comedy is not forced. It emerges from a universe where everything is biomechanical and nothing works as intended.

---

## Architecture: Data-Driven by Default

Every piece of game content — materials, items, recipes, morphologies, enemies, physical properties — lives in **data files** ([JSON5](https://json5.org)). JSON5 is a superset of JSON that allows unquoted keys, comments, trailing commas, and single-quoted strings — same structure as JSON, less visual noise. The engine loads these files at boot and builds the world from them.

The engine knows about *systems*: physics, crafting, combat, grafting, ecology.  
The engine does **not** know about *content*: it has no hardcoded reference to any specific material, item, or creature.

This means:
- Adding a new material = writing a JSON5 file, no code change
- Adding a new recipe = writing a JSON5 file, no code change
- The crafting system reasons over properties, not IDs

---

## Data Schemas

### Material Definition

Materials define the physical properties of any substance. Limbs, items, tiles, and environmental elements all reference a material.

```
Material {
  id: string                   // unique identifier
  tags: string[]               // semantic categories (e.g. "organic", "metal", "alien")
  
  // Physical properties (0.0–1.0 unless noted)
  flammability: float          // 0 = fireproof, 1 = ignites immediately
  conductivity: float          // electrical conductivity
  hardness: float              // resistance to cutting/impact
  mass: "feather"|"light"|"medium"|"heavy"|"massive"
  
  // Reactive properties
  reactsTo: {
    fire?:         { effect: EffectId, threshold: float }
    water?:        { effect: EffectId, threshold: float }
    electricity?:  { effect: EffectId, threshold: float }
    pressure?:     { effect: EffectId, threshold: float }
  }
  
  // Optional
  healsWith?: string[]         // tags of items that restore this material (e.g. ["food"] for organic)
  byproductOnDestroy?: ItemTag // what drops when fully destroyed (e.g. "shard" for crystal)
}
```

### Item Definition

Items are compositions of materials and shape. They do not hardcode interactions — those emerge from their properties.

```
Item {
  id: string
  name: string
  description: string
  
  material: MaterialId
  shape: "rod"|"point"|"sheet"|"vessel"|"chunk"|"composite"
  size: "tiny"|"small"|"medium"|"large"|"huge"
  
  tags: string[]               // e.g. ["weapon", "tool", "consumable", "limb", "fuel"]
  
  // Optional physical state
  fluidCapacity?: float        // if vessel: how much it holds
  contents?: FluidId           // current fluid (for potions, containers)
  
  // Optional functional properties
  damage?: { type: DamageType, value: float }
  protection?: { type: DamageType, value: float }
  
  // Potion identity (shuffled per run — see Alchemy section)
  potionEffect?: EffectId      // only known after identification
}
```

### Recipe Definition

Recipes describe *what can be made* and *under what conditions*. They match against item properties, not IDs, except when specificity is required.

```
Recipe {
  id: string
  
  inputs: InputSpec[]          // what must be combined
  conditions?: ConditionSpec[] // optional constraints on the combination
  output: OutputSpec           // what is produced
  
  // Optional
  byproducts?: OutputSpec[]    // incidental outputs
  tool?: ToolRequirement       // required tool quality (not a specific item)
}

InputSpec {
  // Match by tags OR by id (use tags when possible)
  tags?: string[]              // e.g. ["wood", "rod"] — matches any rod-shaped wooden item
  id?: string                  // use only when a specific item is required
  
  quantity: { min: int, max?: int }
  consumed: boolean            // true = item is destroyed in process
}

ConditionSpec {
  // Constraints that affect which recipe fires when multiple could match
  input[n].quantity: ComparisonExpr   // e.g. "< 4" on a specific input slot
  input[n].material: MaterialId
  environment: EnvironmentTag  // e.g. "fire_adjacent", "pressurized"
}

OutputSpec {
  id?: string                  // known item
  derive?: DeriveRule          // computed from inputs (see below)
  quantity: int
}

DeriveRule {
  // When the output is not a known item but is computed from inputs
  // Used for the fallback tier and for composite outputs
  nameFrom: "inputs"           // name generated from input descriptions
  materialFrom: InputRef       // inherits material from a specific input
  tagsFrom: InputRef[]         // inherits tags from inputs
  sizeFrom: "largest_input"|"sum"
}
```

### Morphology Definition

Morphologies define the body plan of any entity. They are not creature types — they are structural templates. A creature definition references a morphology.

```
Morphology {
  id: string
  name: string
  
  slots: BodySlot[]
  locomotion: LocomotionType   // "biped"|"quadruped"|"radial"|"serpentine"|"blob"
  
  // Derived from slots at load time — not manually defined
  // attackCapability: computed
  // carryCapacity: computed
}

BodySlot {
  id: string                   // e.g. "arm_left", "leg_front_right", "back_1"
  role: SlotRole               // "arm"|"leg"|"torso"|"head"|"back"|"core"
  
  // What can be placed here
  accepts: LimbType[]          // e.g. ["arm", "tentacle", "claw"]
  
  // Default occupant (can be empty = stump from start)
  default?: LimbDefinition
  
  // Position affects function resolution
  position: "front"|"back"|"left"|"right"|"top"|"radial"
}
```

### Limb Definition

Limbs are items with the "limb" tag and a morphology attachment point.

```
LimbDefinition {
  type: LimbType               // "arm"|"leg"|"tentacle"|"claw"|"jaw"|"fin"|...
  material: MaterialId
  
  hp: int                      // this limb's individual HP pool
  size: SizeClass
  
  // Function is NOT defined here — it is resolved by the slot it occupies
  // See: Function Resolution
}
```

### Function Resolution

The function of a limb is determined by its **type × slot role × locomotion**.

The engine resolves this via a lookup table defined in data, not in code:

```
FunctionRule {
  limbType: LimbType
  slotRole: SlotRole
  locomotion: LocomotionType   // optional — if absent, applies to all
  
  grants: Capability[]         // what the entity can now do
  modifies: StatModifier[]     // changes to speed, carry, etc.
}
```

Examples of what this table expresses (in data, not here as canonical):
- tentacle in arm role → grants reach_attack, grants grab
- tentacle in leg role → grants wall_grip, modifies speed
- tentacle in back role → grants flank_attack
- claw in arm role → grants slash_attack, grants climb
- jaw in head role → grants bite_attack
- additional arm → grants equipment_slot

The table is exhaustive and lives in `data/function-rules.json5`. The code only reads the table.

---

## Systems

### Physics System

Processes propagation of physical states across tiles and entities.

State propagation is defined in data (`data/physics-rules.json5`):
```
PhysicsRule {
  trigger: PhysicalState       // e.g. "on_fire"
  propagatesTo: {
    condition: string          // e.g. "adjacent AND target.material.flammability > 0.5"
    effect: EffectId
    delay: int                 // turns before propagation
  }
  consumedBy: PhysicalState[]  // e.g. "on_fire" consumed by "wet"
  depletes: ResourceId?        // e.g. "on_fire" depletes "oxygen" in enclosed spaces
}
```

The physics system does not know about fire, water, or electricity specifically. It processes PhysicsRules.

---

### Crafting System

The crafting system has two tiers:

**Tier 1 — Recipe matching**
1. Player initiates combine action with N items
2. System evaluates all items' tags, materials, shapes, sizes
3. Finds all recipes where InputSpecs match the provided items
4. If exactly one recipe matches: execute it
5. If multiple match: present player with options (ambiguity is intentional — same inputs, different intent)
6. If zero match: fall through to Tier 2

**Tier 2 — Fallback**  
When no recipe matches:
- Short-term: produce a "crude composite" item — tags are union of inputs, name is "crude [dominant material] [dominant shape]", stats are averaged. Always produces *something*.
- Long-term (Phase 6+): pass inputs to local LLM for description + sprite generation. Result is cached and registered as a new item definition for the run.

The crafting system is **not** the arbiter of what's logical — the data is. The system only resolves rules.

---

### Alchemy System

Potions are items with the `consumable` and `potion` tags and an unknown `potionEffect`.

At run start: all potion effects are shuffled and assigned to visual appearances. The mapping is not revealed to the player.

Discovery methods:
- **Drink**: effect fires immediately, identity revealed
- **Dip item**: item gains an effect derived from the potion's properties. If the potion effect and item material are incompatible, nothing happens (safe failure)
- **Combine**: two potions combined produce a result computed by the physics/crafting system treating fluids as materials with their own tags

Potion effects are defined in `data/potion-effects.json5` — they are not hardcoded.

---

### Body System

Manages the state of all modular bodies.

On entity creation: morphology is loaded, slots are populated from LimbDefinitions, capabilities are computed via FunctionRule lookup.

On limb damage:
- Damage applied to limb HP pool
- At 0 HP: limb enters `severed` state, drops as item, slot becomes stump
- Capabilities derived from that slot are removed
- Movement/combat penalties recalculated

On graft:
- Player applies a limb item to a compatible stump
- Compatibility checked: slot.accepts must include limb.type
- Capabilities added per FunctionRule
- Material of new limb is now part of the entity — physics system applies accordingly

---

### Adaptive Ecology System

Tracks a **combat profile** for the current run: a vector of tagged action frequencies (e.g., `{fire_damage: 12, slash_damage: 8, head_target: 5}`).

Enemy generation in unexplored rooms samples this profile and biases toward entities whose properties counter the dominant tags.

Bias rules are defined in `data/ecology-rules.json5`:
```
EcologyRule {
  playerProfile: { tag: string, threshold: int }  // "if player used fire_damage > 10"
  spawnerBias: { tag: string, weight: float }      // "increase weight of fire_resistant enemies by 2x"
}
```

The system does not generate new enemy types — it adjusts weights in the existing spawn table. Counter-evolution is gradual, not sudden.

---

## Procedural Generation

Ships are generated per run. Each ship has:
- A **hull type** (freighter, research vessel, colony ship) — determines tile palette and room density
- N **decks** — each deck is a connected graph of rooms
- A **boss room** at the bottom of each deck

Room generation uses a BSP (Binary Space Partition) algorithm with connection corridors. Room contents (enemies, items, environmental features) are populated from weighted tables biased by deck depth.

All generation parameters live in `data/generation/`.

---

## Meta Progression

Persistent across runs (stored in browser localStorage):

- **Unlocks**: new morphology types, materials, ship hull types, potion effect pool size
- **Codex**: discovered item/material/creature entries (read-only encyclopedia)
- **Run history**: cause of death, depth reached, notable events

Unlocks are earned by satisfying conditions defined in `data/unlocks.json5`. No XP, no level-up screens — conditions are things like "reach deck 3", "graft a non-organic limb", "die to your own fire".

---

## AI-Assisted Generation (Phase 6+)

When Tier 2 crafting fallback fires and the platform supports it:

1. Item properties (material tags, shape, size, input descriptions) are passed to a quantized local LLM (target: <2GB VRAM, WebGPU)
2. LLM returns: item name, short description, dominant use tag
3. Sprite is generated procedurally from the use tag + material (pixel art synthesis, no diffusion model)
4. Result is registered as a run-local item definition and cached

Graceful degradation: if LLM unavailable, Tier 2 produces the crude composite without description. Player never blocked.

---

## Visual & Technical

**Perspective**: 2D top-down  
**Rendering**: Phaser 3  
**ECS**: bitECS  
**Build**: Vite + TypeScript  
**Assets**: Kenney.nl (CC0) as base  

**Sprite system**: Each limb is an independent sprite layer. Hybrid bodies compose from active limb sprites. Animations are defined per limb type, not per full-body configuration.

---

## What's Original Here

1. **Property-matched recipes** — recipes match against item properties and tags, not specific IDs. The system reasons about materials, not about named objects.

2. **Position-dependent limb function via data table** — the same limb type does different things depending on where it's grafted. Defined entirely in data, not in code.

3. **Limb material = entity physics** — the same physics system that affects the world applies to the entity's body. No special cases.

4. **Adaptive ecology** — enemy spawn bias counter-evolves to the player's combat profile. Defined in data rules, not scripted.

5. **Two-tier crafting with graceful fallback** — known recipes for consistency, LLM fallback for infinite possibility.

---

*GDD v0.2 — living document*
