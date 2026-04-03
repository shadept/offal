# Architecture — Visual Layer & ECS Patterns

## Visual Event Queue

The central architectural pattern. Logic and visuals communicate through events, never directly.

```
Turn resolves → logic pushes events to queue → visual layer drains queue → next turn
```

### Event shape

```ts
{ type: string, targets: number[], config: Record<string, any>, onComplete?: () => void }
```

Types (implemented per phase):
- `move` — entity tween A→B (Phase 1)
- `idle` — looping animation, never gated by turn state (Phase 1)
- `projectile` — sprite flies origin→target, damage applied on complete (Phase 4)
- `fire_spread` — ignition particles on newly burning tile (Phase 3)
- `explosion` — particles + camera shake + sound (Phase 3)
- `hit_flash` — tint white/red then restore (Phase 4)
- `death` — death animation, entity removed on complete (Phase 4)

### Rules

- Logic is tentative until the visual event resolves. Damage applies when the projectile arrives visually, not when the turn was calculated.
- Skip/accelerate: hold key to drain queue instantly.
- Ambient visuals (fire, sparks, idle animations) run outside the queue — they are Phaser particle emitters and sprite loops, not turn events.

## ECS (bitECS)

All game state lives in bitECS components. Phaser scenes read component data to render — they do not own state.

### Separation of concerns

| Layer | Owns | Does not own |
|---|---|---|
| bitECS systems | Game state, turn logic, physics, AI | Rendering, input, assets |
| Phaser scenes | Rendering, tweens, particles, input | Game state |
| Data files (JSON5) | Content definitions | Runtime state |

### Turn state machine

```
PLAYER_INPUT → PROCESSING → ANIMATION → ENEMY_TURN → ANIMATION → PLAYER_INPUT
```

Turn scheduler: time-energy model. Each action has a time cost. Entity with most available time acts next. Heavy limbs = higher action cost = fewer turns.

## Data-Driven Design

The engine has no hardcoded knowledge of specific materials, creatures, items, or physics interactions. All behaviour emerges from property values in JSON5 data files meeting generic rule evaluators.

Adding new content = adding a data file. The engine already knows what to do with it.

Key data paths (see `docs/SCHEMAS.md` for full schemas):
- `data/materials/` — physical properties (flammability, conductivity, hardness, etc.)
- `data/physics-rules.json5` — how states propagate (fire, electricity, etc.)
- `data/function-rules.json5` — limb type × slot role → capabilities
- `data/species/` → `data/blueprints/` — body structure hierarchy
- `data/recipes/` — tag-based crafting input matching
