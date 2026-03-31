# OFFAL — Data Schemas
*Reference for all JSON5 data file formats*

**Version**: 0.1
**Last updated**: 2026-03-31

All data files live under `data/`. The engine loads them at boot. No schema is hardcoded in game logic.

---

## Material

`data/materials/*.json5`

Defines the physical properties of any substance. Referenced by limbs, items, tiles, and environment features.

```json5
{
  id: "organic",
  tags: ["organic", "biological"],

  // Physical properties (0.0–1.0)
  flammability: 0.6,       // 0 = fireproof, 1 = ignites immediately
  conductivity: 0.1,       // electrical conductivity
  hardness: 0.3,           // resistance to cutting/impact
  mass: "medium",          // "feather" | "light" | "medium" | "heavy" | "massive"

  // How this material reacts to physical states
  reactsTo: {
    fire:        { effect: "burning",    threshold: 0.3 },
    water:       { effect: "wet",        threshold: 0.0 },
    electricity: { effect: "shocked",    threshold: 0.2 },
  },

  // Optional
  healsWith: ["food", "medical"],       // tags of items that restore this material
  bleedMultiplier: 1.0,                 // scaling factor for bleeding on severance
  byproductOnDestroy: "organic_chunk",  // item tag spawned when fully destroyed
}
```

---

## Item

`data/items/*.json5`

A thing in the world. Interactions are not defined here — they emerge from properties meeting the physics and crafting systems.

```json5
{
  id: "bandage",
  name: "Bandage",
  description: "Strips of cloth. Stops bleeding if applied to a wound.",

  material: "organic",
  shape: "sheet",    // "rod" | "point" | "sheet" | "vessel" | "chunk" | "composite"
  size: "small",     // "tiny" | "small" | "medium" | "large" | "huge"

  tags: ["medical", "consumable"],

  // Optional: if this item is a container
  fluidCapacity: null,
  contents: null,

  // Optional: combat properties
  damage: null,
  protection: null,

  // Optional: only present on potion-type items; value unknown until identified
  potionEffect: null,
}
```

---

## Recipe

`data/recipes/*.json5`

What can be made and under what conditions. Inputs match by tags/properties, not by item ID (use `id` only when a specific item is required).

```json5
{
  id: "blade_from_sheet_metal",

  inputs: [
    {
      tags: ["metal", "sheet"],  // matches any sheet-shaped metal item
      quantity: { min: 1 },
      consumed: true,
    },
    {
      tags: ["tool", "abrasive"], // any abrasive tool (not consumed)
      quantity: { min: 1 },
      consumed: false,
    },
  ],

  // Optional: constraints that disambiguate when multiple recipes could match
  conditions: [
    { environment: "workbench" },  // requires adjacent workbench tile
  ],

  output: {
    id: "crude_blade",
    quantity: 1,
  },

  // Optional: items produced alongside the main output
  byproducts: [
    { id: "metal_shavings", quantity: 1 },
  ],
}
```

When `output.id` is absent, use `output.derive` to compute the result from inputs:

```json5
output: {
  derive: {
    nameFrom: "inputs",         // name generated from input descriptions
    materialFrom: 0,            // inherits material from input[0]
    tagsFrom: [0, 1],           // union of tags from inputs 0 and 1
    sizeFrom: "largest_input",  // "largest_input" | "sum"
  },
  quantity: 1,
},
```

---

## Blueprint

`data/blueprints/*.json5`

A structural body archetype. Defines slot layout only. Does **not** declare locomotion — locomotion is derived at runtime from active slots.

```json5
{
  id: "biped_upright",
  name: "Biped (Upright)",
  description: "Two legs, two arms, upright torso. Hands free.",

  slots: [
    {
      id: "head",
      role: "head",               // "arm"|"leg"|"torso"|"head"|"back"|"segment"|"core"|"radial"
      position: "top",            // "front"|"back"|"left"|"right"|"top"|"bottom"|"radial_N"
      accepts: ["jaw", "sensor", "antenna"],
      default: { type: "jaw", material: "organic" },
      required: true,
    },
    {
      id: "torso",
      role: "torso",
      position: "front",
      accepts: ["torso"],
      default: { type: "torso", material: "organic" },
      required: true,
    },
    {
      id: "arm_left",
      role: "arm",
      position: "left",
      accepts: ["arm", "tentacle", "claw", "fin"],
      default: { type: "arm", material: "organic" },
      required: false,
    },
    {
      id: "arm_right",
      role: "arm",
      position: "right",
      accepts: ["arm", "tentacle", "claw", "fin"],
      default: { type: "arm", material: "organic" },
      required: false,
    },
    {
      id: "leg_left",
      role: "leg",
      position: "left",
      accepts: ["leg", "tentacle", "fin"],
      default: { type: "leg", material: "organic" },
      required: false,
    },
    {
      id: "leg_right",
      role: "leg",
      position: "right",
      accepts: ["leg", "tentacle", "fin"],
      default: { type: "leg", material: "organic" },
      required: false,
    },
  ],
}
```

