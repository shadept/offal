# Body Capacities

> How a creature's functional state emerges from its parts.

**Status**: Design  
**Related**: [GDD.md](GDD.md) Section 2.7 | [body-system.md](body-system.md) | [SCHEMAS.md](SCHEMAS.md)

---

## Overview

Capacities are derived percentages (0-100%) that represent a creature's functional ability. They are not stats — they are consequences. A capacity value is recomputed from part state after every damage event, attachment, or detachment. Capacities drive gameplay: whether a creature can act, how fast it moves, whether it can hold a weapon, and how far it can see.

Four capacities exist:

| Capacity | Drives | At zero |
|---|---|---|
| **Consciousness** | Ability to act | Unconscious (alive but inert) |
| **Mobility** | Turn speed | Immobile |
| **Circulation** | Poison susceptibility, healing, consumables | Dead (if species has circulation), otherwise natural state |
| **Manipulation** | Item use, looting, crafting, interacting | Cannot use hands |

**Structural Integrity** was removed. Torso parts do not contribute to a capacity — they absorb damage and house organs. Their relevance is HP, not a derived stat.

---

## Part Degradation

Parts do not contribute capacity as a binary (functional / non-functional). A damaged part contributes less capacity proportional to its remaining HP, shaped by a **degradation curve** defined per part type.

### Degradation Modes

Two modes exist:

**Threshold** — The part contributes 100% above the threshold, 50% below the threshold (impaired but partially functional), and 0% at zero HP. This models parts that degrade in steps — a damaged leg hobbles before it fails completely.

```
if hpRatio >= threshold:
    contribution = 1.0
else if hpRatio > 0:
    contribution = 0.5
else:
    contribution = 0.0
```

**Linear** — The part contributes 100% above the threshold. Below the threshold, contribution scales linearly from 100% down to 0%. This models parts that degrade gradually — vision blurs, rotors sputter.

```
if hpRatio >= threshold:
    contribution = 1.0
else:
    contribution = hpRatio / threshold
```

### Degradation Table

Configured per part type. These are starting values — tune based on playtesting.

| Part Type | Mode | Threshold | Rationale |
|-----------|------|-----------|-----------|
| **head** | linear | 0.5 | Brain damage degrades gradually. Concussed before unconscious. |
| **torso** | — | — | Does not contribute to any capacity. Absorbs damage, houses organs. |
| **arm** | threshold | 0.3 | Functional enough to grip, or not. |
| **leg** | threshold | 0.3 | Bears weight, or doesn't. |
| **organ** | threshold | 0.0 | Works until destroyed. Heart pumps or it doesn't. |
| **sensor** | linear | 0.5 | Vision degrades. Blurry before blind. |
| **rotor** | linear | 0.3 | Mechanical parts sputter before failing. |
| **segment** | threshold | 0.2 | Structural — holds together or doesn't. |

### Capacity Formula

For each capacity type, sum contributions from all attached parts that list that capacity in their `capacityContribution` field:

```
totalWeight = number of parts contributing to this capacity
weightedSum = sum of each part's contribution (0.0 to 1.0, per degradation curve)
capacity% = round((weightedSum / totalWeight) * 100)
```

If no parts contribute to a capacity (totalWeight = 0), the capacity is 0%. No arms means no manipulation. No legs means no mobility. Systems that don't apply to a species are handled at the consumer level — e.g., serpentine locomotion ignores the mobility capacity and derives speed from segment parts directly, and robots without circulation organs are simply immune to poison by virtue of having 0% circulation.

---

## Consciousness

**Source parts**: head, brain-type organs  
**What it drives**: Whether the creature can take turns and make decisions.

### Acting Threshold

A creature needs **10% consciousness to act**. Below this threshold:

- The creature cannot take voluntary actions (move, attack, interact)
- AI stops making decisions for this entity
- The creature is alive but inert — a living body on the ground
- **Passive systems still function**: circulation, HP regen, poison spread, fire damage — the body doesn't stop working just because the brain is offline. The creature is still processed by physics, damage, and regen systems each turn. It simply cannot choose to act.
- FOV is **not affected** — the player can still see their surroundings when groggy. Information does not require consciousness; action does.

### Stamina Modifier

