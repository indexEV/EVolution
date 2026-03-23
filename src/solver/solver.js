// ─── solver.js ───────────────────────────────────────────────────────────────
// Binary search approach: find minimum EVs per stat per constraint.
// Typically ~500–1000 @smogon/calc calls total → fast (<200ms).

import { calculate, Pokemon, Move, Field, Side } from '@smogon/calc';
import { Generations } from '@smogon/calc';
import { Dex } from '@smogon/calc';

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

// Stat stage multipliers indexed by (stage + 6): index 0 = -6, index 6 = 0, index 12 = +6
const STAGE_MULTS = [1/4, 2/7, 2/5, 1/2, 2/3, 1, 3/2, 2, 5/2, 3, 7/2, 4];

// ─── Stat formulas ───────────────────────────────────────────────────────────
function calcHp(base, iv, ev) {
  return Math.floor((2 * base + (iv ?? 31) + Math.floor((ev ?? 0) / 4)) + 110);
}

function calcStat(base, iv, ev, nature, statKey) {
  const nMult = (NATURE_BOOST[nature] === statKey) ? 1.1
    : (NATURE_DROP[nature] === statKey) ? 0.9 : 1.0;
  return Math.floor(Math.floor((2 * base + (iv ?? 31) + Math.floor((ev ?? 0) / 4)) + 5) * nMult);
}

function calcSpeedFinal(baseSpe, iv, ev, nature, stageTotal, tailwind, scarf) {
  const nMult = SPE_BOOST.has(nature) ? 1.1 : SPE_DROP.has(nature) ? 0.9 : 1.0;
  const sMult = STAGE_MULTS[Math.max(0, Math.min(12, (stageTotal ?? 0) + 6))];
  const base = Math.floor(Math.floor((2 * baseSpe + (iv ?? 31) + Math.floor((ev ?? 0) / 4)) + 5) * nMult);
  const staged = Math.floor(base * sMult);
  const tw = tailwind ? staged * 2 : staged;
  return scarf ? Math.floor(tw * 1.5) : tw;
}

// ─── @smogon/calc helpers ────────────────────────────────────────────────────
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
    attackerSide: new Side({
      isReflect: !!a.reflect,
      isLightScreen: !!a.lightScreen,
      isAuroraVeil: !!a.auroraVeil,
      isTailwind: !!a.tailwind,
      isFriendGuard: !!a.friendGuard,
      isHelpingHand: !!a.helpingHand,
    }),
    defenderSide: new Side({
      isReflect: !!d.reflect,
      isLightScreen: !!d.lightScreen,
      isAuroraVeil: !!d.auroraVeil,
      isTailwind: !!d.tailwind,
      isFriendGuard: !!d.friendGuard,
    }),
  });
}

function makePokemon(speciesName, fullState, evOverride) {
  return new Pokemon(GEN, speciesName, {
    item:    fullState.item?.name   ?? undefined,
    nature:  fullState.nature       ?? 'Hardy',
    evs:     evOverride ?? fullState.evs ?? {},
    ivs:     fullState.ivs          ?? {},
    ability: fullState.ability      ?? undefined,
    status:  STATUS_MAP[fullState.status] ?? undefined,
    boosts:  fullState.stages       ?? {},
    level:   100,
  });
}

// ─── Binary search: find minimum EV (multiple of 4, 0..252) where pred is true ──
// pred must be monotone: false…false…true…true as ev increases 0→252.
// Returns -1 if pred(252) is false (impossible).
function bsMin(pred) {
  if (!pred(252)) return -1;
  if (pred(0))    return 0;
  let lo = 0, hi = 63;            // units of 4
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (pred(mid * 4)) hi = mid;
    else lo = mid + 1;
  }
  return lo * 4;
}

// ─── Survive constraint check ────────────────────────────────────────────────
// Returns {maxDmg, defMaxHp, result} for given defender testEvs
function calcIncoming(threatSpeciesName, threatFullState, threatBoosts,
                      userSpeciesName, userFullState, testEvs,
                      moveName, isCrit, fc) {
  const atk = new Pokemon(GEN, threatSpeciesName, {
    item:    threatFullState.item?.name   ?? undefined,
    nature:  threatFullState.nature       ?? 'Hardy',
    evs:     threatFullState.evs          ?? {},
    ivs:     threatFullState.ivs          ?? {},
    ability: threatFullState.ability      ?? undefined,
    boosts:  threatBoosts,
    level:   100,
  });
  const def = new Pokemon(GEN, userSpeciesName, {
    item:    userFullState.item?.name    ?? undefined,
    nature:  userFullState.nature        ?? 'Hardy',
    evs:     testEvs,
    ivs:     userFullState.ivs           ?? {},
    ability: userFullState.ability       ?? undefined,
    status:  STATUS_MAP[userFullState.status] ?? undefined,
    boosts:  userFullState.stages        ?? {},
    level:   100,
  });
  const move = new Move(GEN, moveName, { isCrit: !!isCrit });
  const field = makeField(fc, 'enemySide', 'userSide');
  return calculate(GEN, atk, def, move, field);
}

