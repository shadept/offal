# OFFAL — Game Design Document

> A browser-based turn-based roguelike set in a ship graveyard in deep space.  
> You are an expendable clone. Your body is your only tool. Everything interacts.

**Version**: 1.0  
**Status**: Active  
**Last updated**: 2026-03-31  
**Related**: [SCHEMAS.md](SCHEMAS.md) · [BACKLOG.md](BACKLOG.md)

---

## 1. Concept

### 1.1 Premise

You are a clone produced by a corporation to salvage derelict ships in the Shipwreck Nebula. You are expendable. When you die, the corporation prints another one and sends them in. The knowledge you accumulate persists; you do not.

The setting is steam-punk biomechanics. Technology and biology have merged over decades of isolation. Creatures aboard these ships are not generic monsters — they evolved, adapted, grafted, and survived. The ships themselves are environments in decay: failing systems, pressurisation leaks, fires, creatures that moved in when the crew moved out.

The comedy is not written in. It emerges from consistent systems meeting player improvisation.

### 1.2 Pillars

| Pillar | What it means in practice |
|---|---|
| **Every advantage has risk** | Grafting, amputation, body modification — all carry real danger. No free upgrades. |
| **The system is the designer** | Interactions emerge from data rules, not scripted events. Fire burns wood. That's enough. |
| **The body is progression** | No XP, no levels. What you are is what you've grafted and survived with. |
| **The world existed before you** | Factions have agendas. Situations are already in progress when you board. |
| **Death by accumulation** | Lethal situations are readable before they become fatal. The experienced player wins consistently. |
| **No correct playstyle** | Stealth, combat, and faction manipulation are structurally equal paths. |

### 1.3 Design Philosophy

**Depth, not complexity.** Depth: existing rules produce consequences the player can anticipate. Complexity: the player must learn new rules to understand what happened. Every system should pass this test — can the player infer the outcome before reading it?

**Healthy systems are invisible.** Organs, capacities, and status effects do not generate UI noise when functioning normally. Information surfaces when it becomes relevant, not before.

---

## 2. Body System

The body is the character sheet. There are no levels, no attribute points. What you can do is determined by what your body is made of.

### 2.1 Structure

Every entity has a **body** composed of **slots**. Each slot holds one **limb**. Slots have a role (arm, leg, torso, head, back, segment, radial) and a position (left, right, front, back, top, etc.).

Bodies are defined in a hierarchy:
- **Blueprint** — slot layout only. No declared locomotion.
- **Species** — extends a blueprint. Sets default materials, size range, slot variations.
- **Individual** — runtime instance of a species. Holds actual limb states, HP, status effects.

### 2.2 Locomotion

Locomotion type is **derived** from active leg/segment/radial slots — never declared. It recalculates whenever a limb is gained or lost.

| Active slots | Derived locomotion |
|---|---|
| ≥2 functional legs, upright torso | Biped |
| ≥4 functional legs, low torso | Quadruped |
| ≥3 segment slots, no legs | Serpentine |
| ≥3 radial slots | Radial |
| Core only | Amorphous |

Changing locomotion applies a `locomotion_unfamiliar` status effect. Performance penalty fades through use (action-based, not time-based). Capability is never blocked — only speed and timing are penalised.

### 2.3 Limb Function

A limb's function is determined by **type × slot role**, resolved via a data table (`data/function-rules.json5`). The engine has no hardcoded limb logic.

Examples:
- Tentacle in arm slot → reach attack, grab
- Tentacle in leg slot → wall grip, movement modifier
- Tentacle in back slot → flanking attack
- Additional arm slot → equipment slot

Same limb type, different slot, different capability.

### 2.4 Limb Materials

Every limb has a material with physical properties. The same physics system that applies to the environment applies to the body.

| Material | Notable properties |
|---|---|
| Organic | Burns, bleeds, heals with food |
| Wood | Burns well, craftable, light |
| Metal | Conducts electricity, oxidises in water, fireproof |
| Crystal | Fragile, refracts light, shatters into shards |
| Stone | Heavy, crushing damage, fire-immune |
| Vacuum-gas | Light, explodes with spark |

