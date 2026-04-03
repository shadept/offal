#!/usr/bin/env node
/**
 * Combat simulation — compares old (sum-of-parts HP) vs new (body HP pool) system.
 * Runs N fights for each matchup and reports statistics.
 *
 * OLD model: body HP = sum of part HPs, torso at 0 = death
 * NEW model: body HP is independent pool, damage reduces both body HP and part HP
 */

const RUNS = 10_000;

// ─── Species definitions ────────────────────────────────────
// NEW uses the updated HP/hitWeight/attack values + body HP pool model

const OLD = {
  salvager: {
    attack: [5, 5], totalHp: 25,
    parts: [
      { name: 'Torso',   hp: 5,  hitWeight: 40, depth: 'external', role: 'torso' },
      { name: 'Head',    hp: 3,  hitWeight: 10, depth: 'external', role: 'head' },
      { name: 'Leg L',   hp: 3,  hitWeight: 18, depth: 'external', role: 'leg' },
      { name: 'Leg R',   hp: 3,  hitWeight: 18, depth: 'external', role: 'leg' },
      { name: 'Arm L',   hp: 2,  hitWeight: 12, depth: 'external', role: 'arm' },
      { name: 'Arm R',   hp: 2,  hitWeight: 12, depth: 'external', role: 'arm' },
      { name: 'Eyes',    hp: 1,  hitWeight: 2,  depth: 'external', role: 'sensor' },
      { name: 'Heart',   hp: 2,  hitWeight: 4,  depth: 'internal', role: 'organ' },
      { name: 'Lungs',   hp: 2,  hitWeight: 6,  depth: 'internal', role: 'organ' },
      { name: 'Stomach', hp: 2,  hitWeight: 6,  depth: 'internal', role: 'organ' },
    ],
  },
  void_rat: {
    attack: [2, 2], totalHp: 6,
    parts: [
      { name: 'Rat Body', hp: 2, hitWeight: 6, depth: 'external', role: 'torso' },
      { name: 'Rat Head', hp: 1, hitWeight: 2, depth: 'external', role: 'head' },
      { name: 'Leg FL',   hp: 1, hitWeight: 2, depth: 'external', role: 'leg' },
      { name: 'Leg FR',   hp: 1, hitWeight: 2, depth: 'external', role: 'leg' },
      { name: 'Leg BL',   hp: 1, hitWeight: 2, depth: 'external', role: 'leg' },
      { name: 'Leg BR',   hp: 1, hitWeight: 2, depth: 'external', role: 'leg' },
    ],
  },
  hull_leech: {
    attack: [3, 3], totalHp: 14,
    parts: [
      { name: 'Body Segment', hp: 5,  hitWeight: 30, depth: 'external', role: 'segment' },
      { name: 'Maw',          hp: 2,  hitWeight: 5,  depth: 'external', role: 'mouth' },
      { name: 'Eyestalks',    hp: 1,  hitWeight: 1,  depth: 'external', role: 'sensor' },
      { name: 'Leech Heart',  hp: 3,  hitWeight: 4,  depth: 'internal', role: 'organ' },
      { name: 'Digestive Sac',hp: 3,  hitWeight: 5,  depth: 'internal', role: 'organ' },
    ],
  },
  security_bot: {
    attack: [6, 6], totalHp: 30,
    parts: [
      { name: 'Chassis',       hp: 8, hitWeight: 50, depth: 'external', role: 'torso' },
      { name: 'Sensor Head',   hp: 5, hitWeight: 12, depth: 'external', role: 'head' },
      { name: 'Arm L',         hp: 3, hitWeight: 14, depth: 'external', role: 'arm' },
      { name: 'Arm R',         hp: 3, hitWeight: 14, depth: 'external', role: 'arm' },
      { name: 'Leg L',         hp: 4, hitWeight: 20, depth: 'external', role: 'leg' },
      { name: 'Leg R',         hp: 4, hitWeight: 20, depth: 'external', role: 'leg' },
      { name: 'Sensor Array',  hp: 1, hitWeight: 3,  depth: 'external', role: 'sensor' },
      { name: 'Power Core',    hp: 2, hitWeight: 8,  depth: 'internal', role: 'organ' },
    ],
  },
  drone_scout: {
    attack: [2, 2], totalHp: 8,
    parts: [
      { name: 'Drone Core',  hp: 2, hitWeight: 8, depth: 'external', role: 'torso' },
      { name: 'Rotor L',     hp: 1, hitWeight: 4, depth: 'external', role: 'rotor' },
      { name: 'Rotor R',     hp: 1, hitWeight: 4, depth: 'external', role: 'rotor' },
      { name: 'Sensor Pod',  hp: 1, hitWeight: 2, depth: 'external', role: 'sensor' },
      { name: 'Micro Cell',  hp: 2, hitWeight: 3, depth: 'internal', role: 'organ' },
    ],
  },
};

