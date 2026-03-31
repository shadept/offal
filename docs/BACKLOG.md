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

## Phase 4 — Fire and Physics
*Goal: fire spreads turn by turn, water stops it. All visible in sandbox.*

This phase adds tile physics state and the fire/fluid systems. Sandbox fluid/gas placers get wired up here.

### Tile Physics State
- [ ] 🔴 Tile physics component: `{ fluid: Map<id,concentration>, gas: Map<id,concentration>, temperature, surfaceStates: Set<string> }`
- [ ] 🔴 Material registry: load `data/materials/*.json5`, index by id
- [ ] 🔴 Physics rules loader: load `data/physics-rules.json5`

### Fire System
- [ ] 🔴 `on_fire` surface state on tiles
- [ ] 🔴 Fire spreads to adjacent tiles where material `flammability > threshold`
- [ ] 🔴 Fire on tile damages entities each turn (`burning` status if organic)
- [ ] 🔴 `wet` tile suppresses fire
- [ ] 🔴 `fire_spread` visual event: ignition particle burst on newly burning tile
- [ ] 🟡 Fire generates `smoke` gas concentration
- [ ] 🟡 `explosion` visual event: particles + camera shake

### Fluid System
- [ ] 🔴 Fluid spreads to adjacent tiles each turn (rate from viscosity)
- [ ] 🔴 Fluid evaporates over time
- [ ] 🔴 Fluid + fire interaction: water suppresses, oil intensifies
- [ ] 🔴 `fluid_spread` visual event: alpha fade-in on new tile
- [ ] 🟡 Fluid contamination transfers to entity on contact

### Gas System
- [ ] 🟡 Gas concentration per tile, spreads by pressure differential
- [ ] 🟡 Toxic gas damages organic entities per turn
- [ ] 🟡 Flammable gas above threshold explodes on ignition

### Sandbox Wiring
- [ ] 🔴 Fluid placer: select fluid, click to add concentration to tile
- [ ] 🔴 Gas placer: select gas, click to add concentration to tile
- [ ] 🔴 Event trigger buttons: ignite fire, apply charge, breach hull on selected tile
- [ ] 🔴 Tile inspector shows physics state (temperature, fluid, gas, surface states)

**Exit criteria**: in sandbox, paint a wooden tile, ignite it — fire spreads. Pour water — it stops. Pour oil then ignite — spreads faster. All visible turn by turn.

---

## Phase 5 — Dungeon Generation
*Goal: press a button and get a new procedural ship to explore.*

- [ ] 🔴 BSP room splitter
- [ ] 🔴 Room connector (corridors)
- [ ] 🔴 Room function assignment from pool (bridge, cargo, lab, etc.)
- [ ] 🟡 Room population: entities from room's population table
- [ ] 🟡 Loot placement
- [ ] 🟡 Ship infrastructure tiles (pipes, vents, conduits)
- [ ] 🟡 "New ship" button in sandbox
- [ ] 🟡 Seed input for reproducible generation
- [ ] ⚪ Arrival state: pre-placed events (fire already started, gas leak, entities mid-fight)

**Exit criteria**: generate a new ship, rooms connected, player can explore, enemies placed.

---

## Phase 6 — Modular Bodies
*Goal: lose a limb in combat, capabilities change. Reattach it.*

- [ ] 🔴 Body component: slot list + occupant limbs
- [ ] 🔴 Limb component: type, material, HP, slot
- [ ] 🔴 Body capacity computation (mobility, manipulation, circulation)
- [ ] 🔴 Locomotion derived from active slots
- [ ] 🔴 Per-limb damage targeting
- [ ] 🔴 Limb loss: drop as item, stump state, capability removed
- [ ] 🟡 Internal organs: heart, lungs, stomach as special slots
- [ ] 🟡 Limb material participates in physics (wooden arm near fire = burning)
- [ ] 🟡 Limb attachment: pick up severed limb, attach to compatible stump
- [ ] 🟡 Rejection status on material mismatch
- [ ] 🟡 Modular sprite composition from active limbs

**Exit criteria**: player loses arm in combat, movement affected. Can pick up and reattach.

---

## Phase 7 — Crafting & Items
*Goal: pick up two items, combine them, get a result.*

- [ ] 🔴 Item component: material, shape, size, tags
- [ ] 🔴 Inventory
- [ ] 🔴 Pick up / drop
- [ ] 🔴 Recipe loader + matcher
- [ ] 🔴 Craft action
- [ ] 🟡 Potion system: shuffled identities per run
- [ ] 🟡 Fluid dipping
- [ ] ⚪ LLM fallback (Phase 10)

**Exit criteria**: pick up two items, craft them, get a result.

---

## Phase 8 — Meta Progression & Hub
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

## Phase 9 — Polish & Content
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

## Phase 10 — LLM Crafting Fallback
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

*Last updated: 2026-03-31*
