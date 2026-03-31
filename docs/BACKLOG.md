# OFFAL — Development Backlog

**Legend**: 🔴 Blocking | 🟡 High | 🟢 Medium | ⚪ Low | ✅ Done

---

## Phase 0 — Project Setup
- ✅ Repo created
- ✅ GDD written
- [ ] 🔴 Vite + TypeScript + Phaser 3 + bitECS scaffold
- [ ] 🔴 Basic project structure (src/scenes, src/ecs, src/systems, src/components)
- [ ] 🔴 Dev server running in browser
- [ ] 🟡 Asset pipeline (Kenney packs loaded)
- [ ] 🟡 Tiled map loader OR basic procedural room generator

---

## Phase 1 — Core Loop (Playable Skeleton)

### Movement & Map
- [ ] 🔴 Tile-based map rendering
- [ ] 🔴 Player movement (turn-based, WASD/arrows)
- [ ] 🔴 Basic procedural dungeon generation (rooms + corridors)
- [ ] 🔴 Field of view / fog of war
- [ ] 🟡 Camera follow player
- [ ] 🟡 Multiple rooms per floor, exit to next floor

### Combat
- [ ] 🔴 Basic melee attack (bump-to-attack)
- [ ] 🔴 HP system (global, pre-modular)
- [ ] 🔴 Enemy basic AI (move toward player, attack adjacent)
- [ ] 🟡 Turn order system (player → enemies)
- [ ] 🟡 Death (enemy drops loot, player = game over)
- [ ] 🟡 2-3 enemy types with different stats

### UI
- [ ] 🔴 HUD: HP bar, floor number
- [ ] 🟡 Message log (combat events, discoveries)
- [ ] 🟡 Basic inventory panel
- [ ] ⚪ Main menu
- [ ] ⚪ Game over screen

### Feel
- [ ] 🟡 Basic sprite animations (idle, walk, attack)
- [ ] 🟡 Screen shake on hit
- [ ] 🟡 Particle effects (blood, impact)
- [ ] ⚪ Sound effects (footstep, hit, death)

---

## Phase 2 — Body System

### Modular Body Architecture
- [ ] 🔴 ECS components: Body, Limb, LimbSlot, Material
- [ ] 🔴 Body slot system (arm, leg, torso, head, back)
- [ ] 🔴 Limb types: arm, leg, tentacle, claw, jaw
- [ ] 🔴 Limb materials: organic, wood, metal, crystal, stone, vacuum-gas
- [ ] 🟡 Position-based function resolution (arm slot vs leg slot vs back slot)
- [ ] 🟡 Multi-arm support (hold multiple items simultaneously)

### Dismemberment
- [ ] 🔴 Per-limb HP pools (replace global HP)
- [ ] 🔴 Limb targeting in combat
- [ ] 🔴 Limb loss effects (movement penalty for legs, slot loss for arms)
- [ ] 🔴 Severed limbs as floor items (lootable)
- [ ] 🟡 Bleeding system (damage over time from wounds)
- [ ] 🟡 Stump states (can be grafted onto)

### Grafting
- [ ] 🔴 Graft action (pick up limb + apply to stump)
- [ ] 🔴 Compatibility rules (slot type, size category)
- [ ] 🟡 Grafting side effects (rejection chance, material mismatch)
- [ ] 🟡 Visual: modular sprite assembly from active limbs

### Material Physics (body integration)
- [ ] 🔴 Fire propagation system (tile + limb)
- [ ] 🔴 Wooden limb + fire = limb burns → loses HP → severs
- [ ] 🔴 Metal limb + electricity = conducts to adjacent (player or enemy)
- [ ] 🟡 Water extinguishes fire on limbs
- [ ] 🟡 Metal + water = oxidation debuff (slow decay)
- [ ] ⚪ Crystal limb breaks into sharp shards (area damage on destruction)
- [ ] ⚪ Vacuum-gas limb + spark = explosion

### Morphologies
- [ ] 🟡 Biped (default player)
- [ ] 🟡 Quadruped enemies
- [ ] 🟡 Radial enemies
- [ ] ⚪ Serpentine enemies
- [ ] ⚪ Blob enemies
- [ ] ⚪ Player can start as non-biped (unlock)

---