const NEW = {
  salvager: {
    attack: [4, 6], totalHp: 43,
    parts: [
      { name: 'Torso',   hp: 14, hitWeight: 60, depth: 'external', role: 'torso' },
      { name: 'Head',    hp: 5,  hitWeight: 6,  depth: 'external', role: 'head' },
      { name: 'Leg L',   hp: 4,  hitWeight: 10, depth: 'external', role: 'leg' },
      { name: 'Leg R',   hp: 4,  hitWeight: 10, depth: 'external', role: 'leg' },
      { name: 'Arm L',   hp: 3,  hitWeight: 8,  depth: 'external', role: 'arm' },
      { name: 'Arm R',   hp: 3,  hitWeight: 8,  depth: 'external', role: 'arm' },
      { name: 'Eyes',    hp: 1,  hitWeight: 1,  depth: 'external', role: 'sensor' },
      { name: 'Heart',   hp: 3,  hitWeight: 4,  depth: 'internal', role: 'organ' },
      { name: 'Lungs',   hp: 3,  hitWeight: 6,  depth: 'internal', role: 'organ' },
      { name: 'Stomach', hp: 3,  hitWeight: 6,  depth: 'internal', role: 'organ' },
    ],
  },
  void_rat: {
    attack: [2, 4], totalHp: 10,
    parts: [
      { name: 'Rat Body', hp: 4, hitWeight: 10, depth: 'external', role: 'torso' },
      { name: 'Rat Head', hp: 2, hitWeight: 2,  depth: 'external', role: 'head' },
      { name: 'Leg FL',   hp: 1, hitWeight: 2,  depth: 'external', role: 'leg' },
      { name: 'Leg FR',   hp: 1, hitWeight: 2,  depth: 'external', role: 'leg' },
      { name: 'Leg BL',   hp: 1, hitWeight: 2,  depth: 'external', role: 'leg' },
      { name: 'Leg BR',   hp: 1, hitWeight: 2,  depth: 'external', role: 'leg' },
    ],
  },
  hull_leech: {
    attack: [2, 4], totalHp: 28,
    parts: [
      { name: 'Body Segment', hp: 14, hitWeight: 35, depth: 'external', role: 'segment' },
      { name: 'Maw',          hp: 3,  hitWeight: 5,  depth: 'external', role: 'mouth' },
      { name: 'Eyestalks',    hp: 1,  hitWeight: 1,  depth: 'external', role: 'sensor' },
      { name: 'Leech Heart',  hp: 5,  hitWeight: 4,  depth: 'internal', role: 'organ' },
      { name: 'Digestive Sac',hp: 5,  hitWeight: 5,  depth: 'internal', role: 'organ' },
    ],
  },
  security_bot: {
    attack: [5, 8], totalHp: 60,
    parts: [
      { name: 'Chassis',       hp: 22, hitWeight: 65, depth: 'external', role: 'torso' },
      { name: 'Sensor Head',   hp: 8,  hitWeight: 8,  depth: 'external', role: 'head' },
      { name: 'Arm L',         hp: 5,  hitWeight: 10, depth: 'external', role: 'arm' },
      { name: 'Arm R',         hp: 5,  hitWeight: 10, depth: 'external', role: 'arm' },
      { name: 'Leg L',         hp: 7,  hitWeight: 12, depth: 'external', role: 'leg' },
      { name: 'Leg R',         hp: 7,  hitWeight: 12, depth: 'external', role: 'leg' },
      { name: 'Sensor Array',  hp: 2,  hitWeight: 1,  depth: 'external', role: 'sensor' },
      { name: 'Power Core',    hp: 4,  hitWeight: 8,  depth: 'internal', role: 'organ' },
    ],
  },
  drone_scout: {
    attack: [1, 3], totalHp: 14,
    parts: [
      { name: 'Drone Core',  hp: 6, hitWeight: 12, depth: 'external', role: 'torso' },
      { name: 'Rotor L',     hp: 2, hitWeight: 3,  depth: 'external', role: 'rotor' },
      { name: 'Rotor R',     hp: 2, hitWeight: 3,  depth: 'external', role: 'rotor' },
      { name: 'Sensor Pod',  hp: 1, hitWeight: 1,  depth: 'external', role: 'sensor' },
      { name: 'Micro Cell',  hp: 3, hitWeight: 3,  depth: 'internal', role: 'organ' },
    ],
  },
};

// ─── Simulation engine ──────────────────────────────────────