### 2.5 Internal Organs

Three internal organs live in the torso as non-external slots. They cannot be grafted in normal combat but can be damaged by penetrating attacks or status effects that spread inward.

| Organ | Function | Failure |
|---|---|---|
| **Heart** | Irrigates limbs. Max fully-functional limbs = heart capacity. | Extra limbs lose performance; heart failure = rapid death |
| **Lungs** | Breathing. Linked to oxygen/pressure/gas system. | Faster death in low-O₂ or toxic environments; immune on robotic entities |
| **Stomach** | Eating heals organic tissue. | Damaged = blocked eating; severe = starvation timer |

The heart is the **natural cap on body evolution**. Grafting past capacity is possible but penalised. Heart upgrades are rare and high-risk — a meaningful progression milestone, not a menu item.

The three organs interact: full stomach improves heart efficiency; damaged lungs reduce consciousness; damaged heart starves peripheral limbs before killing.

### 2.6 Status Effects

Any condition that modifies normal body state is a **StatusEffect** — wounds, diseases, environmental effects, graft states. StatusEffects attach to a slot or globally and modify capacities/stats.

| Status effect | Source | Behaviour |
|---|---|---|
| `bleeding` | Limb loss | Stacks, reduces Consciousness, kills if untreated |
| `burning` | Fire contact | Spreads to adjacent flammable limbs |
| `oxidising` | Metal + water | Progressive degradation |
| `infected` | Untreated wound | Severity vs immunity race — spreads if severity wins |
| `rejected` | Material mismatch graft | Timed detachment with additional bleeding |
| `locomotion_unfamiliar` | Locomotion change | Speed/action penalty, fades with use |

The engine processes StatusEffects generically. New effects are added in data.

### 2.7 Body Capacities

Computed each turn from active slots and status effects. Not stored.

| Capacity | Source | At zero |
|---|---|---|
| Mobility | Leg slots | Cannot move |
| Manipulation | Arm slots | Cannot interact |
| Consciousness | Head slot + pain/blood loss | Incapacitated |
| Circulation | Heart | Limb performance degrades |
| Structural Integrity | Torso/core | Death |

### 2.8 Limb Loss and Grafting

**Limb loss** (combat or voluntary): limb drops as floor item, slot becomes stump, `bleeding` applied. Treatment required: bandage (reduces severity), cauterise (stops bleed, damages stump), medical item (stops + heals), organic graft (seals wound on attachment).

**Voluntary amputation**: available with any bladed item. Confirmed action. Causes `bleeding` immediately. The severed limb drops and can be picked up. There is no safe amputation.

**Grafting**: costs turns. Requires compatible slot, manageable bleed level, compatible size. Material mismatch applies `rejected` status effect. Grafting is never free.

---

## 3. Physics System

Physical states propagate according to data-defined rules (`data/physics-rules.json5`). The engine runs these rules; it has no hardcoded knowledge of specific states.

| State | Propagates to | Consumed by |
|---|---|---|
| Fire | Adjacent flammables (flammability > threshold) | Water, vacuum |
| Electricity | Adjacent conductors (conductivity > threshold) | — |
| Pressure | Enclosed spaces when fire + water coexist | Rupture event |
| Gas | Adjacent tiles (in enclosed spaces) | Ventilation, fire |

Environmental states affect limbs by material. A wooden arm in a burning room will catch fire. A metal arm in standing water conducts electricity to anything touching the entity.

---

## 4. Crafting System

No recipe list shown to the player. Two tiers:

**Tier 1 — Recipe matching**: inputs are evaluated by tags, material, shape, and size against known recipes. Multiple matches offer a player choice. Recipes are defined in `data/recipes/`.

**Tier 2 — Fallback**: unrecognised combinations always produce a crude composite with merged tags and averaged properties. In a later phase, a local lightweight LLM will generate a name and description; sprite synthesis follows. Graceful degradation if unavailable — the crude composite always works.