Consciousness is not purely derived from head/brain state. Overall body condition acts as a stamina modifier — a beat-up creature is easier to knock out:

```
partContribution  = capacity from consciousness parts (degradation curves)
staminaModifier   = 0.5 + 0.5 * (bodyHp / maxBodyHp)
consciousness     = partContribution * staminaModifier
```

At full body HP, stamina modifier is 1.0 (no penalty). At low body HP, it drops toward 0.5, effectively halving consciousness. This means a tired fighter goes down to a punch that a fresh fighter would tank.

### Recovery

Consciousness recovery is not a separate timer. It is a consequence of HP regeneration on consciousness-contributing parts.

- **Wake threshold: 15%** — a creature regains consciousness when effective consciousness rises above 15%. The 5% gap between KO (10%) and wake (15%) prevents flickering in and out of consciousness.
- HP regeneration is driven by circulation (see below)
- If all consciousness-contributing parts are at 0 HP and the creature has no circulation-based regen, consciousness is permanently zero — the creature is a living vegetable until someone transplants a new brain or head

### KO Frequency by Creature Size

KO frequency is an emergent property of HP ratios, not a rule. Small creatures have fragile heads and low body HP — they die before KO matters. Large creatures have sturdy heads that require deliberate targeting.

| Creature | Body HP | Head HP | Head % of Total | KO Likelihood |
|----------|---------|---------|-----------------|---------------|
| Void Rat | 10 | 2 | 20% | Almost never — dies first |
| Drone Scout | 14 | 1 (sensor) | 7% | Almost never — dies first |
| Salvager | 43 | 5 | 12% | Infrequent — requires focused head targeting |
| Security Bot | 60 | 8 | 13% | Rare — head is sturdy, deliberate tactic |

### AI Confusion (Future)

When consciousness is above the acting threshold but below 50%, AI creatures make mistakes:

- Move in the wrong direction (inverted or randomised pathfinding)
- Misidentify targets (attack allies, ignore enemies)
- Fail actions randomly

Player effects at low consciousness are TBD — camera effects, input delay, or similar are under consideration but not designed.

---

## Mobility

**Source parts**: leg, rotor, segment  
**What it drives**: `Turn.speed` — how quickly the creature accumulates energy to act.

### What Mobility Affects

Mobility affects **movement cost only** — how many energy points it costs to move one tile. It does **not** affect action speed. A legless creature can still fire a gun, swing a weapon, use items, and take any non-movement action at normal speed. They just can't walk.

