# OFFAL — Development Backlog

**Legend**: 🔴 Blocking | 🟡 High | 🟢 Medium | ⚪ Low | ✅ Done | 🚧 In Progress

**Philosophy**: Every phase ends with something testable. No long stretches without visual feedback.

**Visual requirement (applies to all phases)**: game logic is turn-based; visuals run at 60fps continuously. Fire animates whether or not it's the player's turn. Entities have idle animations. Ambient sound loops. Environmental details (sparks, flickering lights, console beeps) run independently of game state. This is not a polish pass — it is an architectural requirement from Phase 1 onward.

---

## Phase 0 — Project Scaffold
*Goal: browser opens, black screen with a tile rendered.*

- [x] ✅ Init Vite + TypeScript project
- [x] ✅ Install and configure Phaser 4
- [x] ✅ Install bitECS
- [x] ✅ Install json5 parser
- [x] ✅ Basic project structure:
  ```
  src/
    ecs/          # components, systems
    scenes/       # Phaser scenes
    data/         # JSON5 loader
    ui/           # sandbox panel, HUD
  data/
    materials/
    items/
    species/
    blueprints/
    recipes/
    function-rules.json5
    physics-rules.json5
  ```
- [x] ✅ Dev server running in browser (`npm run dev`)
- [x] ✅ JSON5 data loader (reads files from `data/`, typed)
- [x] ✅ Basic tileset loaded (generated procedurally — Kenney assets deferred to Phase 9)

**Exit criteria**: `npm run dev` opens browser, shows a grid of tiles.

---

## Phase 1 — Core Rendering & Movement
*Goal: player moves on a tile map, camera follows.*

### Tile Map
- [x] ✅ Tile map component (grid of tile IDs)
- [x] ✅ Tile renderer (manual sprite grid with generated textures)
- [x] ✅ Camera follows player entity
- [x] ✅ Phaser game loop runs at 60fps — game logic updates on turn tick only, render updates every frame
- [x] ✅ Turn state machine: `PLAYER_INPUT → PROCESSING → ANIMATION → ENEMY_TURN → ANIMATION → PLAYER_INPUT`
- [x] ✅ Visual event queue: array of `{type, targets, config, onComplete?}`. Logic pushes events; visual layer drains them sequentially via `onComplete` callbacks
- [x] ✅ **Logic is tentative until animation completes**: damage and effects apply at the moment their visual event resolves, not when they are queued. This matches player perception — damage happens when the projectile arrives, not when the turn was calculated.
- [x] ✅ Skip/accelerate: player can hold Shift to drain visual queue instantly (for fast play)
- [x] ✅ Basic tile types: floor, wall, door (open/closed)
- [x] ✅ Field of view — recursive shadowcasting, tiles revealed by line-of-sight
- [x] ✅ Ambient visual layer: spark particle emitters at wall boundaries run outside the turn system

### Visual Event Types (implement as needed per phase)
- [x] ✅ `move`: entity tween A→B via `this.tweens.add`, `onComplete` advances queue (Phase 1)
- [x] ✅ `idle`: player idle bob animation, never gated by turn state (Phase 1)
- [ ] 🟡 `projectile`: sprite flies origin→target, `onComplete` applies damage and advances queue (Phase 4)
- [ ] 🟡 `fire_spread`: ignition particle burst on newly burning tile (Phase 3)
- [ ] 🟡 `explosion`: particles + `this.cameras.main.shake()` + sound (Phase 3)
- [ ] 🟡 `death`: death animation, `onComplete` removes entity (Phase 4)
- [ ] 🟡 `fluid_spread`: fluid alpha fade-in on new tile (Phase 3)
- [ ] 🟡 `status_apply`: floating icon or tint flash (Phase 4)
- [ ] 🟡 `hit_flash`: tint to white/red then restore, `onComplete` advances queue (Phase 4)
- [ ] ⚪ `screen_shake`: `cameras.main.shake(duration, intensity)` (Phase 4)

### ECS Foundation
- [x] ✅ Position component
- [x] ✅ Renderable component (sprite ID, layer)
- [x] ✅ Turn component (time-energy value)
- [x] ✅ Turn scheduler system (entity with most time acts next)

