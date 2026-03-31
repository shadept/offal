# OFFAL — Game Design Document
*A roguelike about what you're made of*

**Version**: 0.1 (Draft)
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

## Core Systems

### 1. Modular Body System

Every entity (player, NPC, enemy) has a **morphology** — a base body plan:

| Morphology | Description |
|---|---|
| **Biped** | 2 legs, 2 arms, 1 torso, 1 head. Upright, hands free. |
| **Quadruped** | 4 legs, vestigial or no arms, 1 torso, 1 head. Fast, attacks with mouth/body. |
| **Radial** | N equal segments (3–8). No clear front/back. Attacks in arc or all directions. |
| **Serpentine** | Chained segments, no free limbs. Constricts, strikes with head. |
| **Blob** | Amorphous. Absorbs rather than grafts. Special case. |

**Morphology defines capabilities, not attack patterns.** A quadruped is fast and attacks with its body — it doesn't think about which pair of legs to use. A biped has free hands and can manipulate tools. A radial has no blind spots.

#### Limb slots and function

Each limb has a function determined by **type** and **position**:

- **Arm/tentacle in arm slot**: hold, attack, interact, throw
- **Tentacle in leg slot**: grip surfaces, unusual locomotion — but not a primary attack
- **Tentacle in back slot** (non-standard, created by grafting): flanking attack, unexpected reach — changes positioning entirely
- **Leg**: locomotion, stability, kick
- **Torso**: total HP, internal carry slots
- **Head**: vision range, detection, cognitive skills

More arms = more simultaneous equipment.
Losing a leg = movement penalty (not game over).
Losing the head = game over (probably).

Grafting in suboptimal positions creates interesting tradeoffs — and comedy. A biped who grafts an ogre arm onto a leg slot gets a leg that wants to hold things.

#### Limb materials

Every limb has a **material** with physical properties:

| Material | Properties |
|---|---|
| **Organic** | Heals with food, bleeds, burns |
| **Wood** | Light, burns well, can be crafted (weapon, fuel, furniture) |
| **Metal** | Heavy, conducts electricity, oxidizes in water, fireproof |
| **Crystal** | Fragile, refracts light/lasers, sharp when broken |
| **Vacuum-gas** (alien) | Light, explodes with spark, absorbs heat |
| **Stone** | Heavy, crushing damage, immune to fire, slow |

The same physics system that affects the environment affects your body. Wooden arm + fire = problem. Metal arm + water in a loop = slow oxidation debuff.

---

### 2. Elemental Physics

Simple properties that propagate consistently:

| Element | Behaviour |
|---|---|
| **Fire** | Spreads to adjacent flammables, consumes oxygen, extinguished by water/vacuum |
| **Water** | Extinguishes fire, conducts electricity, oxidizes metal |
| **Electricity** | Propagates through conductors, stuns organics, detonates gas |
| **Oxygen** | Feeds fire; closed rooms deplete; anaerobic creatures immune |
| **Pressure** | Vacuum vs pressurized — opening the wrong chamber has consequences |

These are not magic elements. They are physical properties the system resolves.
The player learns rules, not recipes.

---

### 3. Emergent Crafting

No recipe lists. Objects have properties; combinations produce the logically closest result.

**Examples:**
- Stick + nail = improved weapon
- Stick + nail × 4 + another stick = chair (useless but hilarious; throwable for furniture damage)
- Metal limb + magnetism = functional magnet (attracts projectiles, metallic enemies)
- Unknown potion + item = discover properties through result (no tooltip)
- Flammable powder + container = improvised grenade
- Wooden limb + nail = limb-weapon (your arm IS the weapon)

The system evaluates: materials + shape + quantity → nearest object in taxonomy.
If you cross the threshold from "tool" to "furniture", it's a chair. That's just how it is.

---

### 4. Alchemy / Potions

Potions have unknown effects per run (shuffled at start).
Discovery through use, item dipping, or combination:

- **Drink**: immediate effect, you learn the name
- **Dip item**: item gains property (or dissolves, or changes material)
- **Combine two potions**: unpredictable but systemically logical

Transformation potion + enemy limb = limb changes material.
Growth potion + vestigial limb = functional limb (or giant useless appendage).

---

### 5. Dismemberment

In combat, attacks target specific parts and damage that part directly — not a global HP pool.

- Destroy an arm = lose that slot + bleeding
- Destroy a leg = movement penalty
- Sever a limb = limb drops to the floor. You can pick it up and graft it.

This applies to the player too. Losing an arm mid-dungeon is not a run-ender — it's forced adaptation.

---

### 6. Adaptive Ecology

Enemies that survive encounters or inhabit rooms after the player passes through adapt:

- Use fire constantly → later rooms have fire-resistant enemies, or enemies that avoid burning floors
- Always kill by targeting the head → headless variants (radials, blobs) start appearing
- Use electricity → metallic enemies develop insulating adaptations

Not scripted. The system tracks the player's combat profile and generates enemies with natural counters.
Forces constant adaptation. No single build dominates an entire run.

---

### 7. Roguelike Progression

- Each run: different procedurally generated ship, different loot, different available morphologies
- Permadeath, but meta-progression unlocks (new morphology types, materials, potion types, ship variants)
- Difficulty increases with depth: more rooms, unstable pressurization, more adapted creatures
- Boss per deck (ship floor): unique creatures with absurd hybrid morphologies

---

## Visual & Technical

**Perspective**: 2D top-down
**Animation**: Modular sprites — each limb is an independent animated sprite. Hybrids compose animations from active limbs.
**Assets**: Kenney.nl packs (sci-fi, creatures, tiles) as base. Particle effects for fire, electricity, fluids.

**Stack**:
- TypeScript
- Phaser 3 (2D renderer)
- bitECS (Entity Component System)
- Vite (build/dev server)

---

## What's Original Here

1. **Position-dependent limb function** — the same limb type does different things depending on where it's grafted. A tentacle on your back creates flanking capability a normal biped never had.

2. **Limb material = physical property** — the same physics system affecting the world affects your body. Completely consistent, never siloed.

3. **Adaptive ecology** — enemies counter-evolve to your tactics during the run. Not seen in a real released roguelike.

4. **Taxonomy-based crafting** — no recipes, just logic. The accidental chair is systemic, not an easter egg.

---

*GDD v0.1 — living document*