This is critical for gameplay: losing legs is punishing (you can't reposition) but not a death sentence (you can still fight from where you stand).

### Movement Cost Scaling

Rather than reducing turn speed (which would slow ALL actions), mobility scales the energy cost of movement:

```
movementCost = baseMovementCost / max(mobilityFactor, 0.1)
```

The scaling should be gentle. Starting values:

| Mobility | Movement Cost Multiplier | Feel |
|----------|------------------------|------|
| 100% | 1.0x | Normal |
| 75% | 1.2x | Slightly slow — noticeable over distance |
| 50% | 1.5x | Hobbling — enemies close distance on you |
| 25% | 2.0x | Crawling — every tile is a commitment |
| 0% | Immobile | Cannot move at all. Can still act in place. |

**Locomotion-specific rules:**

**Biped**: Two legs = full mobility. One leg = threshold kicks in (50% contribution from impaired leg at best). Zero legs = 0% mobility = immobile.

**Quadruped**: More graceful degradation — losing one of four legs is a minor penalty. Losing three is severe.

**Hover/Serpentine**: Linear degradation from rotor/segment damage. Sputters before grounding.

### AI vs Player

For AI creatures, low mobility is effectively a soft kill — they can't chase or flee, making them easy targets. This is intentional. AI creatures with 0% mobility stand and fight (or cower) but never move.

For the player, 0% mobility is severe but survivable — you can still shoot, craft, loot (if arms work), and wait for help or regen. The game doesn't end; your tactical options narrow.

---

## Circulation

**Source parts**: heart (organic creatures only)  
**What it drives**: Healing, poison/toxic susceptibility, consumable effectiveness. Lethal at zero for creatures that depend on it.

Not all creatures have circulation. Robots, drones, and other synthetic creatures have no heart and no circulation system. They do not participate in this capacity at all — it stays at 0% permanently, which grants natural advantages (poison immunity) and disadvantages (no passive healing, no benefit from food/potions).

### Death

Circulation = 0% is lethal **only for creatures that have circulation-contributing parts**. If a creature's species has a heart and it is destroyed, the creature dies — blood stops flowing. If a creature never had circulation parts (robots), 0% circulation is their natural state and does not trigger death.

### Poison and Toxics

Circulation is the transport system. Higher circulation means substances spread faster through the body — **for good and bad**.

- **Higher circulation = more vulnerable to poison/toxics.** Blood carries the poison to organs faster. A healthy creature is more susceptible to gas attacks.
- **Lower/zero circulation = resistant to poison.** Robots have no circulation and are immune to toxic gas. A creature with a barely-functioning heart takes less poison damage.

Toxic damage multiplier (starting value):

```
poisonMultiplier = circulation / 100
```

At 100% circulation: full poison damage. At 50%: half damage. At 0%: immune (also dead for organics, but relevant for robots that simply lack a heart).

### Consumable Healing

Circulation gates the effectiveness of food, potions, and other consumables that heal through ingestion. No circulation = the substance has no way to reach damaged tissue.

```
healingEffectiveness = circulation / 100
```

A creature at 50% circulation receives 50% of a potion's healing. A robot (0% circulation) receives nothing from food — it must be repaired mechanically.

### Natural HP Regeneration (Future)

Tied to circulation. Planned but not yet implemented.

- Circulation drives regen rate: `regenRate = baseRegen * (circulation / 100)`
- Requires a satiation threshold (full belly, like traditional roguelikes)
- No circulation = no natural healing
- Robots must be repaired via crafting, tools, or compatible parts
- This creates a meaningful asymmetry: organics heal slowly for free, synthetics need resources but are poison-immune

---

## Manipulation

**Source parts**: arm, tentacle (in arm slot), manipulator appendages  
**What it drives**: All hand-dependent interactions.

### Gated Actions

At 0% manipulation, a creature **cannot**:

- Pick up items
- Drop items intentionally
- Loot corpses or containers
- Craft anything
- Equip or use weapons
- Press buttons, operate consoles, open doors with handles
- Attach or detach body parts (on self or others)

A creature **can** still:

- Attack with non-manipulation weapons (bite, headbutt, kick, body slam)
- Move
- Be looted
- Take damage normally

### Degradation

Arms use a threshold curve at 0.3. An arm above 30% HP is fully functional. Below 30% it contributes nothing — the hand can't grip. With two arms, losing one drops manipulation to 50%. Losing both drops to 0%.

### Player Tuning (Future)

The extreme version (0% manipulation = no interaction) applies to all creatures uniformly. This may be too punishing for the player. Future tuning may introduce:

- Degraded manipulation allowing slow/clumsy interactions instead of blocking them
- A minimum manipulation threshold for the player specifically
- Teeth/mouth as a fallback manipulation source for specific actions

These are not designed yet. The system ships strict, then softens based on playtesting.

---

## Sensors and FOV

**Source parts**: sensor-type parts (eyes, sensor pods)  
**What it drives**: `FOV.range` — how far the creature can see.

Sensor contribution is **not** routed through the consciousness capacity. A creature can be fully conscious (brain intact) but blind (eyes destroyed), or unconscious (brain damaged) but with intact eyes (irrelevant since it can't act).

### FOV Calculation

Sensors use a linear degradation curve with threshold 0.5:

```
sensorContribution = sum of each sensor part's degraded contribution
maxContribution = number of sensor parts
sensorRatio = sensorContribution / maxContribution  (or 1.0 if no sensor parts)
fovRange = max(1, round(species.fovRange * sensorRatio))
```

- At 100% sensor health: full species FOV range (e.g., 8 tiles)
- At 50% sensor health (threshold): FOV starts degrading
- Linear degradation below 50%: FOV shrinks progressively
- At 0% (all sensors destroyed): FOV = 1 (touch range — the creature can perceive only its immediate tile)

### Minimum FOV

FOV never drops below 1. A blind creature can still sense what is directly adjacent through touch, sound, vibration. This prevents the game from becoming completely unplayable while still being a severe disadvantage.

---

## Interaction Between Capacities

Capacities are independent but interact through their shared dependency on body state:

| Scenario | Cascading Effects |
|---|---|
| Head destroyed | Consciousness drops (possibly to 0 = unconscious). If head is a required part, creature dies regardless. |
| Heart destroyed | Circulation = 0 = death. Also stops all regen, making every other injury permanent in the moments before death. |
| Both legs severed | Mobility = 0. Creature is conscious and can still fight (arms, bite) but cannot move. Easy target. |
| Both arms severed | Manipulation = 0. Cannot loot, craft, equip, or interact. Can still move and headbutt. |
| Eyes destroyed | FOV = 1. Conscious and mobile but effectively blind. AI wanders randomly. Player sees only adjacent tile. |
| Heart damaged (50% HP) | Circulation drops. Regen slows. Poison is less effective (silver lining). Consumables are half as effective. |
| All consciousness parts below threshold | Unconscious. Body lies on ground. Can be looted like a corpse. Regen may bring parts back above threshold = wake up. |

### Robots vs Organics

The capacity system creates natural asymmetries between organic and synthetic creatures without special-case code:

| Aspect | Organic | Synthetic |
|---|---|---|
| Circulation | Has heart. Heals from food. Vulnerable to poison. Heart destruction = death. | No circulation system. Immune to poison. Cannot eat to heal. No passive regen. Must be repaired. |
| Consciousness | Head + brain. Can be knocked unconscious. Recovers via regen. | Sensor pod / CPU. Damaged = offline. No regen = permanent until repaired. |
| Mobility | Legs. Threshold-based — works or doesn't. | Rotors. Linear degradation — sputters before failing. |
| Manipulation | Arms. Either grips or doesn't. | Manipulator arms. Same threshold. |

---

## Data Bugs (Fixed)

- ~~`human_lungs` had `capacityContribution: ["consciousness"]`~~ — Changed to `["circulation"]`.
- ~~Sensor parts had `capacityContribution: ["consciousness"]`~~ — Changed to `null`. Sensors drive FOV directly.
- ~~Torso/segment parts had `structuralIntegrity`~~ — Changed to `null`. Capacity removed.

---

## Implementation Notes

### Current State

- Capacity percentages are stored on the `Body` component (merged from the former `CachedCapacity` component)
- `recalcCapacities()` recomputes after every damage/attach/detach event
- Binary functional check (`hp > 0`) — needs to be replaced with degradation curves
- Consciousness has no acting threshold or stamina modifier — needs implementation
- FOV is static per species — needs to be driven by sensor state
- Manipulation gates nothing — needs integration with inventory/loot/craft actions
- Circulation death check fires on 0% regardless of species — needs to only apply to creatures with circulation parts
- Circulation does not affect poison/toxic damage — needs modifier
- `structuralIntegrity` field on Body component — needs removal
- Data files already fixed (lungs, sensors, torsos)

### Implementation Order

1. **Remove structuralIntegrity** — Drop the field from Body component and all code references.
2. **Degradation curves** — Static config per part type in `body.ts`. Replace binary check in `recalcCapacities` with degradation logic (threshold mode: 100%/50%/0%, linear mode: scales below threshold).
3. **Consciousness stamina modifier** — Apply `0.5 + 0.5 * (bodyHp / maxBodyHp)` to consciousness after part contribution.
4. **Consciousness KO** — Skip voluntary actions when consciousness < 10%. Wake at 15%. Passive systems (damage, regen, physics) still process.
5. **Sensor-driven FOV** — After recalcCapacities, recompute `FOV.range` from sensor part state using degradation curve. Min FOV = 1.
6. **Mobility → movement cost** — Mobility affects movement energy cost, not turn speed. 0% = immobile but can still act in place.
7. **Circulation death fix** — Only kill on circulation = 0% if creature has circulation-contributing parts.
8. **Circulation poison modifier** — Multiply toxic/gas damage by `circulation / 100`.
9. **Manipulation gates** — Check manipulation > 0 before pickup, drop, loot, craft, attach, interact.
10. **Natural HP regen** (future) — Circulation-driven, satiation-gated.
11. **AI confusion** (future) — Low consciousness affects AI decision-making.