### Player
- [x] ✅ Player entity spawns on map
- [x] ✅ WASD/arrow movement (one tile per turn)
- [x] ✅ Bump into wall = no move, turn consumed; bump into door = door opens
- [x] ✅ Basic HUD: position, turn count, phase indicator, controls help

**Exit criteria**: player moves around a hand-crafted room, camera follows, walls block movement.

---

## Phase 2 — Sandbox Mode
*Goal: toggle sandbox panel, spawn entities, inspect tiles.*

### Sandbox Panel
- [x] ✅ Toggle key (Tab) switches between game mode and sandbox mode
- [x] ✅ Sidebar panel (HTML overlay on Phaser canvas)
- [x] ✅ Click tile → inspect panel shows tile state (type, material, visibility, light; fluid/gas/temperature scaffolded for Phase 3)
- [x] ✅ Click entity → inspect panel shows entity components (position, energy, speed, FOV, AI)
- [x] ✅ Tile painter: select tile type from data-driven list, click to place
- [x] ✅ Entity spawner: select species from data-driven list, click to place
- [ ] 🟡 Fluid placer: select fluid type, click to add concentration to tile (UI scaffolded, blocked by Phase 3)
- [ ] 🟡 Gas placer: select gas type, click to add concentration to tile (UI scaffolded, blocked by Phase 3)
- [ ] 🟡 Event trigger: buttons for fire/charge/breach on selected tile (UI scaffolded, blocked by Phase 3)

### Simulation Control
- [x] ✅ Manual turn advance (press N in sandbox = advance one turn for all entities)
- [x] ✅ Auto-play toggle (simulation runs without player input)
- [x] ✅ Speed control (turns per second in auto-play)
- [ ] 🟡 AI-only mode (remove player control, watch AI vs AI) (UI scaffolded, blocked by Phase 4)

### Data-Driven Content (added during Phase 2)
- [x] ✅ Tile definitions in `data/tiles/*.json5` — material refs, blocksMovement/Light from data
- [x] ✅ Species definitions in `data/species/*.json5` — speed, fovRange, color, spawnTags
- [x] ✅ Map definitions in `data/maps/*.json5` — character grid with legend, player spawn, entity spawns
- [x] ✅ Map loader replaces hardcoded test map; test_ship.json5 with proper 4-room layout
- [x] ✅ One definition per file across all data types
- [x] ✅ TileMap, movement system, inspector all read properties from data registry

### AI Foundation (added during Phase 2)
- [x] ✅ AI component (behaviour field, default: idle)
- [x] ✅ AI system processes all AI entities per turn (idle = consume energy)
- [x] ✅ Spawned entities get AI component, idle through turns without freezing

### HUD
- [x] ✅ FPS counter (capped at 60)
- [x] ✅ Sandbox phase indicator
- [x] ✅ Controls hint includes Tab

**Exit criteria**: can spawn two entities, watch them exist, inspect their state. Can paint tiles and fluids.

---

## Phase 3 — Physics Prototype
*Goal: fire spreads, water extinguishes, electricity conducts. All visible in sandbox.*

### Tile Physics State
- [ ] 🔴 Tile physics component: `{ fluid: Map<id,concentration>, gas: Map<id,concentration>, temperature, surfaceStates: Set }`
- [ ] 🔴 Material registry: load `data/materials/*.json5`, index by id
- [ ] 🔴 Physics rules loader: load `data/physics-rules.json5`

### Fire System
- [ ] 🔴 `on_fire` state on tiles
- [ ] 🔴 Fire spreads to adjacent tiles where `flammability > threshold` (from material of tile floor/wall)
- [ ] 🔴 Fire on tile damages entities occupying it (organic material = `burning` status)
- [ ] 🔴 `wet` tile suppresses fire
- [ ] 🟡 Fire generates `smoke` gas concentration
- [ ] 🟡 Fire consumes O₂ concentration (if tracked)

### Fluid System
- [ ] 🔴 Fluid spreads to adjacent lower/equal tiles each turn (viscosity affects rate)
- [ ] 🔴 Fluid evaporates over time (rate based on tile temperature)
- [ ] 🔴 Fluid contamination transfers to entity on contact (entity gains fluid component)
- [ ] 🟡 Oil + fire = intensified burn
- [ ] 🟡 Water + charged tile = electricity conducts through fluid