Alchemy (potions) integrates with this system: potions are fluids with properties. Dipping an item in a potion applies the fluid's properties to the item. Combining two potions runs the same recipe evaluation as any other combination.

Potion identities are shuffled per run. Discovered by use.

---

## 5. AI and Factions

### 5.1 No Faction Exists Because of the Player

Every entity aboard a ship has its own reason to be there. The player is one more variable in an ongoing situation. The question on boarding is not "clear the dungeon" — it is "what's happening here, and how do I survive it?"

### 5.2 Factions

| Faction | Default behaviour |
|---|---|
| Security systems | Attack any unauthorised entity. Coordinate via internal comms. |
| Pirates/scavengers | Loot. Social — groups in large ships. Investigate noise, call backup, may flee creatures. |
| Colonising creatures | Territorial. Attack nearest threat regardless of faction. |
| Captive animals | Passive in containment. Chaotic if freed. Predators attack everything. |
| Survivors | Frightened, erratic. May help, attack, or attract attention. |

Faction relations are defined in data. The engine evaluates them; it does not know faction names.

### 5.3 Perception

Each entity has data-defined sense properties: vision (range, angle), hearing (radius, threshold), smell (detects blood/materials at range), fear triggers (tags that cause flee).

Sound and smell propagate physically — attenuated by walls, amplified by corridors. A fight in one room wakes the next. Bleeding leaves a trail.

### 5.4 Arrival State

Ships are generated with an **arrival state**: a snapshot of what was happening before the player boarded. Security mid-breach response, a predator loose from a specimen hold, survivors barricaded, pirates mid-heist. The player arrives into this situation and adapts to it.

---

## 6. Procedural Generation

Ships are generated per run from hull type templates. Ship size scales with progression — early runs use small vessels (2–3 decks), later runs use large ships (many decks, complex layouts). Size is the primary difficulty axis.

**Room layout**: rooms are defined by function (bridge, reactor, cargo bay, specimen hold, crew quarters, armory, medical). A constrained algorithm places and connects them respecting ship logic — bridge at top, reactor at bottom, specimen holds near labs.

**Population**: generated from weighted tables biased by hull type, deck depth, and ship age.

**Persistent world**: ships visited in previous runs are not discarded. Their state persists — what died there stayed there, what was left behind is still there.

---

## 7. Turn System

OFFAL uses a **time-energy model**. Each action has a time cost. The entity with the most available time acts next.

This makes limb mass tangible: a heavy metal arm increases attack action cost, giving enemies more chances to act before the player's next move. Speed is a real strategic variable built into the body system, not a separate stat.

---

## 8. Progression

### 8.1 Character

Skills improve through use. No XP allocation.

| Skill | Trained by | Effect |
|---|---|---|
| Firearms | Using ranged weapons | Aim speed, accuracy, reload time |
| Melee | Melee combat | Hit chance, timing |
| Crafting | Crafting items | Success rate, material efficiency |
| Hacking | Hacking terminals | Speed, success chance, alarm reduction |
| Medicine | Treating wounds, grafting | Bleed rate, graft success, infection treatment |
| Stealth | Moving undetected | Noise reduction, detection threshold |
| Athletics | Movement, dodging | Speed, encumbrance tolerance |

Skills are lost on death. This is what makes individual death painful.

### 8.2 Meta-Progression

Three persistent resources, accumulated across runs:

| Resource | Earned by | Unlocks |
|---|---|---|
| Materials | Extracted loot | Starting equipment, consumables, prosthetics |
| Biological knowledge | Grafting limbs, analysing creatures | New starting species, new limb types |
| Technological knowledge | Crafting, analysing ship tech | Starting recipes, better tools |

Before each run, the player configures a starting loadout using these resources. Starting implants and prosthetics provide skill floors — they reduce ramp-up time but do not replace earned skill.

Death advances meta-progress. A run where you graft five limb types and die at the last deck still unlocks biological knowledge. Progress is never fully wasted.

