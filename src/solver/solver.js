// ─── solver.js ───────────────────────────────────────────────────────────────
// Binary search approach: find minimum EVs per stat per constraint.
// Typically ~500–1000 @smogon/calc calls total → fast (<200ms).

import { calculate, Pokemon, Move, Field, Side } from '@smogon/calc';
import { Generations } from '@smogon/calc';

const GEN = Generations.get(9);

// ─── Maps ───────────────────────────────────────────────────────────────────
const STATUS_MAP = {
  brn: 'Burned', par: 'Paralyzed', psn: 'Poisoned',
  tox: 'Badly Poisoned', frz: 'Frozen', slp: 'Asleep',
};
const WEATHER_MAP = {
  sun: 'Sun', harshSunshine: 'Harsh Sunshine',
  rain: 'Rain', heavyRain: 'Heavy Rain',
  sand: 'Sand', snow: 'Snow', strongWinds: 'Strong Winds',
};
const TERRAIN_MAP = {
  electric: 'Electric', grassy: 'Grassy', misty: 'Misty', psychic: 'Psychic',
};

// Speed-boosting and speed-dropping natures
const SPE_BOOST = new Set(['Timid', 'Jolly', 'Hasty', 'Naive']);
const SPE_DROP  = new Set(['Brave', 'Quiet', 'Sassy', 'Relaxed']);

// Nature → stat boost/drop lookup (for non-speed stats in formulas)
const NATURE_BOOST = {
  Lonely:'atk', Brave:'atk', Adamant:'atk', Naughty:'atk',
  Bold:'def',   Relaxed:'def', Impish:'def', Lax:'def',
  Timid:'spe',  Jolly:'spe',  Hasty:'spe',  Naive:'spe',
  Modest:'spa', Mild:'spa',   Quiet:'spa',  Rash:'spa',
  Calm:'spd',   Gentle:'spd', Sassy:'spd',  Careful:'spd',
};
const NATURE_DROP = {
  Lonely:'def',   Bold:'atk',   Modest:'atk', Calm:'atk',
  Brave:'spe',    Relaxed:'spe', Quiet:'spe',  Sassy:'spe',
  Adamant:'spa',  Impish:'spa',  Jolly:'spa',  Careful:'spa',
  Naughty:'spd',  Lax:'spd',    Rash:'spd',   Naive:'spd',
  Hasty:'def',    Mild:'def',    Gentle:'def', Timid:'atk',
};
const ALL_NATURES = [
  'Hardy', 'Lonely', 'Brave', 'Adamant', 'Naughty',
  'Bold', 'Docile', 'Relaxed', 'Impish', 'Lax',
  'Timid', 'Hasty', 'Serious', 'Jolly', 'Naive',
  'Modest', 'Mild', 'Quiet', 'Bashful', 'Rash',
  'Calm', 'Gentle', 'Sassy', 'Careful', 'Quirky',
];

// Stat stage multipliers indexed by (stage + 6): index 0 = -6, index 6 = 0, index 12 = +6
const STAGE_MULTS = [1/4, 2/7, 1/3, 2/5, 1/2, 2/3, 1, 3/2, 2, 5/2, 3, 7/2, 4];
const STAT_KEYS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
const EMPTY_EVS = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
const SPEED_WEATHER_ABILITIES = {
  chlorophyll: ['sun', 'harshSunshine'],
  swiftswim: ['rain', 'heavyRain'],
  sandrush: ['sand'],
  slushrush: ['snow'],
};
const SPEED_TERRAIN_ABILITIES = {
  surgesurfer: ['electric'],
};

function actualEvs(evs = EMPTY_EVS) {
  return { ...EMPTY_EVS, ...evs };
}

function totalEvs(evs = EMPTY_EVS) {
  return STAT_KEYS.reduce((sum, key) => sum + (evs?.[key] ?? 0), 0);
}