## Phase 3 — Crafting & Alchemy

### Emergent Crafting
- [ ] 🔴 Object property system (material, shape, mass, flammability, conductivity...)
- [ ] 🔴 Combination evaluator (properties + quantity → taxonomy lookup)
- [ ] 🔴 Basic combinations: stick+nail=weapon, excess components=furniture
- [ ] 🟡 Throwable objects (chair, improvised weapons)
- [ ] 🟡 Limb-weapon crafting (attach nail to wooden limb = arm-weapon)
- [ ] 🟡 Improvised grenade (powder + container)
- [ ] ⚪ More exotic combinations (magnetized metal limb, crystal shard weapon)

### Alchemy / Potions
- [ ] 🔴 Potion identity shuffle per run
- [ ] 🔴 Drink effect (immediate, reveals identity)
- [ ] 🔴 Item dipping (item gains/loses property)
- [ ] 🟡 Potion combination (two potions → logical result)
- [ ] 🟡 Transformation potion + limb = material change
- [ ] 🟡 Growth potion + vestigial limb = functional (or oversized)
- [ ] ⚪ Potion throwing (splash effect)

---

## Phase 4 — Ecology & Advanced Systems

### Adaptive Ecology
- [ ] 🔴 Combat profile tracker (records player attack types per run)
- [ ] 🔴 Enemy generation bias (fire user → fire-resistant variants spawn)
- [ ] 🟡 Headless variant generation (if player targets heads)
- [ ] 🟡 Insulator generation (if player uses electricity)
- [ ] ⚪ Multi-factor adaptation (multiple player patterns combined)

### Advanced Combat
- [ ] 🟡 Ranged attacks
- [ ] 🟡 Status effects (burning, bleeding, stunned, oxidizing)
- [ ] 🟡 Knockback / physics reactions
- [ ] ⚪ Grab / constrict (tentacle/serpentine)
- [ ] ⚪ Environmental hazards (pressure vents, electrical panels, zero-g sections)

### Bosses
- [ ] 🟡 Boss per deck (unique hybrid morphology)
- [ ] 🟡 Boss-specific mechanics (phase changes, unique materials)
- [ ] ⚪ Boss drops unique limb types

---

## Phase 5 — Progression & Meta

### Meta Progression
- [ ] 🔴 Run tracking (floor reached, enemies killed, cause of death)
- [ ] 🔴 Persistent unlock system (new morphologies, materials, ship types)
- [ ] 🟡 Starting loadout options (unlock more starting morphologies)
- [ ] 🟡 Cursed/blessed item system
- [ ] ⚪ Achievements

### Save / Load
- [ ] 🟡 Save current run state (browser localStorage)
- [ ] 🟡 Load on return
- [ ] 🟡 Run history

### Content
- [ ] 🟡 5+ enemy types per zone
- [ ] 🟡 3+ ship/zone types (procedurally distinct)
- [ ] 🟡 20+ item types
- [ ] 🟡 10+ potion types
- [ ] ⚪ Lore fragments (optional flavor text)
- [ ] ⚪ NPC encounters (neutral entities, traders)

---

## Phase 6 — Polish

### Visual
- [ ] 🟡 Full modular sprite system with all limb types
- [ ] 🟡 Composed animations for hybrid bodies
- [ ] 🟡 Particle effects (fire, electricity, blood, explosion)
- [ ] ⚪ Post-processing (CRT filter, vignette)
- [ ] ⚪ Death animations

### Audio
- [ ] 🟡 SFX: movement, combat, UI
- [ ] ⚪ Music: ambient per zone
- [ ] ⚪ Procedural audio variation

### UX
- [ ] 🟡 Tooltips on hover (item properties, limb stats)
- [ ] 🟡 Tutorial / first-run hints
- [ ] 🟡 Keyboard shortcut reference
- [ ] ⚪ Controller support
- [ ] ⚪ Mobile-friendly layout

---

## Icebox (good ideas, not prioritized)

- Multiplayer co-op (two Salvagers, shared ship)
- Procedural enemy name generator
- Reputation system with factions aboard the ship
- Full zero-gravity mechanics (certain decks)
- Body part trading with neutral NPCs
- Written lore that pieces together what happened to each ship

---

*Last updated: 2026-03-31*
