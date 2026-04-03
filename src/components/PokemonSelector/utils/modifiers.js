/**
 * Modifiers Utility Module
 * Handles stat modifications, ability effects, and stage calculations
 */

import { BOOST_STAT_PRIORITY, STACK_STAT, FORCED_MOVES } from './pokemonConstants';
import { normalizeAbilityName } from './display';

/**
 * Get applicable modifier pills for a pokemon based on its ability and status
 * @param {string} selectedAbility - Pokemon's selected ability
 * @param {string} status - Current status (brn, par, etc. or null)
 * @param {Array} entryPillDefs - Entry effect pill definitions
 * @param {string} effectiveAbility - Overriding ability (Trace/Receiver/PoA)
 * @param {string} pokemonId - Pokemon ID
 * @returns {Array} Modifier pill definitions
 */
export function getModifierPills(selectedAbility, status, entryPillDefs, effectiveAbility, pokemonId) {
  const ab = normalizeAbilityName(effectiveAbility ?? selectedAbility);
  const pills = [];
  const isStatused = !!status;
  const push = (id, label, extra = {}) => pills.push({ id, label, stat: null, delta: 0, isStage: false, ...extra });

  // ── Always-on (auto-enabled) ──────────────────────────────────────────────
  if (ab === 'imposter') push('imposter', 'Imposter');
  if (ab === 'hugepower' || ab === 'purepower') push(ab, 'Huge Power');
  if (ab === 'gorillatactics') push('gorillatactics', 'Gorilla Tactics');
  if (ab === 'hustle') push('hustle', 'Hustle');
  if (ab === 'slowstart') push('slowstart', 'Slow Start');

  // ── Stack-count abilities ────────────────────────────────────────────────
  if (ab === 'speedboost') push('speedboost', 'Speed Boost', { isStack: true });
  if (ab === 'moxie') push('moxie', 'Moxie', { isStack: true });
  if (ab === 'grimneigh') push('grimneigh', 'Grim Neigh', { isStack: true });
  if (ab === 'chillingneigh') push('chillingneigh', 'Chilling Neigh', { isStack: true });
  if (ab === 'beastboost') push('beastboost', 'Beast Boost', { isStack: true });
  if (['asone','asoneas','asonegrimm','asoneglastrier','asonespectrier'].includes(ab))
    push('asone', 'As One', { isStack: true });
  if (ab === 'stamina') push('stamina', 'Stamina', { isStack: true });
  if (ab === 'berserk') push('berserk', 'Berserk', { isStack: true });
  if (ab === 'strengthsap') push('strengthsap', 'Strength Sap', { isStack: true });

  // ── Status-conditional ───────────────────────────────────────────────────
  if (ab === 'guts') push('guts', 'Guts');
  if (ab === 'quickfeet') push('quickfeet', 'Quick Feet');
  if (ab === 'marvelscale') push('marvelscale', 'Marvel Scale');
  if (ab === 'flareboost') push('flareboost', 'Flare Boost');
  if (ab === 'toxicboost') push('toxicboost', 'Toxic Boost');

  // ── Weather/terrain speed doublers ───────────────────────────────────────
  if (ab === 'chlorophyll') push('chlorophyll', 'Chlorophyll');
  if (ab === 'swiftswim') push('swiftswim', 'Swift Swim');
  if (ab === 'sandrush') push('sandrush', 'Sand Rush');
  if (ab === 'slushrush') push('slushrush', 'Slush Rush');
  if (ab === 'surgesurfer') push('surgesurfer', 'Surge Surfer');

  // ── Weather-conditional stat boosts ──────────────────────────────────────
  if (ab === 'solarpower') push('solarpower', 'Solar Power');
  if (ab === 'flowergift') push('flowergift', 'Flower Gift');
  if (ab === 'sandforce') push('sandforce', 'Sand Force');

  // ── Condition-triggered multipliers ──────────────────────────────────────
  if (ab === 'protosynthesis') push('protosynthesis', 'Protosynthesis');
  if (ab === 'quarkdrive') push('quarkdrive', 'Quark Drive');
  if (ab === 'hadronengine') push('hadronengine', 'Hadron Engine');
  if (ab === 'orichalcumpulse') push('orichalcumpulse', 'Orichalcum Pulse');
  if (ab === 'flashfire') push('flashfire', 'Flash Fire');
  if (ab === 'unburden') push('unburden', 'Unburden');

  // ── On-hit multi-activatable stat boosts ─────────────────────────────────
  if (ab === 'justified') push('justified', 'Justified', { isStack: true });
  if (ab === 'rattled') push('rattled', 'Rattled', { isStack: true });
  if (ab === 'thermalexchange') push('thermalexchange', 'Thermal Exchange', { isStack: true });
  if (ab === 'sapsipper') push('sapsipper', 'Sap Sipper', { isStack: true });
  if (ab === 'motordrive') push('motordrive', 'Motor Drive', { isStack: true });
  if (ab === 'lightningrod') push('lightningrod', 'Lightning Rod', { isStack: true });
  if (ab === 'stormdrain') push('stormdrain', 'Storm Drain', { isStack: true });
  if (ab === 'steamengine') push('steamengine', 'Steam Engine', { isStack: true });
  if (ab === 'watercompaction') push('watercompaction', 'Water Compaction', { isStack: true });
  if (ab === 'weakarmor') push('weakarmor', 'Weak Armor', { isStack: true });
  if (ab === 'angershell') push('angershell', 'Anger Shell', { isStack: true });

  // ── Off-by-default condition/event abilities ────────────────────────────
  if (ab === 'windrider') push('windrider', 'Wind Rider');
  if (ab === 'windpower') push('windpower', 'Wind Power');

  // ── Transform pill ───────────────────────────────────────────────────────
  const pid = (pokemonId ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const ownAb = normalizeAbilityName(selectedAbility);
  const isTransformUser = ['mew','smeargle'].includes(pid) || (pid === 'ditto' && ownAb !== 'imposter');
  if (isTransformUser) push('transformpill', 'Transform');

  const isImposter = ownAb === 'imposter';
  if (isImposter || isTransformUser) push('copystatchanges', 'Copy Stat Changes');

  if (ab === 'electromorphosis') push('electromorphosis', 'Electromorphosis');
  if (ab === 'opportunist') push('opportunist', 'Opportunist');
  if (ab === 'mirrorherb') push('mirrorherb', 'Mirror Herb');
  if (ab === 'seedsower') push('seedsower', 'Seed Sower');

  // ── Entry interaction pills ──────────────────────────────────────────────
  const usedLabels = new Set(pills.map(p => p.label));
  for (const pill of (entryPillDefs ?? [])) {
    if (!usedLabels.has(pill.label)) {
      pills.push(pill);
      usedLabels.add(pill.label);
    }
  }

  return pills;
}

/**
 * Apply stat modifiers based on active abilities and conditions
 * @param {string} stat - Stat to modify (atk, def, spa, spd, spe)
 * @param {number} stagedVal - Stat value after stage calculations
 * @param {Object} stagedStats - All staged stats
 * @param {string} selectedAbility - Selected ability
 * @param {Set} activeModifiers - Active modifier pill IDs
 * @param {Object} stackCounts - Stack ability counts
 * @param {string} effectiveAbility - Overriding ability
 * @returns {number} Final modified stat value
 */
export function applyModifiers(stat, stagedVal, stagedStats, selectedAbility, activeModifiers, stackCounts, effectiveAbility) {
  const ab = normalizeAbilityName(effectiveAbility ?? selectedAbility);
  let val = stagedVal;
  const on = id => activeModifiers.has(id);
  const sc = stackCounts ?? {};

  // ── Huge Power / Pure Power: ×2 ATK ──────────────────────────────────────
  if ((ab === 'hugepower' || ab === 'purepower') && stat === 'atk')
    val = Math.floor(val * 2);

  // ── Gorilla Tactics: ×1.5 ATK ───────────────────────────────────────────
  if (ab === 'gorillatactics' && stat === 'atk')
    val = Math.floor(val * 1.5);

  // ── Hustle: ×1.5 ATK ────────────────────────────────────────────────────
  if (ab === 'hustle' && stat === 'atk')
    val = Math.floor(val * 1.5);

  // ── Slow Start: ×0.5 ATK and SPE ────────────────────────────────────────
  if (ab === 'slowstart' && (stat === 'atk' || stat === 'spe'))
    val = Math.floor(val * 0.5);

  // ── Guts: ×1.5 ATK ──────────────────────────────────────────────────────
  if (ab === 'guts' && stat === 'atk' && on('guts'))
    val = Math.floor(val * 1.5);

  // ── Quick Feet: ×1.5 SPE ────────────────────────────────────────────────
  if (ab === 'quickfeet' && stat === 'spe' && on('quickfeet'))
    val = Math.floor(val * 1.5);

  // ── Marvel Scale: ×1.5 DEF ──────────────────────────────────────────────
  if (ab === 'marvelscale' && stat === 'def' && on('marvelscale'))
    val = Math.floor(val * 1.5);

  // ── Flare Boost: ×1.5 SPA ───────────────────────────────────────────────
  if (ab === 'flareboost' && stat === 'spa' && on('flareboost'))
    val = Math.floor(val * 1.5);

  // ── Toxic Boost: ×1.5 ATK ───────────────────────────────────────────────
  if (ab === 'toxicboost' && stat === 'atk' && on('toxicboost'))
    val = Math.floor(val * 1.5);

  // ── Weather/terrain ×2 SPE ──────────────────────────────────────────────
  if (stat === 'spe') {
    if (ab === 'chlorophyll' && on('chlorophyll')) val = Math.floor(val * 2);
    if (ab === 'swiftswim' && on('swiftswim')) val = Math.floor(val * 2);
    if (ab === 'sandrush' && on('sandrush')) val = Math.floor(val * 2);
    if (ab === 'slushrush' && on('slushrush')) val = Math.floor(val * 2);
    if (ab === 'surgesurfer' && on('surgesurfer')) val = Math.floor(val * 2);
    if (ab === 'unburden' && on('unburden')) val = Math.floor(val * 2);
  }

  // ── Solar Power: ×1.5 SPA ───────────────────────────────────────────────
  if (ab === 'solarpower' && stat === 'spa' && on('solarpower'))
    val = Math.floor(val * 1.5);

  // ── Flower Gift: ×1.5 ATK and SPD ───────────────────────────────────────
  if (ab === 'flowergift' && (stat === 'atk' || stat === 'spd') && on('flowergift'))
    val = Math.floor(val * 1.5);

  // ── Protosynthesis / Quark Drive: ×1.3 highest stat ─────────────────────
  if ((ab === 'protosynthesis' || ab === 'quarkdrive') && on(ab)) {
    let best = BOOST_STAT_PRIORITY[0];
    for (const s of BOOST_STAT_PRIORITY.slice(1)) {
      if ((stagedStats[s] ?? 0) > (stagedStats[best] ?? 0)) best = s;
    }
    if (best === stat) val = Math.floor(val * (stat === 'spe' ? 1.5 : 1.3));
  }

  // ── Hadron Engine: ×1.3333 SPA ──────────────────────────────────────────
  if (ab === 'hadronengine' && stat === 'spa' && on('hadronengine'))
    val = Math.floor(val * 5461 / 4096);

  // ── Orichalcum Pulse: ×1.3333 ATK ───────────────────────────────────────
  if (ab === 'orichalcumpulse' && stat === 'atk' && on('orichalcumpulse'))
    val = Math.floor(val * 5461 / 4096);

  return val;
}

/**
 * Compute effective stat stages including intimidate reactions and stack ability additions
 * @param {Object} statStages - Base stat stages
 * @param {Object} opponentInfo - Opponent info
 * @param {Array} pillDefs - Pill definitions
 * @param {Set} activeModifiers - Active modifiers
 * @param {Object} stackCounts - Stack counts
 * @param {Object} baseStats - Base stats
 * @param {string} selectedAbility - Selected ability
 * @returns {Object} Effective stages
 */
export function computeEffectiveStages(statStages, opponentInfo, pillDefs, activeModifiers, stackCounts, baseStats, selectedAbility) {
  const stages = { ...statStages };
  const sc = stackCounts ?? {};

  // ── Intimidate reactions ─────────────────────────────────────────────────
  if (opponentInfo?.intimidateActive) {
    const find = r => pillDefs.find(p => p.reaction === r);
    const on = p => p && activeModifiers.has(p.id);
    const guardDog = find('guarddog');
    const contrary = find('contrary');
    const blocker = pillDefs.find(p => p.role === 'blocker');
    const defiant = find('defiant');
    const compet = find('competitive');

    if (on(guardDog) || on(contrary)) {
      stages.atk = Math.max(-6, Math.min(6, stages.atk + 1));
    } else if (on(blocker)) {
      // blocked — no change
    } else {
      stages.atk = Math.max(-6, Math.min(6, stages.atk - 1));
      if (on(defiant)) stages.atk = Math.max(-6, Math.min(6, stages.atk + 2));
      if (on(compet)) stages.spa = Math.max(-6, Math.min(6, stages.spa + 2));
    }
  }

  // ── Stack ability stage additions ────────────────────────────────────────
  const add = (stat, n) => {
    stages[stat] = Math.max(-6, Math.min(6, (stages[stat] ?? 0) + n));
  };

  if ((sc.speedboost ?? 0) > 0) add('spe', sc.speedboost);
  if ((sc.moxie ?? 0) > 0) add('atk', sc.moxie);
  if ((sc.grimneigh ?? 0) > 0) add('spa', sc.grimneigh);
  if ((sc.chillingneigh ?? 0) > 0) add('atk', sc.chillingneigh);
  if ((sc.stamina ?? 0) > 0) add('def', sc.stamina);
  if ((sc.berserk ?? 0) > 0) add('spa', sc.berserk);
  if ((sc.strengthsap ?? 0) > 0) add('atk', -(sc.strengthsap));
  if ((sc.justified ?? 0) > 0) add('atk', sc.justified);
  if ((sc.rattled ?? 0) > 0) add('spe', sc.rattled);
  if ((sc.thermalexchange ?? 0) > 0) add('atk', sc.thermalexchange);
  if ((sc.sapsipper ?? 0) > 0) add('atk', sc.sapsipper);
  if ((sc.motordrive ?? 0) > 0) add('spe', sc.motordrive);
  if ((sc.lightningrod ?? 0) > 0) add('spa', sc.lightningrod);
  if ((sc.stormdrain ?? 0) > 0) add('spa', sc.stormdrain);
  if ((sc.steamengine ?? 0) > 0) add('spe', Math.min(sc.steamengine * 6, 6));
  if ((sc.watercompaction ?? 0) > 0) add('def', Math.min(sc.watercompaction * 2, 6));
  if ((sc.weakarmor ?? 0) > 0) {
    add('spe', sc.weakarmor);
    add('def', -(sc.weakarmor));
  }
  if ((sc.angershell ?? 0) > 0) {
    add('atk', 1);
    add('spa', 1);
    add('spe', 1);
    add('def', -1);
    add('spd', -1);
  }

  // Beast Boost / As One: +1 to highest base stat per activation
  const beastN = (sc.beastboost ?? 0) + (sc.asone ?? 0);
  const abForStack = (selectedAbility ?? '').toLowerCase().replace(/[^a-z]/g, '');
  if (beastN > 0 && baseStats) {
    const isGlastrierVariant = abForStack === 'asoneglastrier';
    const isSpectrierVariant = ['asonespectrier','asonegrimm','asoneas'].includes(abForStack);
    if (isSpectrierVariant) {
      add('spa', beastN);
    } else if (isGlastrierVariant) {
      add('atk', beastN);
    } else {
      const statList = ['atk','def','spa','spd','spe'];
      let best = statList[0];
      for (const s of statList.slice(1)) {
        if ((baseStats[s] ?? 0) > (baseStats[best] ?? 0)) best = s;
      }
      add(best, beastN);
    }
  }

  return stages;
}
