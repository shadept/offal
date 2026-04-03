# Creature & Body Part Design Guide

How to design creatures, body plans, HP budgets, hitWeights, and attack tuples for OFFAL. These principles emerged from balancing the initial creature roster and should be followed when adding new species.

---

## Core Principle: Body HP Pool + Torso-Dominant Targeting

**Body HP is an independent pool** — it is NOT the sum of part HPs. Damage to any part reduces both that part's local HP (for severing) and the body HP pool. Death occurs when body HP reaches 0.

**Part local HP only matters for severing.** A limb at 0 local HP is severed and dropped. But the creature doesn't die from losing a limb — it dies when the body HP pool is depleted.

**Torso/segment parts cannot be severed.** They absorb hits and reduce body HP, but they stay attached even at 0 local HP. This prevents the nonsensical state of a creature walking around without a torso.

This creates a system where:
- Most combat damage chips away at the body HP pool via torso hits — a recoverable resource
- Limb loss is rare but dramatic — a permanent consequence that changes gameplay
- Players can survive extended fights without dismemberment, but unlucky hits matter
- Creatures don't die from a single part being destroyed — they die from cumulative damage

---

## HP Budget

There are two HP systems working in parallel:
- **Body HP** (`species.maxHp`): the creature's overall health pool. All damage reduces this.
- **Part local HP** (`part.maxHp`): per-part severing threshold. Only matters for determining when a limb falls off.

Convention: `species.maxHp` = sum of all `part.maxHp` values. This makes the budget easy to reason about — each part "contributes" a slice of the total, even though the pools are tracked independently.

### Distribution Rules

1. **Torso gets 30-50% of total HP.** Its local HP determines how many hits before the torso is "destroyed" (deactivated, not severed). Since the torso has ~58% coverage, its local HP burns fastest, but the body HP pool absorbs all damage regardless.
2. **Limbs get 7-10% each.** Small local HP = they sever quickly when hit. But with ~10% coverage each, direct hits are rare.
3. **Head gets 10-15%.** Important (often a required part) but small target.
4. **Internal organs get 5-8% each.** Protected by depth (only reachable by stab/energy damage types). Small HP pools because they're hard to reach.
5. **Sensors (eyes, arrays) get 1-3%.** Tiny, rarely hit, devastating when lost.

### Reference Table (Current Roster)

| Species | Total HP | Torso HP (%) | Limb HP | Head HP | Organ HP |
|---------|----------|-------------|---------|---------|----------|
| Salvager | 43 | 14 (33%) | Arm 3, Leg 4 | 5 (12%) | 3 each |
| Void Rat | 10 | 4 (40%) | Leg 1 | 2 (20%) | — |
| Hull Leech | 28 | 14 (50%) | — | — | 5 each |
| Security Bot | 60 | 22 (37%) | Arm 5, Leg 7 | 8 (13%) | 4 |
| Scout Drone | 14 | 6 (43%) | Rotor 2 | — | 3 |

### Scaling Guidelines

- **Vermin/trash mobs** (rats, bugs): 8-15 total HP. Simple body plans, few parts. Should die in 1-2 player hits.
- **Standard threats** (leeches, drones): 14-30 total HP. More interesting body plans. 2-4 hits to kill.
- **Dangerous enemies** (security bots, elites): 50-80 total HP. Full body plans. Require equipment or tactics to defeat.
- **Bosses/minibosses**: 80-150 total HP. Consider unique parts with special onDetach effects.

---

## hitWeight (Target Probability)

hitWeight determines the probability of a part being hit by an attack. It is an absolute weight — the probability is `partWeight / sumOfAllExternalWeights`.

### Target Coverage Bands

| Coverage | hitWeight guidance | Used for |
|----------|-------------------|----------|
| **55-65%** | Torso/core — the default target | Torso, chassis, body segment |
| **8-12%** | Secondary limbs — hit occasionally | Legs, arms |
| **5-8%** | Tertiary targets — uncommon hits | Head, manipulators |
| **1-3%** | Rare targets — almost never hit | Eyes, sensor arrays, antennae |

### Key Ratio: Torso vs Single Limb

The torso should be **5-8x more likely** to be hit than any single limb. This is the most important ratio in the system.

Example (Salvager):
- Torso hitWeight 60, Leg hitWeight 10 → ratio 6:1
- Probability of hitting the same leg twice in a row: ~1%

### Internal Parts

Internal parts have hitWeight for stab/energy damage targeting but are filtered out for blunt/cut attacks. Set their hitWeights lower than external parts — they're protected by the body.

### Body Plan Archetypes

| Archetype | Torso coverage | Notes |
|-----------|---------------|-------|
| **Humanoid biped** | 55-60% | Arms and legs as secondary targets, head as tertiary |
| **Quadruped** | 55-60% | Four legs each at low weight; losing one leg is less impactful |
| **Serpentine** | 80-85% | Body segment IS the creature; maw is the only other meaningful target |
| **Hover/drone** | 60-65% | Core dominant; rotors as secondary targets |
| **Insectoid** | 50-55% | More distributed; many small limbs each at very low weight |