---

## Species

`data/species/*.json5`

Extends a blueprint with biological/mechanical specifics. The player's starting options are species. Individuals are generated from species at spawn time.

```json5
{
  id: "salvager",
  name: "Salvager",
  extends: "biped_upright",

  // Override specific slots from the parent blueprint
  slotOverrides: {
    arm_left:  { default: { type: "arm", material: "organic" } },
    arm_right: { default: { type: "arm", material: "organic" } },
  },

  // Additional slots not in the blueprint
  extraSlots: [],

  defaultMaterial: "organic",

  size: { min: "medium", max: "large" },

  spawnTags: ["humanoid", "player_start"],
}
```

---

## FunctionRule

`data/function-rules.json5`

Maps `limbType × slotRole` to capabilities and stat modifiers. The engine reads this table; it has no hardcoded limb logic.

```json5
[
  {
    limbType: "tentacle",
    slotRole: "arm",
    grants: ["reach_attack", "grab"],
    modifies: [],
  },
  {
    limbType: "tentacle",
    slotRole: "leg",
    grants: ["wall_grip"],
    modifies: [{ stat: "move_speed", delta: -0.1 }],
  },
  {
    limbType: "tentacle",
    slotRole: "back",
    grants: ["flank_attack"],
    modifies: [],
  },
  {
    limbType: "claw",
    slotRole: "arm",
    grants: ["slash_attack", "climb"],
    modifies: [],
  },
  {
    limbType: "jaw",
    slotRole: "head",
    grants: ["bite_attack"],
    modifies: [],
  },
  // ... exhaustive list
]
```

---

## PhysicsRule

`data/physics-rules.json5`

Defines how physical states propagate. The physics system runs these rules generically — it does not know "fire" or "water" specifically.

```json5
[
  {
    trigger: "on_fire",
    propagatesTo: {
      condition: "adjacent AND target.material.flammability > 0.3",
      effect: "on_fire",
      delay: 2,  // turns before propagation
    },
    consumedBy: ["wet", "vacuum"],
    depletes: "oxygen",  // depletes this resource in enclosed spaces; null if none
  },
  {
    trigger: "wet",
    propagatesTo: null,
    consumedBy: [],
    depletes: null,
  },
  {
    trigger: "charged",
    propagatesTo: {
      condition: "adjacent AND target.material.conductivity > 0.5",
      effect: "charged",
      delay: 0,
    },
    consumedBy: [],
    depletes: null,
  },
]
```

---

## EcologyRule

`data/ecology-rules.json5`

Biases enemy generation based on the player's combat profile. Does not create new enemy types — adjusts spawn weights.

```json5
[
  {
    playerProfile: { tag: "fire_damage", threshold: 10 },
    spawnerBias:   { tag: "fire_resistant", weight: 2.0 },
  },
  {
    playerProfile: { tag: "head_target", threshold: 5 },
    spawnerBias:   { tag: "headless", weight: 1.8 },
  },
  {
    playerProfile: { tag: "electric_damage", threshold: 8 },
    spawnerBias:   { tag: "insulated", weight: 2.0 },
  },
]
```

---

## PotionEffect

`data/potion-effects.json5`

All possible potion effects. Shuffled and assigned to visual appearances at run start. Identity unknown until discovered.

```json5
[
  {
    id: "healing",
    tags: ["beneficial", "medical"],
    onDrink:  { effect: "restore_hp", value: 20 },
    onDip:    { effect: "apply_tag", tag: "medical", to: "item" },
  },
  {
    id: "transformation",
    tags: ["body", "chaotic"],
    onDrink:  { effect: "random_limb_material_change" },
    onDip:    { effect: "material_change", to: "item" },
  },
  // ...
]
```

---

## Unlock

`data/unlocks.json5`

Conditions that grant persistent meta-progression unlocks. No XP. Conditions are in-run events.

```json5
[
  {
    id: "unlock_serpentine_start",
    description: "Graft a segment limb",
    condition: { event: "graft", limbType: "segment" },
    grants: { type: "species", id: "serpentine_basic" },
  },
  {
    id: "unlock_fire_hull",
    description: "Die to your own fire",
    condition: { event: "death", cause: "on_fire", source: "self" },
    grants: { type: "hull", id: "scorched_freighter" },
  },
]
```

---

*SCHEMAS.md v0.1 — living document. Schemas evolve as implementation begins.*
