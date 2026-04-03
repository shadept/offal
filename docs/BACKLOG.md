# OFFAL — Development Backlog

**Legend**: 🔴 Blocking | 🟡 High | 🟢 Medium | ⚪ Low | ✅ Done | 🚧 In Progress

**Philosophy**: Every phase ends with something *you can see and interact with*. No partial features. No "blocked by next phase". If a feature can't be completed without the next phase, it belongs in the next phase.

**Visual requirement (applies to all phases)**: game logic is turn-based; visuals run at 60fps continuously. Fire animates whether or not it's the player's turn. Entities have idle animations. Environmental details run independently of game state. This is not polish — it is an architectural requirement from Phase 1 onward.

---

## Phase 0 — Project Scaffold ✅ COMPLETE
*Goal: browser opens, something renders.*

- [x] ✅ Vite + TypeScript + Phaser 4 + bitECS
- [x] ✅ JSON5 data loader
- [x] ✅ Basic project structure
- [x] ✅ Dev server in browser

---

## Phase 1 — Player Moves on a Map ✅ COMPLETE
*Goal: player moves on tile map, camera follows.*

- [x] ✅ Tile map + renderer
- [x] ✅ Camera follows player
- [x] ✅ 60fps render loop, turn-based logic
- [x] ✅ Turn state machine: `PLAYER_INPUT → PROCESSING → ANIMATION → ENEMY_TURN → ANIMATION → PLAYER_INPUT`
- [x] ✅ Visual event queue (logic pushes, Phaser drains)
- [x] ✅ Damage applies at visual event resolution (projectile arrives = damage happens)
- [x] ✅ Skip/accelerate: hold Shift to drain queue instantly
- [x] ✅ Floor, wall, door tiles; FOV shadowcasting
- [x] ✅ Ambient visual layer (sparks etc. independent of turns)
- [x] ✅ `move` and `idle` visual events
- [x] ✅ ECS foundation: Position, Renderable, Turn, TurnScheduler

**Exit criteria**: player moves around a room, walls block movement, camera follows. ✅

---

## Phase 2 — Sandbox Tooling ✅ COMPLETE
*Goal: spawn entities, paint tiles, inspect state, watch simulation run.*

- [x] ✅ Tab: toggle sandbox mode
- [x] ✅ Tile painter (data-driven tile list)
- [x] ✅ Entity spawner (data-driven species list)
- [x] ✅ Click → inspect tile or entity state
- [x] ✅ Manual turn advance (N)
- [x] ✅ Auto-play with speed control
- [x] ✅ Tile/species/map definitions in `data/` JSON5 files
- [x] ✅ Map loader from `data/maps/*.json5`
- [x] ✅ AI component + idle system (entities exist without freezing)
- [x] ✅ HUD: FPS, turn count, mode indicator

**Exit criteria**: can spawn entities, paint tiles, advance simulation, inspect state. ✅

---

## Phase 3 — Entities Fight Each Other ✅ COMPLETE
*Goal: spawn enemies, press auto-play, watch them fight to the death.*

This phase adds everything needed to see combat: HP, movement AI, attack, death. Physics is NOT in this phase — that's Phase 4.

### Movement AI
- [x] ✅ `wander` behaviour: move to random adjacent walkable tile each turn
- [x] ✅ `seek` behaviour: pathfind toward nearest hostile entity (BFS or A*)
- [x] ✅ Detection range: entity only seeks if target within FOV range
- [x] ✅ Faction data: load `data/factions.json5`, assign faction to species
- [x] ✅ Faction relation check: determines hostile/neutral/friendly

### Combat
- [x] ✅ HP component (flat value, pre-modular)
- [x] ✅ Attack action: deal damage to adjacent hostile entity (damage from species data)
- [x] ✅ Damage system: reduce HP, check for death
- [x] ✅ Death: entity removed, visual death event
- [x] ✅ `hit_flash` visual event: entity flashes red on damage
- [x] ✅ `death` visual event: death animation before removal
- [x] ✅ HP bar visible on inspect (already scaffolded)