---

## Attack Damage Tuples

Damage is defined as `[min, max]` — rolled uniformly inclusive. The tuple format allows variance while keeping everything data-driven.

### Design Rules

1. **Range should be ~50-60% of the midpoint.** A creature with avg 5 damage should have a range of [4, 6] (range of 2, midpoint 5, ratio 40%) or [3, 7] (range of 4, midpoint 5, ratio 80%). Narrower ranges feel more predictable; wider ranges add more chaos.

2. **min should always be >= 1.** A hit that deals 0 damage feels broken.

3. **Relationship to limb HP.** The key feel question: how many hits from this creature does it take to sever a player limb?

| Intended threat level | Hits to sever player limb | Example |
|----------------------|--------------------------|---------|
| Vermin (rat, bug) | 2-4 hits (if they keep hitting the same limb) | [2, 4] vs 4 HP leg |
| Standard threat | 1-2 hits | [2, 4] vs 3 HP arm |
| Dangerous | 1 hit can sever most limbs | [5, 8] vs 4 HP leg |
| Boss | 1 hit severs, may one-shot torso | [8, 14] vs 14 HP torso |

4. **The effective threat is damage * hit probability.** A creature that deals [5, 8] sounds scary, but if the torso absorbs 55% of hits and has 14 HP, it takes 2-3 hits to the torso before limbs are even at risk. The real question is: **in an average fight, what's the probability of losing a limb?**

### Reference Table

| Species | Attack | Avg | vs Salvager Torso | vs Salvager Leg |
|---------|--------|-----|-------------------|-----------------|
| Void Rat | [2, 4] | 3 | 5-7 hits to destroy | 1-2 hits |
| Hull Leech | [2, 4] | 3 | 5-7 hits | 1-2 hits |
| Scout Drone | [1, 3] | 2 | 7-14 hits | 2-4 hits |
| Security Bot | [5, 8] | 6.5 | 2-3 hits | 1 hit |
| Salvager | [4, 6] | 5 | — | — |

---

## Designing a New Creature: Checklist

1. **Pick an archetype** from the body plan table above. This determines torso coverage and part layout.

2. **Set total HP** based on threat tier (vermin/standard/dangerous/boss).

3. **Distribute HP budget:**
   - Assign torso 30-50% of total
   - Assign limbs 7-10% each
   - Assign organs 5-8% each
   - Verify: `sum of all part maxHp == species maxHp`

4. **Set hitWeights:**
   - Torso at 55-65% coverage
   - Check the torso:limb ratio is 5-8x
   - Sensors/eyes at 1-3%

5. **Set attack damage tuple:**
   - Determine intended threat level
   - Set [min, max] so that avg damage vs player limb HP gives the right "hits to sever" count
   - Remember: most hits land on torso, so effective limb threat is much lower than raw damage suggests

6. **Run the combat simulation** (`node scripts/combat-sim.mjs`):
   - Add the new creature to both OLD and NEW sections (or just NEW for new creatures)
   - Check: player win rate matches intended threat level
   - Check: limb loss rate feels right for the creature's role
   - Check: average fight duration is reasonable (1-2 turns for trash, 3-5 for standard, 5+ for dangerous)

7. **Validate required parts and death conditions:**
   - Which parts are in `requiredParts`? Losing these kills the creature.
   - Does `deathOnCirculation0` apply? (organs contribute to circulation)
   - Test: can the player kill the creature by targeting non-torso parts?

---

## Common Mistakes

- **Uniform HP distribution.** If all parts have similar HP, the creature has no damage sponge and limbs fall off too easily. Always make the torso dominant.

- **hitWeights that match HP.** A part with high HP doesn't need high hitWeight. The torso is hit often AND has high HP — that's what makes it the sponge. A head might have moderate HP but low hitWeight.

- **Attack damage too close to limb HP.** If a creature's average damage equals a limb's HP, that limb gets one-shot 50% of the time it's targeted. For anything below "dangerous" tier, average damage should be 50-75% of the smallest limb's HP.

- **Forgetting that fights have multiple rounds.** A creature with [2, 4] damage seems weak, but over 3-4 rounds of combat it gets 3-4 attacks. Each has a small chance of hitting a limb. Over many encounters across a run, those small chances accumulate.

- **Internal organs with too much HP.** Internal organs are already protected by depth filtering (blunt/cut can't reach them). They don't need high HP — their protection comes from being untargetable by most damage types, not from tankiness.

- **Confusing body HP with part HP.** Body HP is the creature's overall health — all damage reduces it. Part local HP is only for severing. A creature dies when body HP = 0, NOT when any single part's HP = 0. The torso's local HP reaching 0 doesn't kill the creature; it just means the torso is "destroyed" (deactivated) but the creature fights on until body HP is depleted.

- **Part HP budget exceeding body HP.** Since body HP = sum of part HPs by convention, and all damage reduces body HP, the body HP will reach 0 before all parts are individually destroyed. This is by design — the creature dies from cumulative damage, not from every part breaking.
