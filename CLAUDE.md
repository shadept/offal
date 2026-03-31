# OFFAL — Agent Context

Browser-based turn-based roguelike. Ship graveyard in deep space. Modular body system, material physics, emergent crafting. TypeScript + Phaser 4 + bitECS + Vite.

## Commands

```bash
npm install
npm run dev      # Vite dev server
```

Phase 0 scaffold is in place — Vite + Phaser 4 + bitECS + TypeScript.

## Project Structure

```
docs/
  GDD.md          # Game design document — the source of truth for all design
  BACKLOG.md      # Phased development backlog (Phase 0–10)
  SCHEMAS.md      # JSON5 data file schemas (materials, items, recipes, blueprints, species, etc.)
  claude/         # Deeper context for coding agents
    architecture.md   # Visual layer, ECS patterns, data-driven design
data/             # JSON5 content files
  materials/
  items/
  species/
  blueprints/
  recipes/
src/              # Game source
  ecs/            # Components, systems
  scenes/         # Phaser scenes
  data/           # JSON5 loader
  ui/             # Sandbox panel, HUD
```

## Architecture Constraints (non-negotiable)

1. **Logic and visual layers are ALWAYS separate.** Game state advances in discrete turns. The visual layer renders at 60fps independently. Logic never waits on rendering. Rendering never mutates game state.

2. **Visual event queue.** When a turn resolves, logic produces an ordered queue of visual events (`move`, `projectile`, `fire_spread`, `explosion`, etc.). The visual layer drains the queue sequentially. The next turn does not advance until the queue is empty. Players can skip/accelerate. This is event-driven visual interpolation — see `docs/claude/architecture.md`.

3. **Phaser 4 + bitECS.** Phaser 4 owns rendering, input, and asset loading. bitECS owns all game state as components/systems. No game logic in Phaser scenes — scenes orchestrate, ECS decides.

4. **All content in JSON5 data files.** Materials, items, species, blueprints, recipes, physics rules, function rules, faction relations, ecology rules, potion effects, unlocks — all defined in `data/*.json5`. No hardcoded content in game logic. The engine is generic; behaviour emerges from data. See `docs/SCHEMAS.md` for formats.

## Key Design References

- **Body system**: GDD.md §2 — slots, limbs, materials, organs, locomotion derived not declared
- **Physics**: GDD.md §3 — cell-based, property-driven, 8 core properties, generic rules
- **Crafting**: GDD.md §4 — tag-based recipe matching, crude composite fallback
- **AI/Factions**: GDD.md §5 — perception, faction relations, arrival state
- **Turn system**: GDD.md §7 — time-energy model, action cost determines turn order
- **Backlog phases**: BACKLOG.md — each phase has exit criteria; start with Phase 0