### 8.3 The Hub

A persistent location between missions — corporate facility, clone production wing *(narrative TBD)*. This is where meta-progress is spent and where the artefacts recovered from missions are kept.

**The hub is also the final dungeon.** From the first run, the player can see the guarded artefacts, can attempt to take them, and will be eliminated immediately. The possibility is visible. The capability must be built.

**Codex**: a persistent encyclopedia of discovered entries — species, materials, factions, ship types. Populated by experience, read-only.

---

## 9. Narrative

### 9.1 Framing

The player is a clone. They have no memory of previous runs by design — or so the corporation intends. Death is routine. The corporation files a report, the biological and technological knowledge from the previous clone is catalogued, and the next one ships out.

### 9.2 Act Structure

**Tutorial ship** — always the same, always the same layout. Physics and survival mechanics are learned through consequence, not instruction. The run ends in death. The corporation's response is a form letter.

**Act I — Learning the loop**  
Small ships. The player learns meta-progression is real and compounds. A silent threshold (accumulated resources) triggers a new mission: recover something from a previous expedition. The mission leads to a body — a clone from before the player took control. The body has a note. The note is written to itself. It records a specific observation, a date, an inconsistency. It does not say the corporation is lying. It says something that can be verified later.
> *Status: mechanics defined. Specific note content TBD.*

**Act II — The thread tightens**  
Larger ships. More exotic objectives. Clinical briefings that don't match what the player finds: corporate bodies in unlogged ships, artefacts with no manifest origin, evidence of failed missions the hub never mentioned. A second silent threshold triggers a return to a ship the player actually visited. Their own previous character is there, in the state they died. The body is lootable. The player's previous limbs are graftable.
> *Status: structure defined. Specific artefacts and lore fragments TBD.*

**Act III — The reckoning**  
The artefacts recovered across Act II are kept in the hub. If the player assembles them before the corporation does — using every system built across all runs (strong body, disabled kill switch, access via stealth/force/manipulation) — they hold the power. If the corporation assembles first, the player starts from below.

Both paths end the same: bring down the corporation.

The hub is the final challenge. The kill switch must be disabled first (discovered through lore, not tutorial). Then the artefacts accessed. Then assembled. No single skill suffices — the player needs the combination built across their entire history with the game.
> *Status: structure defined. Act III content and specifics TBD after Act I/II are playable.*

### 9.3 Narrative Objectives

Each mission has optional objectives that advance the thread: cargo manifests, captain's logs, black boxes, anomalies. Never required. Deeper in the ship, more dangerous. The player who ignores them survives more and understands less.

---

## 10. Technical

| | |
|---|---|
| **Stack** | TypeScript + Phaser 3 + bitECS + Vite |
| **Data format** | JSON5 |
| **Art** | Kenney.nl CC0 base; Kenney Character & Creature Mixer for modular entity sprites |
| **Sprite system** | Per-limb sprites composed at runtime; animations defined per limb type |
| **Turn system** | Time-energy model (action cost based) |
| **Target platform** | Browser |

---

## 11. Open Questions

These are design areas not yet resolved. They must be answered before or during implementation of the relevant phase.

| # | Question | Blocking |
|---|---|---|
| 1 | Hub visual identity and layout — what does it look like, how does the player navigate it? | Act I implementation |
| 2 | Specific content of the Act I note — what does it say, what can be verified? | Act I implementation |
| 3 | What are the artefacts? What does the assembled device do? | Act II/III implementation |
| 4 | Kill switch — where is it, how is it disabled? | Act III implementation |
| 5 | Starting species options — what are the first two or three available to the player? | Phase 2 implementation |
| 6 | Room layout algorithm — WFC or BSP with constraints? | Phase 1 implementation |
| 7 | Audio direction — procedural synthesis, CC0 library, or both? | Phase 6 |
| 8 | LLM fallback for crafting — which model, WebGPU feasibility? | Phase 6 |

---

*GDD v1.0 — maintained alongside development. When implementation contradicts design, update the design.*