### Sandbox Completion (unblocked by this phase)
- [x] ✅ AI-only mode: disable player control, pure AI vs AI observation
- [x] ✅ Entity inspector shows HP and faction

**Exit criteria**: spawn a security_bot and a void_rat, enable auto-play, watch them fight. One dies. ✅

---

## Phase 4 — Fire and Physics ✅ COMPLETE
*Goal: fire spreads turn by turn, water stops it. All visible in sandbox.*

This phase adds tile physics state and the fire/fluid systems. Sandbox fluid/gas placers get wired up here.

### Tile Physics State
- [x] ✅ Tile physics component: `{ fluid: Map<id,concentration>, gas: Map<id,concentration>, temperature, surfaceStates: Set<string> }`
- [x] ✅ Material registry: load `data/materials/*.json5`, index by id
- [x] ✅ Physics rules loader: load `data/physics-rules.json5`

### Fire System
- [x] ✅ `on_fire` surface state on tiles
- [x] ✅ Fire spreads to adjacent tiles where material `flammability > threshold`
- [x] ✅ Fire on tile damages entities each turn (`burning` status if organic)
- [x] ✅ `wet` tile suppresses fire
- [x] ✅ `fire_spread` visual event: ignition particle burst on newly burning tile
- [x] ✅ Fire generates `smoke` gas concentration
- [x] ✅ `explosion` visual event: particles + camera shake

### Fluid System
- [x] ✅ Fluid spreads to adjacent tiles each turn (rate from viscosity)
- [x] ✅ Fluid evaporates over time
- [x] ✅ Fluid + fire interaction: water suppresses, oil intensifies
- [x] ✅ `fluid_spread` visual event: alpha fade-in on new tile
- [x] ✅ Fluid contamination transfers to entity on contact

### Gas System
- [x] ✅ Gas concentration per tile, spreads by pressure differential
- [x] ✅ Toxic gas damages organic entities per turn
- [x] ✅ Flammable gas above threshold explodes on ignition

### Sandbox Wiring
- [x] ✅ Fluid placer: select fluid, click to add concentration to tile
- [x] ✅ Gas placer: select gas, click to add concentration to tile
- [x] ✅ Event trigger buttons: ignite fire on selected tile
- [x] ✅ Tile inspector shows physics state (temperature, fluid, gas, surface states)

**Exit criteria**: in sandbox, paint a wooden tile, ignite it — fire spreads. Pour water — it stops. Pour oil then ignite — spreads faster. All visible turn by turn. ✅

---

## Phase 5 — Dungeon Generation ✅ COMPLETE
*Goal: press a button and get a new procedural ship to explore.*

- [x] ✅ BSP room splitter
- [x] ✅ Room connector (corridors)
- [x] ✅ Room function assignment from pool (bridge, cargo, lab, etc.)
- [x] ✅ Room population: entities from room's population table
- [x] ✅ Loot placement
- [x] ✅ Ship infrastructure tiles (pipes, vents, conduits)
- [x] ✅ "New ship" button in sandbox
- [x] ✅ Seed input for reproducible generation
- [x] ✅ Arrival state: pre-placed events (fire already started, gas leak, entities mid-fight)

**Exit criteria**: generate a new ship, rooms connected, player can explore, enemies placed. ✅

---

## Phase 6 — Modular Bodies
*Goal: lose a limb in combat, capabilities change.*