function rollDamage([min, max]) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function selectPart(parts, damageType) {
  const externalOnly = damageType === 'blunt' || damageType === 'cut';
  const candidates = [];
  let totalWeight = 0;

  for (const p of parts) {
    if (p.currentHp <= 0) continue;
    if (externalOnly && p.depth !== 'external') continue;
    candidates.push(p);
    totalWeight += p.hitWeight;
  }

  if (candidates.length === 0 || totalWeight === 0) return null;

  let roll = Math.random() * totalWeight;
  for (const c of candidates) {
    roll -= c.hitWeight;
    if (roll <= 0) return c;
  }
  return candidates[candidates.length - 1];
}

/**
 * OLD model: body HP = sum of part HPs, torso at 0 = death
 */
function isAliveOld(creature) {
  // Torso destroyed = death (structuralIntegrity)
  const torso = creature.parts.find(p => p.role === 'torso' || p.role === 'segment');
  if (torso && torso.currentHp <= 0) return false;

  // All organs dead = death (circulation)
  const organs = creature.parts.filter(p => p.role === 'organ');
  if (organs.length > 0 && organs.every(p => p.currentHp <= 0)) return false;

  return true;
}

/**
 * NEW model: body HP pool, tracked independently from parts
 */
function isAliveNew(creature) {
  // Body HP pool depleted = death
  if (creature.bodyHp <= 0) return false;

  // All organs dead = death (circulation)
  const organs = creature.parts.filter(p => p.role === 'organ');
  if (organs.length > 0 && organs.every(p => p.currentHp <= 0)) return false;

  return true;
}

function makeFighter(speciesData, model) {
  return {
    ...speciesData,
    bodyHp: speciesData.totalHp,
    parts: speciesData.parts.map(p => ({ ...p, currentHp: p.hp })),
    isAlive: model === 'old' ? isAliveOld : isAliveNew,
  };
}

function simulateFight(attackerDef, defenderDef, model) {
  const attacker = makeFighter(attackerDef, model);
  const defender = makeFighter(defenderDef, model);

  let turns = 0;
  const maxTurns = 200;

  while (turns < maxTurns) {
    turns++;

    // Attacker hits defender
    const dmg1 = rollDamage(attacker.attack);
    const target1 = selectPart(defender.parts, 'blunt');
    if (target1) {
      target1.currentHp = Math.max(0, target1.currentHp - dmg1);
    }
    if (model === 'new') {
      // Body HP pool always takes damage, even if no part was targeted
      defender.bodyHp = Math.max(0, defender.bodyHp - dmg1);
    }
    if (!defender.isAlive(defender)) break;

    // Defender hits attacker
    const dmg2 = rollDamage(defender.attack);
    const target2 = selectPart(attacker.parts, 'blunt');
    if (target2) {
      target2.currentHp = Math.max(0, target2.currentHp - dmg2);
    }
    if (model === 'new') {
      attacker.bodyHp = Math.max(0, attacker.bodyHp - dmg2);
    }
    if (!attacker.isAlive(attacker)) break;
  }

  const playerAlive = attacker.isAlive(attacker);

  const severedParts = attacker.parts
    .filter(p => p.currentHp <= 0 && p.depth === 'external')
    .map(p => p.name);

  const bodyHpRemaining = model === 'new'
    ? attacker.bodyHp
    : attacker.parts.reduce((s, p) => s + p.currentHp, 0);

  return {
    turns,
    playerAlive,
    severedParts,
    bodyHpRemaining,
    bodyHpMax: attacker.totalHp,
    limbsLost: severedParts.filter(n => /leg|arm|rotor/i.test(n)).length,
    legsLost: severedParts.filter(n => /leg/i.test(n)).length,
    armsLost: severedParts.filter(n => /arm/i.test(n)).length,
  };
}