function normId(value) {
  return (value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function hasItem(fullState, itemName) {
  return normId(fullState?.item?.name ?? '') === normId(itemName);
}

// ─── Stat formulas ───────────────────────────────────────────────────────────
function calcHp(base, iv, ev, level = 100) {
  return Math.floor(((2 * base + (iv ?? 31) + Math.floor((ev ?? 0) / 4)) * level) / 100) + level + 10;
}

function calcStat(base, iv, ev, nature, statKey, level = 100) {
  const nMult = (NATURE_BOOST[nature] === statKey) ? 1.1
    : (NATURE_DROP[nature] === statKey) ? 0.9 : 1.0;
  return Math.floor(Math.floor((((2 * base + (iv ?? 31) + Math.floor((ev ?? 0) / 4)) * level) / 100) + 5) * nMult);
}

function getEffectiveHpForState(pokemon, fullState, evOverride, level = 100) {
  const evs = evOverride ?? fullState?.evs ?? {};
  const maxHp = calcHp(pokemon?.baseStats?.hp ?? 0, fullState?.ivs?.hp, evs?.hp, level);
  const currentHp = Number.isFinite(fullState?.currentHp)
    ? Math.max(0, Math.min(maxHp, fullState.currentHp))
    : maxHp;
  return { maxHp, currentHp };
}

function getParadoxBoostedStatForState(pokemon, fullState, fieldConditions = null, evOverrides = {}, level = 100) {
  const abilityId = normId(fullState?.ability ?? '');
  if (abilityId !== 'protosynthesis' && abilityId !== 'quarkdrive') return null;

  const boostedStat = fullState?.boostedStat ?? undefined;
  if (!boostedStat) return null;
  if (boostedStat !== 'auto') return boostedStat;

  const itemId = normId(fullState?.item?.name ?? '');
  const weather = fieldConditions?.field?.weather ?? null;
  const terrain = fieldConditions?.field?.terrain ?? null;
  const active =
    (abilityId === 'protosynthesis' && (weather === 'sun' || weather === 'harshSunshine' || itemId === 'boosterenergy')) ||
    (abilityId === 'quarkdrive' && (terrain === 'electric' || itemId === 'boosterenergy'));
  if (!active) return null;

  const nature = fullState?.nature ?? 'Hardy';
  const evs = { ...(fullState?.evs ?? {}), ...evOverrides };
  const ivs = fullState?.ivs ?? {};
  let bestStat = 'atk';

  for (const stat of ['def', 'spa', 'spd', 'spe']) {
    const current = calcStat(pokemon?.baseStats?.[stat] ?? 0, ivs?.[stat], evs?.[stat], nature, stat, level);
    const best = calcStat(pokemon?.baseStats?.[bestStat] ?? 0, ivs?.[bestStat], evs?.[bestStat], nature, bestStat, level);
    if (current > best) bestStat = stat;
  }

  return bestStat;
}

function getAbilitySpeedMultiplier(fullState, fieldConditions) {
  const abilityId = normId(fullState?.ability ?? '');
  const weather = fieldConditions?.field?.weather ?? null;
  const terrain = fieldConditions?.field?.terrain ?? null;
  const status = fullState?.status ?? null;

  if (abilityId === 'quickfeet' && status) return 1.5;
  if (abilityId === 'slowstart') return 0.5;

  const weatherTriggers = SPEED_WEATHER_ABILITIES[abilityId];
  if (weatherTriggers?.includes(weather)) return 2;

  const terrainTriggers = SPEED_TERRAIN_ABILITIES[abilityId];
  if (terrainTriggers?.includes(terrain)) return 2;

  return 1;
}

function calcSpeedFinal(pokemon, fullState, evOverride, stageTotal, tailwind, level = 100, fieldConditions = null) {
  const baseSpe = pokemon?.baseStats?.spe ?? 0;
  const iv = fullState?.ivs?.spe;
  const ev = evOverride ?? fullState?.evs?.spe;
  const nature = fullState?.nature;
  const nMult = SPE_BOOST.has(nature) ? 1.1 : SPE_DROP.has(nature) ? 0.9 : 1.0;
  const sMult = STAGE_MULTS[Math.max(0, Math.min(12, (stageTotal ?? 0) + 6))];
  const base = Math.floor(Math.floor((((2 * baseSpe + (iv ?? 31) + Math.floor((ev ?? 0) / 4)) * level) / 100) + 5) * nMult);
  let speed = Math.floor(base * sMult);

  if (fullState?.status === 'par' && normId(fullState?.ability ?? '') !== 'quickfeet') {
    speed = Math.floor(speed * 0.5);
  }

  let modifier = 1;
  if (tailwind) modifier *= 2;
  if (hasItem(fullState, 'Choice Scarf')) modifier *= 1.5;
  modifier *= getAbilitySpeedMultiplier(fullState, fieldConditions);
  if (getParadoxBoostedStatForState(pokemon, fullState, fieldConditions, { spe: ev }, level) === 'spe') {
    modifier *= 1.5;
  }

  return Math.floor(speed * modifier);
}

// ─── @smogon/calc helpers ────────────────────────────────────────────────────
function mapSideConditions(side = {}) {
  return {
    spikes: side.spikes || 0,
    isSR: !!side.stealthRock,
    isReflect: !!side.reflect,
    isLightScreen: !!side.lightScreen,
    isProtected: !!side.protect,
    isSeeded: !!side.leechSeed,
    isForesight: !!side.foresight,
    isTailwind: !!side.tailwind,
    isHelpingHand: !!side.helpingHand,
    isFlowerGift: !!side.flowerGift,
    isFriendGuard: !!side.friendGuard,
    isAuroraVeil: !!side.auroraVeil,
    isBattery: !!side.battery,
    isPowerSpot: !!side.powerSpot,
    isSwitching: side.switchingOut ? 'out' : side.justSwitchedIn ? 'in' : undefined,
  };
}

function makeField(fc, atkSideKey, defSideKey) {
  const a = fc?.[atkSideKey] ?? {};
  const d = fc?.[defSideKey] ?? {};
  return new Field({
    weather: WEATHER_MAP[fc?.field?.weather] ?? undefined,
    terrain: TERRAIN_MAP[fc?.field?.terrain] ?? undefined,
    gameType: fc?.field?.format === 'doubles' ? 'Doubles' : 'Singles',
    isMagicRoom: !!fc?.field?.magicRoom,
    isWonderRoom: !!fc?.field?.wonderRoom,
    isGravity: !!fc?.field?.gravity,
    attackerSide: new Side(mapSideConditions(a)),
    defenderSide: new Side(mapSideConditions(d)),
  });
}

function makePokemon(speciesName, fullState, evOverride, level = 100) {
  return new Pokemon(GEN, speciesName, {
    item:    fullState.item?.name   ?? undefined,
    nature:  fullState.nature       ?? 'Hardy',
    evs:     evOverride ?? fullState.evs ?? {},
    ivs:     fullState.ivs          ?? {},
    ability: fullState.ability      ?? undefined,
    boostedStat: fullState.boostedStat ?? undefined,
    status:  STATUS_MAP[fullState.status] ?? undefined,
    boosts:  fullState.stages       ?? {},
    level,
  });
}

function getRelevantEvCandidates(startEv, maxEv) {
  if (startEv > maxEv) return [];
  const values = [startEv];
  const remainder = startEv % 4;
  let next = remainder === 0 ? startEv + 4 : startEv + (4 - remainder);
  for (; next <= maxEv; next += 4) values.push(next);
  return values;
}

// Find the minimum EV where pred becomes true while respecting the user's exact
// locked EVs and only testing stat-relevant breakpoints after that point.
function findMinActualEv(startEv, maxEv, pred) {
  for (const ev of getRelevantEvCandidates(startEv, maxEv)) {
    if (pred(ev)) return ev;
  }
  return -1;
}

// ─── Survive constraint check ────────────────────────────────────────────────
// Returns {maxDmg, defMaxHp, result} for given defender testEvs
function calcIncoming(threatSpeciesName, threatFullState, threatBoosts,
                      userSpeciesName, userFullState, testEvs,
                      moveName, isCrit, fc, threatLevel = 100, userLevel = 100) {
  const atk = new Pokemon(GEN, threatSpeciesName, {
    item:    threatFullState.item?.name   ?? undefined,
    nature:  threatFullState.nature       ?? 'Hardy',
    evs:     threatFullState.evs          ?? {},
    ivs:     threatFullState.ivs          ?? {},
    ability: threatFullState.ability      ?? undefined,
    boostedStat: threatFullState.boostedStat ?? undefined,
    boosts:  threatBoosts,
    curHP:   threatFullState.currentHp    ?? undefined,
    level:   threatLevel,
  });
  const def = new Pokemon(GEN, userSpeciesName, {
    item:    userFullState.item?.name    ?? undefined,
    nature:  userFullState.nature        ?? 'Hardy',
    evs:     testEvs,
    ivs:     userFullState.ivs           ?? {},
    ability: userFullState.ability       ?? undefined,
    boostedStat: userFullState.boostedStat ?? undefined,
    status:  STATUS_MAP[userFullState.status] ?? undefined,
    boosts:  userFullState.stages        ?? {},
    curHP:   userFullState.currentHp     ?? undefined,
    level:   userLevel,
  });
  const move = new Move(GEN, moveName, { isCrit: !!isCrit });
  const field = makeField(fc, 'enemySide', 'userSide');
  return calculate(GEN, atk, def, move, field);
}

// ─── KO constraint check ─────────────────────────────────────────────────────
function calcOutgoing(userSpeciesName, userFullState, userBoosts, testEvs,
                      threatSpeciesName, threatFullState,
                      moveName, isCrit, fc, userLevel = 100, threatLevel = 100) {
  const atk = new Pokemon(GEN, userSpeciesName, {
    item:    userFullState.item?.name    ?? undefined,
    nature:  userFullState.nature        ?? 'Hardy',
    evs:     testEvs,
    ivs:     userFullState.ivs           ?? {},
    ability: userFullState.ability       ?? undefined,
    boostedStat: userFullState.boostedStat ?? undefined,
    status:  STATUS_MAP[userFullState.status] ?? undefined,
    boosts:  userBoosts,
    curHP:   userFullState.currentHp     ?? undefined,
    level:   userLevel,
  });
  const def = new Pokemon(GEN, threatSpeciesName, {
    item:    threatFullState.item?.name   ?? undefined,
    nature:  threatFullState.nature       ?? 'Hardy',
    evs:     threatFullState.evs          ?? {},
    ivs:     threatFullState.ivs          ?? {},
    ability: threatFullState.ability      ?? undefined,
    boostedStat: threatFullState.boostedStat ?? undefined,
    boosts:  threatFullState.stages       ?? {},
    curHP:   threatFullState.currentHp    ?? undefined,
    level:   threatLevel,
  });
  const move = new Move(GEN, moveName, { isCrit: !!isCrit });
  const field = makeField(fc, 'userSide', 'enemySide');
  return calculate(GEN, atk, def, move, field);
}

// Threat's ATK boosts after Intimidate interaction
function threatBoostsAfterIntimidate(threatFullState, intimidateOn) {
  const boosts = { ...(threatFullState.stages ?? {}) };
  if (!intimidateOn) return boosts;
  const ab = (threatFullState.ability ?? '').toLowerCase().replace(/[^a-z]/g, '');
  if (ab === 'defiant')       boosts.atk = (boosts.atk || 0) + 1;
  else if (ab === 'contrary') boosts.atk = (boosts.atk || 0) + 1;
  else if (!['clearbody','whitesmoke','fullmetalbody'].includes(ab))
    boosts.atk = (boosts.atk || 0) - 1;
  return boosts;
}

// User's ATK/SPA boosts after Defiant/Competitive/Intimidate
function userBoostsForKO(userFullState, c) {
  const boosts = { ...(userFullState.stages ?? {}) };
  const ab = (userFullState.ability ?? '').toLowerCase().replace(/[^a-z]/g, '');
  if (c.defiantSword) {
    if (ab === 'defiant')       boosts.atk = (boosts.atk || 0) + 2;
    else if (ab === 'competitive') boosts.spa = (boosts.spa || 0) + 2;
  }
  if (c.intimidateEnemy) {
    // Threat's Intimidate on us when we attack
    if (ab === 'defiant')       boosts.atk = (boosts.atk || 0) + 1;
    else if (!['clearbody','whitesmoke','fullmetalbody'].includes(ab))
      boosts.atk = (boosts.atk || 0) - 1;
  }
  return boosts;
}

// Recovery per turn (for survive calculations)
function recoveryPerTurn(userFullState, maxHp) {
  const itemName = (userFullState.item?.name ?? '').toLowerCase().replace(/[^a-z]/g, '');
  if (itemName === 'leftovers')  return Math.floor(maxHp / 16);
  if (itemName === 'blacksludge') {
    // Only Poison types heal; others take damage — handled by calc, skip here
    return Math.floor(maxHp / 16);
  }
  const ab = (userFullState.ability ?? '').toLowerCase().replace(/[^a-z]/g, '');
  if (ab === 'poisonheal' && ['psn','tox'].includes(userFullState.status))
    return Math.floor(maxHp / 8);
  return 0;
}

function surviveHitsRequired(mode) {
  if (mode === '2hko') return 2;
  if (mode === '3hko') return 3;
  if (mode === '4hko') return 4;
  return 1;
}

function passesSurviveConstraint(mode, minDmg, maxDmg, maxHp, recovery) {
  const hits = surviveHitsRequired(mode);
  const totalRecovery = recovery * Math.max(0, hits - 1);
  return minDmg * hits - totalRecovery < maxHp;
}

function koHitsRequired(mode) {
  if (mode === '2hko') return 2;
  if (mode === '3hko') return 3;
  return 1;
}

function passesKoConstraint(mode, minDmg, maxHp) {
  return minDmg * koHitsRequired(mode) >= maxHp;
}

function getDamageRolls(damage) {
  if (typeof damage === 'number') return [damage];
  if (!Array.isArray(damage) || damage.length === 0) return [0];
  if (typeof damage[0] === 'number') {
    if (damage.length === 2 && typeof damage[1] === 'number') return [damage[0] + damage[1]];
    return [...damage];
  }

  const [first = [], second = []] = damage;
  const combined = [];
  for (const a of first) {
    for (const b of second) {
      combined.push(a + b);
    }
  }
  return combined.length > 0 ? combined : [0];
}

function getRepeatedHitDistribution(rolls, hits, recoveryPerTurn = 0) {
  let distribution = new Map([[0, 1]]);

  for (let hit = 0; hit < hits; hit += 1) {
    const next = new Map();
    const recoveryBeforeHit = hit === 0 ? 0 : recoveryPerTurn;

    for (const [total, count] of distribution.entries()) {
      for (const roll of rolls) {
        const nextTotal = total + roll - recoveryBeforeHit;
        next.set(nextTotal, (next.get(nextTotal) ?? 0) + count);
      }
    }

    distribution = next;
  }

  return distribution;
}

function getDistributionSuccessRate(distribution, predicate) {
  let successes = 0;
  let total = 0;

  for (const [value, count] of distribution.entries()) {
    total += count;
    if (predicate(value)) successes += count;
  }

  return total > 0 ? successes / total : 0;
}

export function passesStrictSurviveTotalDamage(totalDamage, maxHp) {
  return totalDamage < maxHp;
}

export function passesGuaranteedKoTotalDamage(totalDamage, maxHp) {
  return totalDamage >= maxHp;
}

function getSurviveSuccessRate(mode, damage, maxHp, recovery) {
  const rolls = getDamageRolls(damage);
  const distribution = getRepeatedHitDistribution(rolls, surviveHitsRequired(mode), recovery);
  return getDistributionSuccessRate(distribution, (totalDamage) => passesStrictSurviveTotalDamage(totalDamage, maxHp));
}

function getKoSuccessRate(mode, damage, maxHp, recovery) {
  const rolls = getDamageRolls(damage);
  const distribution = getRepeatedHitDistribution(rolls, koHitsRequired(mode), recovery);
  return getDistributionSuccessRate(distribution, (totalDamage) => passesGuaranteedKoTotalDamage(totalDamage, maxHp));
}

export function passesGuaranteedKoRate(successRate) {
  return successRate >= 1;
}

export function passesGuaranteedSurviveRate(successRate) {
  return successRate >= 1;
}

export function passesOutspeedComparison(mySpe, theirSpe) {
  return mySpe > theirSpe;
}

function koLabel(mode) {
  if (mode === '3hko') return '3HKO';
  if (mode === '2hko') return '2HKO';
  return 'OHKO';
}

// ─── Main solver ─────────────────────────────────────────────────────────────
export function solveSpreads({
  userPokemon,
  userFullState,
  userLevel = 100,
  enemyPokemon,
  enemyFullState,
  enemyLevel = 100,
  constraints,
  fieldConditions,
  unlockedStats = null,
  optimizeNature = false,
}) {
  if (!userPokemon || !userFullState || constraints.length === 0) {
    return { spreads: [], impossible: [{ reason: 'No constraints defined.' }] };
  }

  const lockedEvs = actualEvs(userFullState.evs);
  const lockedTotal = totalEvs(lockedEvs);
  const remainingBudget = 510 - lockedTotal;
  const statUnlocks = { hp: true, atk: true, def: true, spa: true, spd: true, spe: true, ...(unlockedStats ?? {}) };
  const baseNature = userFullState.nature ?? 'Hardy';
  const preparedConstraints = constraints.map(normalizeConstraint);

  const getPassedCount = (spread) => (spread.constraintResults ?? []).reduce(
    (count, result) => count + (result.passed ? 1 : 0),
    0
  );

  const getFailedSpreadMetrics = (spread) => {
    const failed = (spread.constraintResults ?? []).filter((result) => !result.passed);
    if (failed.length === 0) {
      return { bestRate: 1, bestStrength: Number.POSITIVE_INFINITY };
    }
    return {
      bestRate: Math.max(...failed.map((result) => result.successRate ?? 0)),
      bestStrength: Math.max(...failed.map((result) => result.attemptStrength ?? Number.NEGATIVE_INFINITY)),
    };
  };

  const compareSpreadOrder = (a, b) => {
    if (a.allPassed !== b.allPassed) return Number(b.allPassed) - Number(a.allPassed);

    const passedCountDelta = getPassedCount(b) - getPassedCount(a);
    if (passedCountDelta !== 0) return passedCountDelta;

    const aFailed = getFailedSpreadMetrics(a);
    const bFailed = getFailedSpreadMetrics(b);
    if (aFailed.bestRate !== bFailed.bestRate) return bFailed.bestRate - aFailed.bestRate;
    if (aFailed.bestStrength !== bFailed.bestStrength) return bFailed.bestStrength - aFailed.bestStrength;

    if (a.total !== b.total) return a.total - b.total;
    if (a.nature === baseNature && b.nature !== baseNature) return -1;
    if (b.nature === baseNature && a.nature !== baseNature) return 1;
    return 0;
  };

  if (remainingBudget < 0) {
    return {
      spreads: [],
      impossible: [{ reason: `Locked EVs already use ${lockedTotal}/510 EVs.` }],
      lockedEvs,
      lockedTotal,
      remainingBudget,
    };
  }

  if (optimizeNature) {
    const natureOrder = [baseNature, ...ALL_NATURES.filter((nature) => nature !== baseNature)];
    const combined = [];

    natureOrder.forEach((nature) => {
      const branch = solveSpreads({
        userPokemon,
        userFullState: { ...userFullState, nature },
        userLevel,
        enemyPokemon,
        enemyFullState,
        enemyLevel,
        constraints,
        fieldConditions,
        unlockedStats,
        optimizeNature: false,
      });

      branch.spreads.forEach((spread) => combined.push({ ...spread, nature }));
    });

    const seen = new Set();
    const deduped = combined.filter((spread) => {
      const key = `${spread.nature}:${STAT_KEYS.map((keyPart) => spread.evs?.[keyPart] ?? 0).join('-')}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    deduped.sort(compareSpreadOrder);
    const hasValid = deduped.some((spread) => spread.allPassed);
    const impossible = hasValid ? [] : buildImpossibleFromSpreads(deduped);

    return {
      spreads: deduped,
      impossible,
      lockedEvs,
      lockedTotal,
      remainingBudget,
    };
  }

  const impossible = [];

  function getThreat(constraint) {
    const isCustomThreat = constraint.opponentSource === 'custom';
    return {
      pokemon: isCustomThreat ? constraint.customThreat?.pokemon : enemyPokemon,
      fullState: isCustomThreat ? constraint.customThreat?.fullState : enemyFullState,
      level: isCustomThreat ? 100 : enemyLevel,
    };
  }

  function getConstraintFieldConditions(constraint) {
    return constraint.opponentSource === 'custom'
      ? (constraint.customThreat?.fieldConditions ?? fieldConditions)
      : fieldConditions;
  }

  function maxSearchEv(statKey) {
    return statUnlocks[statKey] ? Math.min(252, lockedEvs[statKey] + remainingBudget) : lockedEvs[statKey];
  }

  function normalizeConstraint(constraint) {
    const { pokemon: threat, fullState: tState, level: threatLevel } = getThreat(constraint);
    const constraintFieldConditions = getConstraintFieldConditions(constraint);
    const base = { c: constraint, type: constraint.type, threat, tState, threatLevel, constraintFieldConditions };

    if (constraint.type === 'sword') {
      const moveData = userFullState.moves?.[constraint.userMoveIndex];
      const moveName = moveData?.name;
      if (!threat || !tState) return { ...base, invalidReason: 'No threat set.' };
      if (!moveName || moveData?.category === 'Status') return { ...base, invalidReason: 'No damaging move selected.' };
      return {
        ...base,
        moveName,
        isSpecial: moveData.category === 'Special',
        offKey: moveData.category === 'Special' ? 'spa' : 'atk',
        uBoosts: userBoostsForKO(userFullState, constraint),
        isCrit: userFullState.crits?.[constraint.userMoveIndex] || false,
      };
    }

    if (constraint.type === 'shield') {
      const moveData = tState?.moves?.[constraint.enemyMoveIndex];
      const moveName = moveData?.name;
      if (!threat || !tState) return { ...base, invalidReason: 'No threat set.' };
      if (!moveName || moveData?.category === 'Status') return { ...base, invalidReason: 'No damaging enemy move selected.' };
      return {
        ...base,
        moveName,
        isSpecial: moveData.category === 'Special',
        defKey: moveData.category === 'Special' ? 'spd' : 'def',
        tBoosts: threatBoostsAfterIntimidate(tState, constraint.intimidateOn),
        isCrit: tState.crits?.[constraint.enemyMoveIndex] || false,
      };
    }

    if (constraint.type === 'scarf' && (!threat || !tState)) {
      return { ...base, invalidReason: 'No threat set.' };
    }

    return base;
  }

  function evaluatePreparedConstraint(prepared, evs) {
    const baseFailure = {
      c: prepared.c,
      passed: false,
      desc: prepared.invalidReason ?? 'Constraint could not be evaluated.',
      range: null,
      threat: prepared.threat,
      successRate: 0,
      priorityScore: prepared.type === 'scarf' ? Number.NEGATIVE_INFINITY : 0,
      attemptStrength: Number.NEGATIVE_INFINITY,
    };

    if (prepared.invalidReason) return baseFailure;

    try {
      if (prepared.type === 'shield') {
        const result = calcIncoming(
          prepared.threat.name,
          prepared.tState,
          prepared.tBoosts,
          userPokemon.name,
          userFullState,
          evs,
          prepared.moveName,
          prepared.isCrit,
          prepared.constraintFieldConditions,
          prepared.threatLevel,
          userLevel
        );
        const [minDmg, maxDmg] = result.range();
        const { maxHp: defMaxHp, currentHp: defCurrentHpRaw } = getEffectiveHpForState(userPokemon, userFullState, evs, userLevel);
        const defCurrentHp = Math.max(1, defCurrentHpRaw);
        const recovery = recoveryPerTurn(userFullState, defMaxHp);
        const rolls = getDamageRolls(result.damage);
        const distribution = getRepeatedHitDistribution(rolls, surviveHitsRequired(prepared.c.survive), recovery);
        const successRate = getDistributionSuccessRate(distribution, (totalDamage) => passesStrictSurviveTotalDamage(totalDamage, defCurrentHp));
        const passed = passesGuaranteedSurviveRate(successRate);
        let worstTotalDamage = Number.NEGATIVE_INFINITY;
        distribution.forEach((_, totalDamage) => {
          if (totalDamage > worstTotalDamage) worstTotalDamage = totalDamage;
        });
        const pMin = (minDmg / defCurrentHp * 100).toFixed(1);
        const pMax = (maxDmg / defCurrentHp * 100).toFixed(1);
        return {
          c: prepared.c,
          passed,
          desc: result.desc(),
          range: `${pMin}% - ${pMax}%`,
          threat: prepared.threat,
          successRate,
          priorityScore: successRate,
          attemptStrength: defCurrentHp - worstTotalDamage,
        };
      }

      if (prepared.type === 'sword') {
        const result = calcOutgoing(
          userPokemon.name,
          userFullState,
          prepared.uBoosts,
          evs,
          prepared.threat.name,
          prepared.tState,
          prepared.moveName,
          prepared.isCrit,
          prepared.constraintFieldConditions,
          userLevel,
          prepared.threatLevel
        );
        const [minDmg, maxDmg] = result.range();
        const { maxHp: defMaxHp, currentHp: defCurrentHpRaw } = getEffectiveHpForState(prepared.threat, prepared.tState, prepared.tState.evs, prepared.threatLevel);
        const defCurrentHp = Math.max(1, defCurrentHpRaw);
        const recovery = recoveryPerTurn(prepared.tState, defMaxHp);
        const rolls = getDamageRolls(result.damage);
        const distribution = getRepeatedHitDistribution(rolls, koHitsRequired(prepared.c.achieve), recovery);
        const successRate = getDistributionSuccessRate(distribution, (totalDamage) => passesGuaranteedKoTotalDamage(totalDamage, defCurrentHp));
        const passed = passesGuaranteedKoRate(successRate);
        let minTotalDamage = Number.POSITIVE_INFINITY;
        distribution.forEach((_, totalDamage) => {
          if (totalDamage < minTotalDamage) minTotalDamage = totalDamage;
        });
        const pMin = (minDmg / defCurrentHp * 100).toFixed(1);
        const pMax = (maxDmg / defCurrentHp * 100).toFixed(1);
        return {
          c: prepared.c,
          passed,
          desc: result.desc(),
          range: `${pMin}% - ${pMax}%`,
          threat: prepared.threat,
          successRate,
          priorityScore: successRate,
          attemptStrength: minTotalDamage - defCurrentHp,
        };
      }

      if (prepared.type === 'scarf') {
        const mySpe = calcSpeedFinal(
          userPokemon,
          userFullState,
          evs.spe,
          (userFullState.stages?.spe || 0) + prepared.c.yourExtraStage + (prepared.c.yourIcyWind ? -1 : 0),
          prepared.c.yourTailwind,
          userLevel,
          prepared.constraintFieldConditions
        );
        const theirSpe = calcSpeedFinal(
          prepared.threat,
          prepared.tState,
          prepared.tState.evs?.spe,
          (prepared.tState.stages?.spe || 0) + prepared.c.theirExtraStage + (prepared.c.theirIcyWind ? -1 : 0),
          prepared.c.theirTailwind,
          prepared.threatLevel,
          prepared.constraintFieldConditions
        );
        const passed = passesOutspeedComparison(mySpe, theirSpe);
        const margin = mySpe - theirSpe;
        return {
          c: prepared.c,
          passed,
          desc: `${userPokemon.name} ${mySpe} SPE vs ${prepared.threat.name} ${theirSpe} SPE`,
          range: `${passed ? '+' : ''}${margin}`,
          threat: prepared.threat,
          successRate: passed ? 1 : 0,
          priorityScore: margin,
          attemptStrength: margin,
        };
      }
    } catch (error) {
      return {
        ...baseFailure,
        desc: `Calc error: ${error.message}`,
      };
    }

    return {
      c: prepared.c,
      passed: true,
      desc: '',
      range: null,
      threat: prepared.threat,
      successRate: 1,
      priorityScore: 1,
      attemptStrength: Number.POSITIVE_INFINITY,
    };
  }

  function getImpossibleReason(prepared) {
    if (prepared.invalidReason) return prepared.invalidReason;
    if (prepared.type === 'sword') {
      return `KO constraint against ${prepared.threat?.name ?? 'the target'} cannot reach the target ${koLabel(prepared.c.achieve)} threshold within the remaining EV budget.`;
    }
    if (prepared.type === 'shield') {
      return `Survive constraint against ${prepared.threat?.name ?? 'the target'} cannot be satisfied within the remaining EV budget.`;
    }
    if (prepared.type === 'scarf') {
      return `Outspeed constraint against ${prepared.threat?.name ?? 'the target'} cannot reach the target speed threshold within the remaining EV budget.`;
    }
    return 'Constraint cannot be satisfied within the remaining EV budget.';
  }

  function getRelevantStats(prepared) {
    if (prepared.type === 'sword') return [prepared.offKey];
    if (prepared.type === 'shield') return ['hp', prepared.defKey];
    if (prepared.type === 'scarf') return ['spe'];
    return [];
  }

  function compareConstraintAttempts(prepared, left, right) {
    if (!right) return 1;
    if (left.result.passed !== right.result.passed) return left.result.passed ? 1 : -1;
    if ((left.result.successRate ?? 0) !== (right.result.successRate ?? 0)) {
      return (left.result.successRate ?? 0) > (right.result.successRate ?? 0) ? 1 : -1;
    }
    if ((left.result.attemptStrength ?? Number.NEGATIVE_INFINITY) !== (right.result.attemptStrength ?? Number.NEGATIVE_INFINITY)) {
      return (left.result.attemptStrength ?? Number.NEGATIVE_INFINITY) > (right.result.attemptStrength ?? Number.NEGATIVE_INFINITY) ? 1 : -1;
    }

    const relevantStats = getRelevantStats(prepared);
    const leftRelevantTotal = relevantStats.reduce((sum, statKey) => sum + (left.evs?.[statKey] ?? 0), 0);
    const rightRelevantTotal = relevantStats.reduce((sum, statKey) => sum + (right.evs?.[statKey] ?? 0), 0);
    if (leftRelevantTotal !== rightRelevantTotal) return leftRelevantTotal > rightRelevantTotal ? 1 : -1;

    const leftTotal = left.total ?? totalEvs(left.evs);
    const rightTotal = right.total ?? totalEvs(right.evs);
    if (leftTotal !== rightTotal) return leftTotal < rightTotal ? 1 : -1;
    return 0;
  }

  function maximizeConstraintFromSpread(spread, prepared) {
    if (prepared.invalidReason) return spread;

    const availableBudget = 510 - spread.total;
    if (availableBudget <= 0) return spread;

    if (prepared.type === 'sword') {
      const boostedEv = Math.min(maxSearchEv(prepared.offKey), spread.evs[prepared.offKey] + availableBudget);
      const evs = { ...spread.evs, [prepared.offKey]: boostedEv };
      return {
        ...spread,
        evs,
        total: totalEvs(evs),
      };
    }

    if (prepared.type === 'scarf') {
      const boostedEv = Math.min(maxSearchEv('spe'), spread.evs.spe + availableBudget);
      const evs = { ...spread.evs, spe: boostedEv };
      return {
        ...spread,
        evs,
        total: totalEvs(evs),
      };
    }

    if (prepared.type === 'shield') {
      let bestAttempt = {
        evs: spread.evs,
        total: spread.total,
        result: evaluatePreparedConstraint(prepared, spread.evs),
      };
      const maxHpSearch = Math.min(maxSearchEv('hp'), spread.evs.hp + availableBudget);
      for (const hpEv of getRelevantEvCandidates(spread.evs.hp, maxHpSearch)) {
        const hpAdded = hpEv - spread.evs.hp;
        const remainingAfterHp = availableBudget - hpAdded;
        const boostedDef = Math.min(maxSearchEv(prepared.defKey), spread.evs[prepared.defKey] + remainingAfterHp);
        const attemptEvs = {
          ...spread.evs,
          hp: hpEv,
          [prepared.defKey]: boostedDef,
        };
        const attempt = {
          evs: attemptEvs,
          total: totalEvs(attemptEvs),
          result: evaluatePreparedConstraint(prepared, attemptEvs),
        };
        if (compareConstraintAttempts(prepared, attempt, bestAttempt) > 0) bestAttempt = attempt;
      }
      return {
        ...spread,
        evs: bestAttempt.evs,
        total: bestAttempt.total,
      };
    }

    return spread;
  }

  function buildBestAttemptReason(prepared) {
    if (prepared.invalidReason) return prepared.invalidReason;
    if (prepared.type === 'sword') {
      return `Best legal KO attempt against ${prepared.threat?.name ?? 'the target'} still fails after maximizing ${prepared.offKey === 'spa' ? 'SpA' : 'Atk'} within the remaining budget.`;
    }
    if (prepared.type === 'shield') {
      return `Best legal survival attempt against ${prepared.threat?.name ?? 'the target'} still fails after maximizing HP + ${prepared.defKey === 'spd' ? 'SpD' : 'Def'} within the remaining budget.`;
    }
    if (prepared.type === 'scarf') {
      return `Best legal Speed attempt against ${prepared.threat?.name ?? 'the target'} still fails after maximizing Spe within the remaining budget.`;
    }
    return getImpossibleReason(prepared);
  }

  // ─── 1. OUTSPEED (SCARF) ──────────────────────────────────────────────────
  let minSpeEv = lockedEvs.spe;
  const maxSpeSearch = maxSearchEv('spe');
  for (const prepared of preparedConstraints.filter((row) => row.type === 'scarf')) {
    if (prepared.invalidReason) {
      impossible.push({ type: 'scarf', c: prepared.c, threat: prepared.threat, reason: getImpossibleReason(prepared) });
      continue;
    }

    const needed = findMinActualEv(minSpeEv, maxSpeSearch, (spEv) => {
      const testEvs = { ...lockedEvs, spe: spEv };
      return evaluatePreparedConstraint(prepared, testEvs).passed;
    });

    if (needed === -1) {
      impossible.push({ type: 'scarf', c: prepared.c, threat: prepared.threat, reason: getImpossibleReason(prepared) });
    } else {
      minSpeEv = Math.max(minSpeEv, needed);
    }
  }

  // ─── 2. KO (SWORD) ───────────────────────────────────────────────────────
  let minAtkEv = lockedEvs.atk;
  let minSpaEv = lockedEvs.spa;
  for (const prepared of preparedConstraints.filter((row) => row.type === 'sword')) {
    if (prepared.invalidReason) {
      impossible.push({ type: 'sword', c: prepared.c, threat: prepared.threat, reason: getImpossibleReason(prepared) });
      continue;
    }

    const isSpecial = prepared.isSpecial;
    const offKey = prepared.offKey;
    const startEv = isSpecial ? minSpaEv : minAtkEv;
    const maxSearch = maxSearchEv(offKey);

    try {
      const needed = findMinActualEv(startEv, maxSearch, (offEv) => {
        const testEvs = { ...lockedEvs, spe: minSpeEv, [offKey]: offEv };
        return evaluatePreparedConstraint(prepared, testEvs).passed;
      });

      if (needed === -1) {
        impossible.push({ type: 'sword', c: prepared.c, threat: prepared.threat, reason: getImpossibleReason(prepared) });
      } else {
        if (isSpecial) minSpaEv = Math.max(minSpaEv, needed);
        else minAtkEv = Math.max(minAtkEv, needed);
      }
    } catch (error) {
      impossible.push({ type: 'sword', c: prepared.c, threat: prepared.threat, reason: `Calc error: ${error.message}` });
    }
  }

  // ─── 3. SURVIVE (SHIELD) — build (hpEv, defEv, spdEv) Pareto frontier ────
  const offBudget =
    (minAtkEv - lockedEvs.atk) +
    (minSpaEv - lockedEvs.spa) +
    (minSpeEv - lockedEvs.spe);
  const maxBulkBudget = remainingBudget - offBudget;
  if (maxBulkBudget < 0) {
    impossible.push({ reason: 'The locked EVs plus required offensive stats exceed the remaining EV budget.' });
  }

  const preparedShieldCs = preparedConstraints.filter((row) => row.type === 'shield' && !row.invalidReason);
  preparedConstraints
    .filter((row) => row.type === 'shield' && row.invalidReason)
    .forEach((prepared) => {
      impossible.push({ type: 'shield', c: prepared.c, threat: prepared.threat, reason: getImpossibleReason(prepared) });
    });

  const surviveFrontier = [];

  if (preparedShieldCs.length === 0) {
    // No survive constraints — any HP=0, def=0, spd=0 works
    surviveFrontier.push({ hpEv: lockedEvs.hp, defEv: lockedEvs.def, spdEv: lockedEvs.spd, bulkTotal: 0 });
  } else if (maxBulkBudget >= 0) {
    const maxHpSearch = Math.min(maxSearchEv('hp'), lockedEvs.hp + maxBulkBudget);
    for (const hpEv of getRelevantEvCandidates(lockedEvs.hp, maxHpSearch)) {
      const hpAdded = hpEv - lockedEvs.hp;
      let defEvNeeded = lockedEvs.def, spdEvNeeded = lockedEvs.spd;
      let frontierPossible = true;

      for (const prepared of preparedShieldCs) {
        const startEv = prepared.isSpecial ? spdEvNeeded : defEvNeeded;
        const maxSearch = Math.min(maxSearchEv(prepared.defKey), lockedEvs[prepared.defKey] + (maxBulkBudget - hpAdded));
        try {
          const needed = findMinActualEv(startEv, maxSearch, (defEv) => {
            const testEvs = { ...lockedEvs, hp: hpEv, [prepared.defKey]: defEv };
            return evaluatePreparedConstraint(prepared, testEvs).passed;
          });

          if (needed === -1) { frontierPossible = false; break; }
          if (prepared.isSpecial) spdEvNeeded = Math.max(spdEvNeeded, needed);
          else           defEvNeeded = Math.max(defEvNeeded, needed);
        } catch (error) {
          frontierPossible = false; break;
        }
      }

      if (!frontierPossible) continue;

      const bulkTotal =
        (hpEv - lockedEvs.hp) +
        (defEvNeeded - lockedEvs.def) +
        (spdEvNeeded - lockedEvs.spd);
      if (bulkTotal > maxBulkBudget) continue;

      surviveFrontier.push({ hpEv, defEv: defEvNeeded, spdEv: spdEvNeeded, bulkTotal });
    }

    if (surviveFrontier.length === 0) {
      impossible.push({ type: 'shield', reason: 'Cannot satisfy all survive constraints within the remaining EV budget.' });
    }
  }

  // ─── 4. Build final spreads ───────────────────────────────────────────────
  function buildSpread(evs) {
    const total = totalEvs(evs);
    const constraintResults = preparedConstraints.map((prepared) => evaluatePreparedConstraint(prepared, evs));
    return {
      evs,
      total,
      remaining: 510 - total,
      added: total - lockedTotal,
      constraintResults,
      allPassed: constraintResults.every((result) => result.passed),
      passedCount: constraintResults.reduce((count, result) => count + (result.passed ? 1 : 0), 0),
    };
  }

  function buildImpossibleFromSpreads(candidateSpreads) {
    if (candidateSpreads.length === 0) return impossible;
    const maxPassedCount = Math.max(...candidateSpreads.map((spread) => spread.passedCount ?? getPassedCount(spread)));
    const topTier = candidateSpreads.filter((spread) => (spread.passedCount ?? getPassedCount(spread)) === maxPassedCount);
    const rows = [];

    preparedConstraints.forEach((prepared, index) => {
      const failedSpreads = topTier.filter((spread) => !spread.constraintResults[index]?.passed);
      if (failedSpreads.length !== topTier.length) return;

      let bestSpread = null;
      failedSpreads.forEach((spread) => {
        if (!bestSpread) {
          bestSpread = spread;
          return;
        }
        const candidate = {
          evs: spread.evs,
          total: spread.total,
          result: spread.constraintResults[index],
        };
        const current = {
          evs: bestSpread.evs,
          total: bestSpread.total,
          result: bestSpread.constraintResults[index],
        };
        if (compareConstraintAttempts(prepared, candidate, current) > 0) bestSpread = spread;
      });

      const bestResult = bestSpread.constraintResults[index];
      rows.push({
        type: prepared.type,
        c: prepared.c,
        threat: prepared.threat,
        reason: buildBestAttemptReason(prepared),
        desc: bestResult.desc,
        range: bestResult.range,
        successRate: bestResult.successRate,
        attemptStrength: bestResult.attemptStrength,
        passedCount: bestSpread.passedCount ?? getPassedCount(bestSpread),
        nature: bestSpread.nature ?? baseNature,
      });
    });

    return rows.length > 0 ? rows : impossible;
  }

  function buildBestEffortSpreads(seedSpreads) {
    const queue = [...seedSpreads];
    const bestByKey = new Map();
    const terminal = new Map();

    while (queue.length > 0) {
      const spread = queue.shift();
      const key = STAT_KEYS.map((statKey) => spread.evs?.[statKey] ?? 0).join('-');
      const current = bestByKey.get(key);
      if (current && compareSpreadOrder(spread, current) >= 0) continue;
      bestByKey.set(key, spread);

      const failedIndices = spread.constraintResults
        .map((result, index) => ({ result, index }))
        .filter(({ result }) => !result.passed)
        .map(({ index }) => index);

      let expanded = false;
      failedIndices.forEach((index) => {
        const prepared = preparedConstraints[index];
        const attempt = buildSpread(maximizeConstraintFromSpread(spread, prepared).evs);
        const attemptKey = STAT_KEYS.map((statKey) => attempt.evs?.[statKey] ?? 0).join('-');
        if (attemptKey === key) return;
        const seenAttempt = bestByKey.get(attemptKey);
        if (!seenAttempt || compareSpreadOrder(attempt, seenAttempt) < 0) {
          queue.push(attempt);
          expanded = true;
        }
      });

      if (!expanded) terminal.set(key, spread);
    }

    return [...terminal.values()].sort(compareSpreadOrder);
  }

  if (surviveFrontier.length === 0) {
    const baseSeed = buildSpread({
      ...lockedEvs,
      atk: minAtkEv,
      spa: minSpaEv,
      spe: minSpeEv,
    });
    const bestEffortSpreads = buildBestEffortSpreads([baseSeed]);
    return {
      spreads: bestEffortSpreads,
      impossible: buildImpossibleFromSpreads(bestEffortSpreads),
      lockedEvs,
      lockedTotal,
      remainingBudget,
    };
  }

  // Pareto-filter: remove dominated points
  // Point A dominates B if A.bulkTotal <= B.bulkTotal AND A achieves same or more
  // (Since all points in frontier are already "minimum required", just deduplicate by total)
  const seen = new Set();
  const uniqueFrontier = surviveFrontier.filter(p => {
    const key = `${p.hpEv}-${p.defEv}-${p.spdEv}`;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });

  // Sort by total bulk EVs (ascending), then by HP (descending - prefer HP over DEF/SPD)
  uniqueFrontier.sort((a, b) => a.bulkTotal - b.bulkTotal || b.hpEv - a.hpEv);

  const frontier = uniqueFrontier;

  // ─── 5. Generate spreads with full descriptions ───────────────────────────
  const spreads = frontier.map(({ hpEv, defEv, spdEv }) => buildSpread({
    ...lockedEvs,
    hp: hpEv,
    atk: minAtkEv,
    def: defEv,
    spa: minSpaEv,
    spd: spdEv,
    spe: minSpeEv,
  }));

  spreads.sort(compareSpreadOrder);

  if (spreads.some((spread) => spread.allPassed)) {
    return { spreads, impossible: [], lockedEvs, lockedTotal, remainingBudget };
  }

  const bestEffortSpreads = buildBestEffortSpreads(spreads);
  return {
    spreads: bestEffortSpreads,
    impossible: buildImpossibleFromSpreads(bestEffortSpreads),
    lockedEvs,
    lockedTotal,
    remainingBudget,
  };
}

// ─── Showdown export string ───────────────────────────────────────────────────
const SD_NAMES = { hp:'HP', atk:'Atk', def:'Def', spa:'SpA', spd:'SpD', spe:'Spe' };

export function toShowdownEvLine(evs) {
  return Object.entries(evs)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${v} ${SD_NAMES[k]}`)
    .join(' / ');
}

export function toShowdownSet(pokemon, fullState, evs, level = 100) {
  const lines = [];
  lines.push(`${pokemon.name}${fullState.item ? ` @ ${fullState.item.name}` : ''}`);
  if (fullState.ability) lines.push(`Ability: ${fullState.ability}`);
  if (fullState.shiny) lines.push('Shiny: Yes');
  if (level !== 100) lines.push(`Level: ${level}`);
  const evLine = toShowdownEvLine(evs);
  if (evLine) lines.push(`EVs: ${evLine}`);
  lines.push(`${fullState.nature} Nature`);
  const ivLine = Object.entries(fullState.ivs || {})
    .filter(([, v]) => v !== 31)
    .map(([k, v]) => `${v} ${SD_NAMES[k]}`).join(' / ');
  if (ivLine) lines.push(`IVs: ${ivLine}`);
  (fullState.moves || []).forEach(m => { if (m?.name) lines.push(`- ${m.name}`); });
  return lines.join('\n');
}
