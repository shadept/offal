# OFFAL — Game Design Document
*A roguelike about what you're made of*

**Version**: 0.3
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

All game content lives in **JSON5 data files**. The engine knows about systems; it does not know about content. No material, item, creature, or recipe is hardcoded.

Adding content = writing a data file. No code change required.

The crafting system reasons over **properties and tags**, not item IDs.

---

## Design Philosophy

**Depth over complexity.** Depth is when existing rules produce consequences the player can anticipate. Complexity is when the player needs to learn new rules to understand what's happening. Every system should pass this test: can the player infer the consequence before reading it?

**Healthy systems are invisible.** Organs, capacities, and StatusEffects should not generate noise when functioning normally. Only surface information when it becomes relevant — when damage starts to matter, not before. The player should never feel monitored; they should feel like they're discovering things.

---

## Core Principles

These apply to every design decision:

1. **Every advantage has risk.** Grafting, amputation, body transformation — all carry genuine danger. Preparation is rewarded. Impulse is punished.

2. **The system is the designer.** Interactions emerge from rules, not from scripted outcomes. Comedy and drama are side effects of consistency.

3. **Locomotion follows structure.** Locomotion type is derived from active slots — not declared. Lose your legs, graft serpent segments, and your body becomes something else.

4. **Adaptation takes time.** A new body plan performs poorly until the nervous system catches up. Affinity grows through use, not through menus.

5. **No correct playstyle.** Stealth, combat, manipulation of faction conflicts — all are valid paths. The game should not reward one approach over another structurally.

6. **Death by accumulation, not by surprise.** Lethal situations should be readable before they become fatal. Bleeding kills slowly. Danger is signposted. The experienced player should be able to win consistently.

7. **The body is progression.** No XP, no levels. What you are is what you've grafted, adapted, and survived with. The body is the character sheet.

8. **The world existed before you arrived.** Factions have agendas. Situations are in progress. The player is a new variable in an ongoing system, not the reason the system exists.

---

## Data Schemas

The full schema reference lives in `docs/SCHEMAS.md`. This section describes the intent of each schema.

**Material** — physical properties of any substance: flammability, conductivity, hardness, mass, reactions. Referenced by limbs, items, tiles, and environmental features.

**Item** — a thing in the world: material, shape, size, tags. Interactions are not defined in the item — they emerge from its properties meeting the physics and crafting systems.

**Recipe** — what can be made from what. Inputs match by tags/properties, not by ID. Multiple recipes can match the same inputs — the player chooses intent. Unrecognised combinations fall through to a fallback that always produces something.

**Blueprint** — a structural body archetype: slot layout and default occupants. Does not declare locomotion. Blueprints are inherited by species.

**Species** — extends a blueprint with biological specifics: materials, size range, slot overrides, additional slots. The player's starting options are species.

**FunctionRule** — maps `limbType × slotRole` to capabilities. A tentacle in an arm slot attacks; in a leg slot it grips; in a back slot it flanks. Same limb, different function, different position.

**PhysicsRule** — defines how physical states propagate. Fire spreads to flammables, water extinguishes fire, electricity propagates through conductors. The physics system runs these rules; it does not know "fire" specifically.

---

## Systems

### Body System

Entities have modular bodies. Each slot holds a limb with its own HP and material. Losing a limb opens a stump. Stumps can be grafted.

#### Status Effects (Hediffs)