### Gas System
- [ ] 🔴 Gas concentration per tile, spreads based on pressure differential
- [ ] 🔴 Temperature accelerates outward gas flow
- [ ] 🔴 Enclosed space accumulates gas; open/ventilated space disperses
- [ ] 🟡 Toxic gas damages organic entities per turn (lungs)
- [ ] 🟡 Flammable gas above threshold = explosion on ignition

### Pressure / Vacuum
- [ ] 🟡 Tile pressure value
- [ ] 🟡 Breach event: wall destroyed adjacent to vacuum → decompression
- [ ] 🟡 Overpressure rupture: concentration exceeds structural threshold
- [ ] 🟡 Entities pulled toward breach (Athletics check)

### Electricity
- [ ] 🟡 `charged` state propagates through conductive tiles/entities
- [ ] 🟡 Organic entities in `charged` tiles take `shocked` status

**Exit criteria**: in sandbox, place fire on a wooden tile — it spreads. Pour water — it stops. Place oil — fire intensifies. All visible turn by turn.

---

## Phase 4 — Entity Systems & Basic AI
*Goal: entities have HP, can attack, basic enemies chase and fight.*

### Entity Health
- [ ] 🔴 HP component (global, pre-modular — simplified for prototype)
- [ ] 🔴 Damage system (apply damage, check death)
- [ ] 🔴 Death: entity removed, drops loot placeholder
- [ ] 🟡 Status effect component (list of active effects with duration/severity)
- [ ] 🟡 `bleeding` status: HP drain per turn
- [ ] 🟡 `burning` status: HP drain, spreads fire to tile

### Basic AI
- [ ] 🔴 AI component: faction tag, behaviour type
- [ ] 🔴 `seek` behaviour: move toward nearest hostile entity
- [ ] 🔴 `attack` behaviour: deal damage to adjacent hostile entity
- [ ] 🔴 Faction relation lookup (from `data/factions.json5`)
- [ ] 🟡 `flee` behaviour: move away from threat (fear triggers)
- [ ] 🟡 `patrol` behaviour: move along defined path, switch to seek on detection
- [ ] 🟡 Detection: vision range check before switching to seek
- [ ] 🟡 Hearing: react to noise events within radius

### AI vs AI in Sandbox
- [ ] 🟡 Spawn two hostile factions, enable auto-play, watch them fight
- [ ] 🟡 Inspect entities mid-fight to verify HP and status effects

**Exit criteria**: spawn a security robot and a pirate, press auto-play, watch them fight to the death.

---

## Phase 5 — Dungeon Generation
*Goal: procedurally generated ship floor, populated with entities.*

### Room Generation
- [ ] 🔴 BSP room splitter: divide map into rectangles
- [ ] 🔴 Room connector: corridors between adjacent rooms
- [ ] 🔴 Room function assignment: each room gets a type from pool (bridge, cargo, lab, etc.)
- [ ] 🟡 Room population: spawn entities from room's population table
- [ ] 🟡 Loot placement: items in containers/floor based on room type
- [ ] 🟡 Ship infrastructure: place pipes, conduits, vents as interactable tiles

### Generation Viewer (Sandbox)
- [ ] 🟡 "New ship" button in sandbox: regenerate entire map
- [ ] 🟡 Seed input: reproduce specific generation
- [ ] 🟡 Hull type selector: affects tile materials and room distribution
- [ ] 🟡 Show room boundaries and function labels (debug overlay)

### Arrival State
- [ ] ⚪ Generate initial faction positions and states (mid-fight, barricaded, patrolling)
- [ ] ⚪ Place environmental events (gas leak, fire already started, broken bulkhead)

**Exit criteria**: generate a new ship each run, rooms connected, enemies placed, player can explore.

---

## Phase 6 — Body System
*Goal: modular bodies, limb loss, status effects on limbs, basic attachment.*

### Modular Body
- [ ] 🔴 Body component: list of slots with occupant limb
- [ ] 🔴 Limb component: type, material, HP, slot reference
- [ ] 🔴 Blueprint/species loader from `data/`
- [ ] 🔴 Body capacity computation (mobility, manipulation, consciousness, circulation)
- [ ] 🔴 Locomotion derivation from active slots
- [ ] 🟡 Per-limb damage (target specific limbs in combat)
- [ ] 🟡 Limb loss: drop as item, stump state, capability removal
- [ ] 🟡 Limb material participates in physics (wooden arm near fire = `burning`)