### Body System ✅
- [x] ✅ Body + CachedCapacity components on creatures, parts as ECS entities
- [x] ✅ PartIdentity, PartMaterial, AttachedTo components; Part Lookup Index
- [x] ✅ Body capacity computation (mobility, manipulation, consciousness, circulation, structuralIntegrity)
- [x] ✅ Locomotion/speed derived from functional parts and species baseline
- [x] ✅ Per-part damage targeting (weighted random by hitWeight, depth filter by damage type)
- [x] ✅ Severance: external parts at 0 HP drop to floor as entities, body recalcs
- [x] ✅ Internal organ deactivation (stays attached, dead weight)
- [x] ✅ Death from required part loss or capacity collapse
- [x] ✅ Unified damage pipeline (applyDamage) replaces 3 separate damage sites
- [x] ✅ Floor part decay, environmental damage to severed parts
- [x] ✅ Game log panel (combat, environment, death events)
- [x] ✅ Sandbox: multi-entity inspector, sever buttons, capacity readout

### Organs & Material Physics
- [x] ✅ Internal organs: heart, lungs, stomach as internal-depth parts
- [ ] 🟡 Part material participates in physics (wooden arm near fire = burning)

**Exit criteria**: player loses arm in combat, movement and capabilities change visibly. Severed limbs visible on ground. ✅

---

## Phase 7 — Crafting & Items
*Goal: pick up two items, combine them, get a result.*

- [x] ✅ Item component: material, shape, size, tags
- [x] ✅ Inventory with capacity tracking
- [x] ✅ Pick up / drop (auto-pickup on single item + space)
- [x] ✅ Recipe loader + matcher (tag-based with crude composite fallback)
- [x] ✅ Craft action (select 2+ items, choose recipe or crude composite)
- [x] ✅ Inventory UI panel (I key toggle)
- [x] ✅ Visual events: item_pickup, item_drop, craft_success
- [x] ✅ Data: 6 basic items, 3 crafted items, 3 recipes
- [ ] 🟡 Potion system: shuffled identities per run
- [ ] 🟡 Fluid dipping
- [ ] ⚪ LLM fallback (Phase 11)

**Exit criteria**: pick up two items, craft them, get a result. ✅

---

## Phase 8 — Limb Reattachment
*Goal: pick up a severed limb and graft it back on.*

- [ ] 🔴 Limb attachment: pick up severed limb, attach to compatible stump
- [ ] 🔴 Body-slot attachment UI
- [ ] 🟡 Rejection status on material mismatch
- [ ] 🟡 Modular sprite composition from active limbs

**Exit criteria**: player picks up a severed limb, attaches it to a stump, capabilities restored. Mismatched material triggers rejection.

---

## Phase 9 — Meta Progression & Hub
*Goal: die, go to hub, spend resources, start new run.*

- [ ] 🔴 Run state tracking (materials, bio knowledge, tech knowledge)
- [ ] 🔴 Death → hub scene
- [ ] 🔴 Hub UI: spend resources on loadout
- [ ] 🔴 Starting species + equipment selection
- [ ] 🟡 Character skills (use-based improvement)
- [ ] 🟡 Persistent world: previous ship states saved
- [ ] 🟡 Previous character body in world

**Exit criteria**: die, go to hub, choose loadout, start new run.

---

## Phase 10 — Polish & Content
*Goal: enough content for a complete early run.*

- [ ] Tutorial ship (hand-crafted)
- [ ] 3+ hull types with distinct physics profiles
- [ ] 5+ enemy species
- [ ] 20+ item types
- [ ] 10+ potion effects
- [ ] 3+ boss encounters
- [ ] Act I narrative beat (body with note)
- [ ] Sound effects + ambient music (CC0)
- [ ] Main menu, pause, game over screens
- [ ] Kenney Character & Creature Mixer sprites

---

## Phase 11 — LLM Crafting Fallback
*Goal: unrecognised combos produce named, described results.*

- [ ] Evaluate WebLLM / WebGPU feasibility
- [ ] Integrate lightweight quantized model (<2GB)
- [ ] Procedural sprite synthesis for generated items
- [ ] Cache results per run

---

## Icebox
- Electricity system (charged tiles, shocked status)
- Pressure / vacuum / breach decompression
- Multiplayer co-op
- Mobile layout / controller support
- Full Act II / Act III narrative
- Procedural creature name generator

---

*Last updated: 2026-04-03*