Any condition that modifies the normal state of a body — wound, disease, graft, environmental effect — is a **StatusEffect** (borrowing RimWorld's Hediff concept). StatusEffects attach to a specific slot or to the entity globally, and modify capabilities or stats for as long as they're active.

Examples: `bleeding` (on stump, stacks), `burning` (on limb, spreads), `oxidising` (on metal limb, progressive), `infected` (on wound, races against immunity), `rejected` (on graft, timer), `adapted` (on locomotion type, grows with use).

This unifies injuries, diseases, environmental effects, and graft states into one system. The engine processes StatusEffects; it does not know their specific names.

#### Internal Organs

Three internal organs exist as special slots within the torso. They are not external and cannot be grafted or severed in normal combat — but they can be damaged by penetrating attacks, environmental effects, or StatusEffects that spread inward.

| Organ | Function | Failure consequence |
|---|---|---|
| **Heart** | Pumps blood to all active limbs. Capacity = max total limbs that can be fully irrigated simultaneously. Extra limbs beyond capacity receive reduced performance. | Heart failure = rapid death. Severe damage = limb performance penalty across all grafted extras. |
| **Lungs** | Breathing. Directly linked to the oxygen/pressure/gas system. | Damaged lungs in toxic gas or low-oxygen environments die faster. Full failure = suffocation. Entities without lungs (robotic, anaerobic) are immune to this system entirely. |
| **Stomach** | Consuming food heals organic tissue and restores energy. | Damaged stomach blocks eating. Severe damage starts a starvation timer — eventually fatal. Forces resource management: fighting indefinitely is not viable. |

The heart acts as a **natural cap on body evolution**. You can graft as many limbs as you have stumps, but the heart must irrigate them all. A baseline heart supports a baseline body. Exceeding its capacity is possible but comes with diminishing returns — and heart upgrades (rare, high-risk) are a meaningful progression milestone.

The three organs interact: a full stomach improves heart efficiency. Damaged lungs reduce consciousness even with a healthy stomach. A damaged heart starves peripheral limbs of circulation before it kills.

Simpler entities (robots, alien creatures) may lack some or all of these organs and are immune to the corresponding systems.

#### Body Capacities

Each entity has **global capacities** derived from its active limbs, organs, and their states:

- **Mobility** — derived from leg slots; reduced by leg loss or injury
- **Manipulation** — derived from arm slots; reduced by arm loss
- **Consciousness** — derived from head slot; affected by pain, blood loss, lung damage
- **Circulation** — derived from heart; limits how many limbs operate at full capacity
- **Structural Integrity** — derived from torso/core; reaches zero = death

Capacities are not stored — they are computed each turn from slot states and active StatusEffects. Damage to a limb or organ reduces its contribution to the relevant capacity proportionally.

#### Limb Loss & Bleeding

Losing a limb (combat or voluntary) applies a `bleeding` StatusEffect to the stump. Bleeding stacks, reduces Consciousness, and kills if untreated. There is no safe operation.

Treatment options: bandage (reduces severity), cauterise (stops bleed, damages stump), medical item (stops + heals), organic graft (seals wound on attachment). Non-organic grafts do not seal.

#### Infection

Untreated wounds have a chance to become `infected`. Infection runs a race: **severity** increases over time, **immunity** increases based on entity health. If immunity reaches threshold first — survival. If severity reaches critical first — the wound becomes critical and spreads to adjacent slots.

Medical items accelerate immunity. Certain potion effects suppress infection. Cauterisation prevents infection at the cost of stump quality.

#### Grafting

Costs turns. Requires: compatible slot, manageable bleed level, compatible size. Mismatched materials (organic onto non-organic stump) apply a `rejection` StatusEffect — a timer that detaches the limb with additional bleeding if not suppressed by treatment.

**Grafting is never free.** Every body modification has a cost in time, risk, and resources.

#### Locomotion

Derived from active slots at all times. Radical changes apply `locomotion_unfamiliar` StatusEffect — a penalty to speed and action costs that fades as the entity uses the new body plan (action-based, not time-based).

### Physics System

Physical states (fire, wet, charged, pressurised) propagate according to data-defined rules. Limb materials participate in this system — a wooden arm burns, a metal arm conducts, a crystal arm shatters into shards.

### Crafting System

Two tiers:
- **Known recipes**: matched by input properties. Ambiguous combinations offer a choice.
- **Fallback**: unrecognised combinations always produce something — a crude composite. In Phase 6+, a local LLM names and describes the result; a sprite is synthesised procedurally. Graceful degradation if unavailable.

### Alchemy System

Potions have unknown effects per run (shuffled at start). Discovered by drinking, dipping items, or combining. Effects defined in data.

### Adaptive Ecology System

The game tracks how the player fights. Enemies in unexplored rooms are biased toward countering the dominant pattern. Fire spammer → fire-resistant variants appear. Head-targeter → headless variants appear. Gradual, not sudden. Defined in data rules.

---

## Procedural Generation

### Ships

Ships are generated per run. **Size scales with progression** — early runs take place in small vessels (shuttles, corvettes: 2–3 decks, tight corridors) and later runs in larger ones (frigates, research vessels, colony ships: many decks, complex layouts). Ship size is the primary difficulty axis — not a number, but a consequence of scale and population density.

Each ship has a **hull type** that determines:
- Tile palette and visual identity
- Room function distribution (a research vessel has labs and specimen holds; a freighter has cargo bays and crew quarters)
- Age/abandonment level (recent = active systems and survivors; ancient = overgrown with creatures, systems decayed)

Each ship has multiple **decks**. Each deck ends in a significant room (boss encounter, critical system, or high-value cache).

### Room Generation

Rooms are **pre-defined by function** and placed by a constrained layout algorithm (WFC or BSP with semantic rules). The layout respects ship logic:
- Bridge at the top
- Reactor and engineering at the bottom
- Crew quarters and medical mid-ship
- Cargo bays in the lower hull
- Specimen holds adjacent to research labs

Each room function has a pool of possible layouts, loot tables, and population tables. The algorithm selects and connects them. The result feels like a real ship, not a random dungeon.

### Population

**No faction exists because of the player.** Every entity aboard has its own reason to be there. The player is one more variable in an existing situation.

#### Factions

| Faction | Behaviour | Notes |
|---|---|---|
| **Security systems** | Attack any unauthorised entity | Player is unauthorised by default. Coordinated in groups via internal comms. |
| **Pirates/scavengers** | Loot the ship, avoid danger | Social: alone in small ships, groups in large ones. React to noise, call for backup, may flee from unknown creatures. |
| **Colonising creatures** | Territorial, attack nearest threat | Banded or solitary by species. Ignore faction distinctions — attack whatever is closest. |
| **Captive animals** | Passive in containment, chaotic if freed | Herbivores panic; predators treat everything as prey. A freed predator is a problem for everyone. |
| **Survivors** | Frightened, erratic | May help, may attack, may scream and attract everything nearby. |
| **Environmental hazards** | Not creatures — zones | Gas clouds, irradiated sections, pressurised vents. Affect all entities equally. |

Faction relations are defined in data. Default relations create emergent conflict: security attacks pirates attacks creatures attacks everyone. The player can exploit these conflicts intentionally.

#### Arrival State

When the player boards a ship, the situation is already in progress. An **arrival state** is generated at run start — a snapshot of what was happening aboard before the player arrived:

- Pirates mid-heist, still fighting security in the upper decks
- A predator recently freed from a specimen hold, currently hunting in the corridors
- Survivors barricaded in the cafeteria, the path around them relatively clear
- Security fully functional and on high alert after a breach elsewhere
- A gas leak slowly spreading through the engineering section

The player cannot control the arrival state — but they can read it and act on it. Waiting for two factions to destroy each other is a valid strategy. Sneaking past an active firefight, using the noise as cover, is a valid strategy. Charging in while everything is already distracted is also valid.

This makes every run feel like a situation, not a level. The question is not "clear the dungeon" but "what's happening here, and how do I survive it?"

#### Perception System

Entities perceive the world through data-defined sense profiles — not hardcoded detection logic:

- **Vision**: range and angle
- **Hearing**: detection radius and volume threshold
- **Smell**: detects blood, organics, specific materials at range
- **Fear triggers**: tags that cause flee behaviour (e.g. `fire`, `large_creature`, `loud_noise`)

Sound and smell propagate through the map like physical states — attenuated by walls, amplified by corridors. A loud fight wakes the next room. Bleeding leaves a trail. Fire causes fear responses in creatures that have it defined.

Entities communicate within factions: a security robot that spots the player can alert others in range. Pirates investigate sounds before charging in.

All of this is data. The AI system runs perception and faction rules; it does not know about "pirate" or "robot" specifically.

---

## Meta Progression

Death is not a failure state. It is a step back — a return to the hub with everything you learned, ready to approach the next mission differently.

### The Hub

A persistent location between missions (a salvage station, an abandoned relay — TBD by narrative). The hub is where meta-progress lives. Your character does not persist; your knowledge and resources do.

### Three Meta-Resources

| Resource | How earned | What it unlocks |
|---|---|---|
| **Materials** | Extracted loot from successful missions | Starting equipment, prosthetics, consumables for the next run |
| **Biological knowledge** | Grafting enemy limbs, analysing creatures | New starting species, new limb types available from the start |
| **Technological knowledge** | Crafting items, analysing ship technology | Known recipes at run start, better starting tools |

These are not experience points. They are things you actually did and brought back. A run where you graft five different limb types and die at the last boss still advances your biological knowledge significantly. Death with progress is not wasted.

### Starting a New Run

Before each run, the player configures their starting loadout using accumulated meta-resources:
- Choose a starting species (unlocked by biological knowledge)
- Choose starting equipment and consumables (purchased with materials)
- Starting recipes are automatically known based on technological knowledge

Runs begin stronger not because of a level number, but because you have more options. A player who has never played before starts with one species and basic equipment. A veteran starts with choices.

### Death as Information

Every death teaches something the game does not explain directly:
- Died of infection in a specimen room → bring treatment next time
- Died because the heart couldn't support six grafted arms → prioritise heart upgrades before over-grafting
- Died because a pirate group was too large to fight → try arriving when they're already fighting security

The meta-progression system does not reward grinding — it rewards discovery. You unlock things by doing them, not by repeating them.

### Codex

A persistent in-hub encyclopedia of discovered entries: species, materials, items, faction behaviours, ship types. Populated by experience, not purchased. Read-only. Acts as institutional memory across runs.

---

## Turn System

OFFAL uses a **time-energy model**, not rigid per-entity turns.

Each action has a time cost. The actor with the most available time acts next. This means:
- Fast entities act more frequently than slow ones
- Heavy limbs increase action costs → directly affects combat timing
- Speed is a real strategic variable, not a flat stat

This is borrowed from Cogmind's proven approach. It makes limb mass tangible: grafting a massive metal arm means your attacks take longer, giving enemies more chances to act before your next move.

---

## Technical

**Stack**: TypeScript + Phaser 3 + bitECS + Vite  
**Data format**: JSON5  
**Assets**: Kenney.nl CC0 as base  
**Sprites**: modular per limb, composed at runtime for hybrid bodies

---

*GDD v0.3 — living document. Details live in SCHEMAS.md and BACKLOG.md.*