### Internal Organs
- [ ] 🟡 Heart, lungs, stomach as special internal slots
- [ ] 🟡 Heart capacity: limits fully-irrigated limbs
- [ ] 🟡 Lung damage: accelerates suffocation in bad atmosphere
- [ ] 🟡 Stomach damage: blocks eating, starvation timer

### Limb Attachment
- [ ] 🟡 Pick up severed limb from floor
- [ ] 🟡 Attach limb to compatible stump (turn cost, bleed check)
- [ ] 🟡 `rejection` status on material mismatch
- [ ] 🟡 FunctionRule lookup: capabilities granted by new limb

### Sprite Composition
- [ ] 🟡 Modular sprite system: compose entity visual from active limb sprites
- [ ] 🟡 Kenney Character & Creature Mixer assets integrated
- [ ] ⚪ Hybrid body animations (composed from per-limb animations)

**Exit criteria**: player loses an arm in combat, capability changes, can pick up and reattach. Visible in sprite.

---

## Phase 7 — Crafting & Items
*Goal: pick up items, combine them, get result.*

- [ ] 🔴 Item component: material, shape, size, tags
- [ ] 🔴 Inventory component: list of held items
- [ ] 🔴 Pick up / drop action
- [ ] 🔴 Recipe loader from `data/recipes/`
- [ ] 🔴 Recipe matcher: evaluate inputs against recipe InputSpecs
- [ ] 🔴 Craft action: combine selected items → recipe result or crude composite
- [ ] 🟡 Ambiguous match: present player with options
- [ ] 🟡 Potion system: shuffled identities per run, identify on use
- [ ] 🟡 Fluid dipping: apply potion to item
- [ ] ⚪ LLM fallback for unrecognised combinations (Phase 9)

**Exit criteria**: pick up two items, combine them, get a result. Potion identity unknown until drunk.

---

## Phase 8 — Meta Progression & Hub
*Goal: death → hub → spend resources → new run starts with loadout.*

- [ ] 🔴 Run state: track accumulated resources, bio knowledge, tech knowledge
- [ ] 🔴 Death triggers hub scene (not game over screen)
- [ ] 🔴 Hub UI: spend resources on starting loadout
- [ ] 🔴 Starting species selection (unlocked by bio knowledge)
- [ ] 🔴 Starting equipment selection (purchased with materials)
- [ ] 🟡 Character skills: per-skill value, improves on use
- [ ] 🟡 Skill floors from starting implants/prosthetics
- [ ] 🟡 Codex: persistent encyclopedia of discovered entries
- [ ] 🟡 Run history: cause of death, depth reached
- [ ] 🟡 Persistent world: ship states saved between runs
- [ ] ⚪ Return missions: revisit previous ships
- [ ] ⚪ Previous character body persistence

**Exit criteria**: die, go to hub, spend resources, start new run with chosen loadout. Skills carry between hub visits.

---

## Phase 9 — Polish & Content
*Goal: enough content for a complete early run. Playable from tutorial to first boss.*

- [ ] Tutorial ship (hand-crafted, always same)
- [ ] 3+ ship hull types with distinct physics profiles
- [ ] 5+ enemy species with different blueprints
- [ ] 20+ item types
- [ ] 10+ potion effects
- [ ] 3+ boss encounters
- [ ] Act I narrative beat (body with note)
- [ ] Sound effects (CC0 library base)
- [ ] Music (CC0 ambient)
- [ ] Main menu, game over, pause screens

---

## Phase 10 — LLM Crafting Fallback
*Goal: unrecognised crafting combinations produce named, described results.*

- [ ] Evaluate WebLLM / WebGPU feasibility on target hardware
- [ ] Integrate lightweight quantized model (target <2GB)
- [ ] Fallback: crude composite if model unavailable
- [ ] Procedural sprite synthesis for generated items
- [ ] Cache results per run

---

## Icebox

- Multiplayer co-op
- Mobile layout
- Controller support
- Full Act II / Act III narrative content
- Procedural creature name generator

---

*Last updated: 2026-03-31*