function runMatchup(label, playerDef, enemyDef, runs, model) {
  const results = [];
  for (let i = 0; i < runs; i++) {
    results.push(simulateFight(playerDef, enemyDef, model));
  }

  const wins = results.filter(r => r.playerAlive).length;
  const avgTurns = (results.reduce((s, r) => s + r.turns, 0) / runs).toFixed(1);

  const anyLimbLost = results.filter(r => r.limbsLost > 0).length;
  const anyLegLost = results.filter(r => r.legsLost > 0).length;
  const anyArmLost = results.filter(r => r.armsLost > 0).length;

  const survivors = results.filter(r => r.playerAlive);
  const avgHpRemaining = survivors.length
    ? (survivors.reduce((s, r) => s + r.bodyHpRemaining, 0) / survivors.length).toFixed(1)
    : '0';
  const avgHpPct = survivors.length
    ? (survivors.reduce((s, r) => s + (r.bodyHpRemaining / r.bodyHpMax) * 100, 0) / survivors.length).toFixed(1)
    : '0';

  // Part loss breakdown
  const partLossCount = {};
  for (const r of results) {
    for (const name of r.severedParts) {
      partLossCount[name] = (partLossCount[name] || 0) + 1;
    }
  }

  console.log(`\n  ${label}`);
  console.log(`  ${'─'.repeat(55)}`);
  console.log(`  Win rate:           ${(wins/runs*100).toFixed(1)}%  (${wins}/${runs})`);
  console.log(`  Avg turns:          ${avgTurns}`);
  console.log(`  Avg HP remaining:   ${avgHpRemaining} / ${playerDef.totalHp} (${avgHpPct}%)`);
  console.log(`  Any limb lost:      ${(anyLimbLost/runs*100).toFixed(1)}%`);
  console.log(`    Legs lost:        ${(anyLegLost/runs*100).toFixed(1)}%`);
  console.log(`    Arms lost:        ${(anyArmLost/runs*100).toFixed(1)}%`);

  if (Object.keys(partLossCount).length > 0) {
    console.log(`  Player part losses:`);
    const sorted = Object.entries(partLossCount).sort((a, b) => b[1] - a[1]);
    for (const [name, count] of sorted) {
      console.log(`    ${name.padEnd(16)} ${(count/runs*100).toFixed(1)}%`);
    }
  }
}

// ─── Run all matchups ────────────────────────────────────────

function runSuite(label, defs, model) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  ${label}`);
  console.log(`${'═'.repeat(60)}`);

  runMatchup('Salvager vs Void Rat', defs.salvager, defs.void_rat, RUNS, model);
  runMatchup('Salvager vs Hull Leech', defs.salvager, defs.hull_leech, RUNS, model);
  runMatchup('Salvager vs Security Bot', defs.salvager, defs.security_bot, RUNS, model);
  runMatchup('Salvager vs Scout Drone', defs.salvager, defs.drone_scout, RUNS, model);
}

runSuite('OLD SYSTEM (sum-of-parts HP, torso = death)', OLD, 'old');
runSuite('NEW SYSTEM (body HP pool, damage tuples, torso-dominant)', NEW, 'new');

// ─── Direct comparison ──────────────────────────────────────

console.log(`\n${'═'.repeat(60)}`);
console.log('  DIRECT COMPARISON');
console.log(`${'═'.repeat(60)}`);

const matchups = ['void_rat', 'hull_leech', 'security_bot', 'drone_scout'];
const labels = ['Void Rat', 'Hull Leech', 'Security Bot', 'Scout Drone'];

for (let m = 0; m < matchups.length; m++) {
  const enemy = matchups[m];
  let oldLimbs = 0, newLimbs = 0;
  let oldLegs = 0, newLegs = 0;
  let oldWins = 0, newWins = 0;
  let oldHpPct = 0, newHpPct = 0;
  let oldWinCount = 0, newWinCount = 0;

  for (let i = 0; i < RUNS; i++) {
    const oldR = simulateFight(OLD.salvager, OLD[enemy], 'old');
    const newR = simulateFight(NEW.salvager, NEW[enemy], 'new');
    if (oldR.limbsLost > 0) oldLimbs++;
    if (newR.limbsLost > 0) newLimbs++;
    if (oldR.legsLost > 0) oldLegs++;
    if (newR.legsLost > 0) newLegs++;
    if (oldR.playerAlive) { oldWins++; oldHpPct += (oldR.bodyHpRemaining / oldR.bodyHpMax) * 100; oldWinCount++; }
    if (newR.playerAlive) { newWins++; newHpPct += (newR.bodyHpRemaining / newR.bodyHpMax) * 100; newWinCount++; }
  }

  const oldAvgHp = oldWinCount ? (oldHpPct / oldWinCount).toFixed(1) : '0';
  const newAvgHp = newWinCount ? (newHpPct / newWinCount).toFixed(1) : '0';

  console.log(`\n  vs ${labels[m]}:`);
  console.log(`    Win rate:    OLD ${(oldWins/RUNS*100).toFixed(1)}%  →  NEW ${(newWins/RUNS*100).toFixed(1)}%`);
  console.log(`    HP remain:   OLD ${oldAvgHp}%  →  NEW ${newAvgHp}%`);
  console.log(`    Any limb:    OLD ${(oldLimbs/RUNS*100).toFixed(1)}%  →  NEW ${(newLimbs/RUNS*100).toFixed(1)}%`);
  console.log(`    Leg lost:    OLD ${(oldLegs/RUNS*100).toFixed(1)}%  →  NEW ${(newLegs/RUNS*100).toFixed(1)}%`);
}

console.log('');