// ─── KO constraint check ─────────────────────────────────────────────────────
function calcOutgoing(userSpeciesName, userFullState, userBoosts, testEvs,
                      threatSpeciesName, threatFullState,
                      moveName, isCrit, fc) {
  const atk = new Pokemon(GEN, userSpeciesName, {
    item:    userFullState.item?.name    ?? undefined,
    nature:  userFullState.nature        ?? 'Hardy',
    evs:     testEvs,
    ivs:     userFullState.ivs           ?? {},
    ability: userFullState.ability       ?? undefined,
    status:  STATUS_MAP[userFullState.status] ?? undefined,
    boosts:  userBoosts,
    level:   100,
  });
  const def = new Pokemon(GEN, threatSpeciesName, {
    item:    threatFullState.item?.name   ?? undefined,
    nature:  threatFullState.nature       ?? 'Hardy',
    evs:     threatFullState.evs          ?? {},
    ivs:     threatFullState.ivs          ?? {},
    ability: threatFullState.ability      ?? undefined,
    boosts:  threatFullState.stages       ?? {},
    level:   100,
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

// Recovery per turn (for 2HKO survive calculation)
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

// ─── Main solver ─────────────────────────────────────────────────────────────
export function solveSpreads({ userPokemon, userFullState, enemyPokemon, enemyFullState, constraints, fieldConditions }) {
  if (!userPokemon || !userFullState || constraints.length === 0)
    return { spreads: [], impossible: [{ reason: 'No constraints defined.' }] };

  const impossible = [];
  const EMPTY_EVS = { hp:0, atk:0, def:0, spa:0, spd:0, spe:0 };

  // Helper: get threat pokemon + state for a constraint
  function getThreat(c) {
    return {
      pokemon:   c.opponentSource === 'custom' ? c.customThreat?.pokemon   : enemyPokemon,
      fullState: c.opponentSource === 'custom' ? c.customThreat?.fullState  : enemyFullState,
    };
  }

  // ─── 1. OUTSPEED (SCARF) ──────────────────────────────────────────────────
  let minSpeEv = 0;
  for (const c of constraints.filter(c => c.type === 'scarf')) {
    const { pokemon: threat, fullState: tState } = getThreat(c);
    if (!threat || !tState) continue;

    const theirSpe = calcSpeedFinal(
      threat.baseStats.spe, tState.ivs?.spe, tState.evs?.spe, tState.nature,
      (tState.stages?.spe || 0) + c.theirExtraStage + (c.theirIcyWind ? -1 : 0),
      c.theirTailwind, c.theirScarf
    );

    const needed = bsMin(spEv => calcSpeedFinal(
      userPokemon.baseStats.spe, userFullState.ivs?.spe, spEv, userFullState.nature,
      (userFullState.stages?.spe || 0) + c.yourExtraStage + (c.yourIcyWind ? -1 : 0),
      c.yourTailwind, c.yourScarf
    ) > theirSpe);

    if (needed === -1) {
      impossible.push({ type: 'scarf', c, threat, reason: `Cannot outspeed ${threat.name} even at 252 SPE EVs.` });
    } else {
      minSpeEv = Math.max(minSpeEv, needed);
    }
  }

  // ─── 2. KO (SWORD) ───────────────────────────────────────────────────────
  let minAtkEv = 0, minSpaEv = 0;
  for (const c of constraints.filter(c => c.type === 'sword')) {
    const { pokemon: threat, fullState: tState } = getThreat(c);
    if (!threat || !tState) continue;

    const moveData = userFullState.moves?.[c.userMoveIndex];
    const moveName = moveData?.name;
    if (!moveName || moveData?.category === 'Status') {
      impossible.push({ type: 'sword', c, threat, reason: 'No damaging move selected.' });
      continue;
    }

    const isSpecial = moveData.category === 'Special';
    const offKey = isSpecial ? 'spa' : 'atk';
    const uBoosts = userBoostsForKO(userFullState, c);
    const isCrit = userFullState.crits?.[c.userMoveIndex] || false;

    try {
      const needed = bsMin(offEv => {
        const testEvs = { ...EMPTY_EVS, spe: minSpeEv, [offKey]: offEv };
        const result = calcOutgoing(userPokemon.name, userFullState, uBoosts, testEvs,
                                    threat.name, tState, moveName, isCrit, fieldConditions);
        const [minDmg] = result.range();
        // Get enemy's max HP using formula (more reliable than result.defender.maxHP())
        const enemyHp = calcHp(threat.baseStats.hp, tState.ivs?.hp, tState.evs?.hp);
        if (c.achieve === '1hko') return minDmg >= enemyHp;
        else return minDmg * 2 >= enemyHp;
      });

      if (needed === -1) {
        impossible.push({ type: 'sword', c, threat,
          reason: `Cannot guarantee ${c.achieve === '1hko' ? 'OHKO' : '2HKO'} on ${threat.name} even at 252 EVs.` });
      } else {
        if (isSpecial) minSpaEv = Math.max(minSpaEv, needed);
        else minAtkEv = Math.max(minAtkEv, needed);
      }
    } catch(e) {
      impossible.push({ type: 'sword', c, threat, reason: `Calc error: ${e.message}` });
    }
  }

  // ─── 3. SURVIVE (SHIELD) — build (hpEv, defEv, spdEv) Pareto frontier ────
  const offBudget = minAtkEv + minSpaEv + minSpeEv;
  const maxBulkBudget = 508 - offBudget;

  const shieldCs = constraints.filter(c => c.type === 'shield');
  const surviveFrontier = []; // { hpEv, defEv, spdEv, bulkTotal }

  if (shieldCs.length === 0) {
    // No survive constraints — any HP=0, def=0, spd=0 works
    surviveFrontier.push({ hpEv: 0, defEv: 0, spdEv: 0, bulkTotal: 0 });
  } else {
    for (let hpEv = 0; hpEv <= Math.min(252, maxBulkBudget); hpEv += 4) {
      const myMaxHp = calcHp(userPokemon.baseStats.hp, userFullState.ivs?.hp, hpEv);
      const myRecovery = recoveryPerTurn(userFullState, myMaxHp);
      let defEvNeeded = 0, spdEvNeeded = 0;
      let frontierPossible = true;

      for (const c of shieldCs) {
        const { pokemon: threat, fullState: tState } = getThreat(c);
        if (!threat || !tState) continue;
        const moveData = tState.moves?.[c.enemyMoveIndex];
        const moveName = moveData?.name;
        if (!moveName || moveData?.category === 'Status') continue;

        const isSpecial = moveData.category === 'Special';
        const defKey = isSpecial ? 'spd' : 'def';
        const tBoosts = threatBoostsAfterIntimidate(tState, c.intimidateOn);

        try {
          const needed = bsMin(defEv => {
            const testEvs = { ...EMPTY_EVS, hp: hpEv, [defKey]: defEv };
            const result = calcIncoming(threat.name, tState, tBoosts,
                                        userPokemon.name, userFullState, testEvs,
                                        moveName, false, fieldConditions);
            const [, maxDmg] = result.range();
            if (c.survive === '1hko') return maxDmg < myMaxHp;
            // 2HKO survive: HP after two max hits + recovery > 0
            else return maxDmg * 2 - myRecovery < myMaxHp;
          });

          if (needed === -1) { frontierPossible = false; break; }
          if (isSpecial) spdEvNeeded = Math.max(spdEvNeeded, needed);
          else           defEvNeeded = Math.max(defEvNeeded, needed);
        } catch(e) {
          frontierPossible = false; break;
        }
      }

      if (!frontierPossible) continue;
      if (defEvNeeded > 252 || spdEvNeeded > 252) continue;

      const bulkTotal = hpEv + defEvNeeded + spdEvNeeded;
      if (bulkTotal > maxBulkBudget) continue;

      surviveFrontier.push({ hpEv, defEv: defEvNeeded, spdEv: spdEvNeeded, bulkTotal });
    }

    if (surviveFrontier.length === 0) {
      impossible.push({ type: 'shield', reason: 'Cannot satisfy all survive constraints within the EV budget.' });
    }
  }

  // ─── 4. Build final spreads ───────────────────────────────────────────────
  if (surviveFrontier.length === 0) return { spreads: [], impossible };

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

  // Keep only the first 10 (Pareto-like, most efficient spread first)
  // Each represents a different HP/DEF/SPD tradeoff point
  const frontier = uniqueFrontier.slice(0, 10);

  // ─── 5. Generate spreads with full descriptions ───────────────────────────
  const spreads = [];

  for (const { hpEv, defEv, spdEv } of frontier) {
    const evs = {
      hp:  hpEv,
      atk: minAtkEv,
      def: defEv,
      spa: minSpaEv,
      spd: spdEv,
      spe: minSpeEv,
    };
    const total = Object.values(evs).reduce((a, b) => a + b, 0);
    const remaining = 508 - total;

    // Run full calc for descriptions
    const constraintResults = constraints.map(c => {
      const { pokemon: threat, fullState: tState } = getThreat(c);
      try {
        if (c.type === 'shield') {
          const moveName = tState?.moves?.[c.enemyMoveIndex]?.name;
          if (!moveName || !threat || !tState)
            return { c, passed: true, desc: 'No move set', range: null, threat };
          const tBoosts = threatBoostsAfterIntimidate(tState, c.intimidateOn);
          const result = calcIncoming(threat.name, tState, tBoosts,
                                      userPokemon.name, userFullState, evs,
                                      moveName, false, fieldConditions);
          const [minDmg, maxDmg] = result.range();
          const defMaxHp = calcHp(userPokemon.baseStats.hp, userFullState.ivs?.hp, evs.hp);
          const recovery = recoveryPerTurn(userFullState, defMaxHp);
          const passed = c.survive === '1hko'
            ? maxDmg < defMaxHp
            : maxDmg * 2 - recovery < defMaxHp;
          const pMin = (minDmg / defMaxHp * 100).toFixed(1);
          const pMax = (maxDmg / defMaxHp * 100).toFixed(1);
          return { c, passed, desc: result.desc(), range: `${pMin}%–${pMax}%`, threat };

        } else if (c.type === 'sword') {
          const moveData = userFullState.moves?.[c.userMoveIndex];
          const moveName = moveData?.name;
          if (!moveName || !threat || !tState || moveData?.category === 'Status')
            return { c, passed: true, desc: 'No damaging move', range: null, threat };
          const uBoosts = userBoostsForKO(userFullState, c);
          const isCrit = userFullState.crits?.[c.userMoveIndex] || false;
          const result = calcOutgoing(userPokemon.name, userFullState, uBoosts, evs,
                                      threat.name, tState, moveName, isCrit, fieldConditions);
          const [minDmg, maxDmg] = result.range();
          const defMaxHp = calcHp(threat.baseStats.hp, tState.ivs?.hp, tState.evs?.hp);
          const passed = c.achieve === '1hko'
            ? minDmg >= defMaxHp
            : minDmg * 2 >= defMaxHp;
          const pMin = (minDmg / defMaxHp * 100).toFixed(1);
          const pMax = (maxDmg / defMaxHp * 100).toFixed(1);
          return { c, passed, desc: result.desc(), range: `${pMin}%–${pMax}%`, threat };

        } else if (c.type === 'scarf') {
          if (!threat || !tState)
            return { c, passed: true, desc: 'No threat set', range: null, threat };
          const mySpe = calcSpeedFinal(
            userPokemon.baseStats.spe, userFullState.ivs?.spe, evs.spe, userFullState.nature,
            (userFullState.stages?.spe || 0) + c.yourExtraStage + (c.yourIcyWind ? -1 : 0),
            c.yourTailwind, c.yourScarf
          );
          const theirSpe = calcSpeedFinal(
            threat.baseStats.spe, tState.ivs?.spe, tState.evs?.spe, tState.nature,
            (tState.stages?.spe || 0) + c.theirExtraStage + (c.theirIcyWind ? -1 : 0),
            c.theirTailwind, c.theirScarf
          );
          const passed = mySpe > theirSpe;
          const margin = mySpe - theirSpe;
          return {
            c, passed,
            desc: `${userPokemon.name} ${mySpe} SPE vs ${threat.name} ${theirSpe} SPE`,
            range: `${passed ? '+' : ''}${margin}`,
            threat,
          };
        }
      } catch (e) {
        return { c, passed: false, desc: `Calc error: ${e.message}`, range: null, threat };
      }
      return { c, passed: true, desc: '', range: null, threat };
    });

    const allPassed = constraintResults.every(r => r.passed);
    spreads.push({ evs, total, remaining, constraintResults, allPassed });
  }

  spreads.sort((a, b) => a.total - b.total);
  return { spreads, impossible };
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