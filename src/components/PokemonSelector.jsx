import LiquidGlass from './LiquidGlass';
import React, { useState, useEffect, useLayoutEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { createPortal } from 'react-dom';
import { Dex } from '@pkmn/dex';
import { Generations } from '@pkmn/data';
import '../styles/PokemonSelector.css';

// ── Marquee hook for overflowing names ──────────────────────────────────────
function useMarqueeOnOverflow(deps = []) {
  const wrapperRef = useRef(null);
  const textRef = useRef(null);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const text = textRef.current;
    if (!wrapper || !text) return;

    const checkOverflow = () => {
      // Reset completely first so scrollWidth is the clean single-copy measurement
      text.classList.remove('marquee');
      text.removeAttribute('data-marquee');
      text.style.removeProperty('--one-copy-width');
      wrapper.style.removeProperty('mask-image');
      wrapper.style.removeProperty('-webkit-mask-image');
      void text.offsetWidth; // force reflow

      const isOverflowing = text.scrollWidth > wrapper.clientWidth && text.textContent.length >= 11;

      if (isOverflowing) {
        const singleWidth = text.scrollWidth;
        // 1.5em gap between end of copy 1 and start of copy 2 (matches ::after padding-left)
        const fontSize = parseFloat(getComputedStyle(text).fontSize) || 28;
        const gapPx = fontSize * 1.5;
        text.style.setProperty('--one-copy-width', `${singleWidth + gapPx}px`);
        text.setAttribute('data-marquee', text.textContent);
        text.classList.add('marquee');
        // Apply fade mask only when actually scrolling
        const fade = 'linear-gradient(to right, transparent 0%, #000 6%, #000 94%, transparent 100%)';
        wrapper.style.maskImage = fade;
        wrapper.style.webkitMaskImage = fade;
      }
    };

    // rAF ensures the browser has applied any CSS class changes (e.g. has-shiny-btn
    // padding-right) before we measure clientWidth — without this, the hook fires
    // synchronously after render before the layout engine has reflowed.
    const rafId = requestAnimationFrame(checkOverflow);
    window.addEventListener('resize', checkOverflow);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', checkOverflow);
    };
  }, deps);

  return { wrapperRef, textRef };
}

// ─── Learnset resolution via @pkmn/dex at runtime ─────────────────────────────
// A move is legal in SV VGC if the pokemon has ANY historical learnset entry for
// it (any gen) AND the move exists in gen9 (allMoves already filters this).
// This correctly handles DLC pokemon like Incineroar whose gen9-specific entries
// are incomplete in static JSON but whose full historical learnset is in Dex.
const _lsCache = {};

// Full prevo chain traversal - same approach as smogon damage calc.
// A move is legal if ANY pokemon in the prevo chain can learn it in ANY gen
// AND the move exists in gen9 (allMoves already filters this).
// This is why Incineroar can use Fake Out (learned by Litten), etc.
async function getAllLearnableIds(speciesId) {
  if (speciesId in _lsCache) return _lsCache[speciesId];

  const ids = new Set();
  let currentId = speciesId;
  const visited = new Set();

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    try {
      const lsData = await Dex.learnsets.get(currentId);
      Object.keys(lsData?.learnset ?? {}).forEach(id => ids.add(id));
    } catch (e) { /* skip */ }
    try {
      const species = Dex.species.get(currentId);
      const prevo = species?.prevo;
      currentId = prevo ? prevo.toLowerCase().replace(/[^a-z0-9]/g, '') : null;
    } catch (e) { currentId = null; }
  }

  // Always return the Set — never null — so callers can safely call .add() on it.
  // The cache key uses `in` check so an empty Set is a valid cached result.
  _lsCache[speciesId] = ids;
  return ids;
}

const NATURES = {
  Hardy:   { boost: null, drop: null },
  Lonely:  { boost: 'atk', drop: 'def' },
  Brave:   { boost: 'atk', drop: 'spe' },
  Adamant: { boost: 'atk', drop: 'spa' },
  Naughty: { boost: 'atk', drop: 'spd' },
  Bold:    { boost: 'def', drop: 'atk' },
  Docile:  { boost: null, drop: null },
  Relaxed: { boost: 'def', drop: 'spe' },
  Impish:  { boost: 'def', drop: 'spa' },
  Lax:     { boost: 'def', drop: 'spd' },
  Timid:   { boost: 'spe', drop: 'atk' },
  Hasty:   { boost: 'spe', drop: 'def' },
  Serious: { boost: null, drop: null },
  Jolly:   { boost: 'spe', drop: 'spa' },
  Naive:   { boost: 'spe', drop: 'spd' },
  Modest:  { boost: 'spa', drop: 'atk' },
  Mild:    { boost: 'spa', drop: 'def' },
  Quiet:   { boost: 'spa', drop: 'spe' },
  Bashful: { boost: null, drop: null },
  Rash:    { boost: 'spa', drop: 'spd' },
  Calm:    { boost: 'spd', drop: 'atk' },
  Gentle:  { boost: 'spd', drop: 'def' },
  Sassy:   { boost: 'spd', drop: 'spe' },
  Careful: { boost: 'spd', drop: 'spa' },
  Quirky:  { boost: null, drop: null },
};

const STAT_COLORS = {
  atk: '#B8D8FF',
  def: '#98D8B8',
  spa: '#C8E8A0',
  spd: '#F0F080',
  spe: '#F8B860',
};

const STATUS_CONDITIONS = [
  { id: 'brn',  label: 'BRN',  name: 'Burned',       color: '#FF7034', bg: 'rgba(255,112,52,0.15)'  },
  { id: 'par',  label: 'PAR',  name: 'Paralyzed',    color: '#F8D030', bg: 'rgba(248,208,48,0.15)'  },
  { id: 'psn',  label: 'PSN',  name: 'Poisoned',     color: '#B97FC9', bg: 'rgba(185,127,201,0.15)' },
  { id: 'tox',  label: 'TOX',  name: 'Badly Psn.',   color: '#7B3F8C', bg: 'rgba(123,63,140,0.15)'  },
  { id: 'frz',  label: 'FRZ',  name: 'Frozen',       color: '#60C8F8', bg: 'rgba(96,200,248,0.15)'  },
  { id: 'slp',  label: 'SLP',  name: 'Asleep',       color: '#A8A8A8', bg: 'rgba(168,168,168,0.15)' },
];

// ── Showdown set parser ────────────────────────────────────────────────────
const SD_STAT_MAP = { HP:'hp', Atk:'atk', Def:'def', SpA:'spa', SpD:'spd', Spe:'spe' };
function parseShowdownSet(text) {
  const lines = text.trim().split('\n').map(l => l.trim()).filter(Boolean);
  if (!lines.length) return null;

  // Line 1: "[Nickname] (Species) @ Item"  OR  "Species @ Item"  OR just "Species"
  let line1 = lines[0];
  let itemName = null;
  if (line1.includes(' @ ')) {
    const atIdx = line1.lastIndexOf(' @ ');
    itemName = line1.slice(atIdx + 3).trim();
    line1 = line1.slice(0, atIdx).trim();
  }

  // Strip gender marker (M) or (F)
  line1 = line1.replace(/\s*\([MF]\)\s*$/, '').trim();

  // If there's a (Species) in parens it's a nickname — extract species
  const nicknameMatch = line1.match(/^.+\((.+)\)\s*$/);
  let pokeName = nicknameMatch ? nicknameMatch[1].trim() : line1.trim();

  let ability = null, nature = null, shiny = false;
  const evs = { hp:0, atk:0, def:0, spa:0, spd:0, spe:0 };
  const ivs = { hp:31, atk:31, def:31, spa:31, spd:31, spe:31 };
  const moves = [];

  for (let i = 1; i < lines.length; i++) {
    const l = lines[i];
    if (l.startsWith('Ability: '))       { ability = l.slice(9).trim(); }
    else if (l === 'Shiny: Yes')          { shiny = true; }
    else if (l.match(/^\w+ Nature$/))     { nature = l.split(' ')[0]; }
    else if (l.startsWith('EVs: '))       {
      l.slice(5).split('/').forEach(p => {
        const parts = p.trim().split(' ');
        const n = parseInt(parts[0]);
        const s = parts[1];
        if (SD_STAT_MAP[s] && !isNaN(n)) evs[SD_STAT_MAP[s]] = n;
      });
    }
    else if (l.startsWith('IVs: '))       {
      l.slice(5).split('/').forEach(p => {
        const parts = p.trim().split(' ');
        const n = parseInt(parts[0]);
        const s = parts[1];
        if (SD_STAT_MAP[s] && !isNaN(n)) ivs[SD_STAT_MAP[s]] = n;
      });
    }
    else if (l.startsWith('- '))          { moves.push(l.slice(2).replace(/\s*\[.*?\]/, '').trim()); }
  }
  return { pokeName, itemName, ability, nature, shiny, evs, ivs, moves };
}


function makeParticle(statusId) {
  const BRN_COLORS = ['#FF7034','#FFB030','#FF4010','#FFE060','#FF5520','#FFCC00'];
  const PSN_COLOR  = '#B97FC9';
  const TOX_COLOR  = '#7B3F8C';
  return {
    id: Math.random() + Date.now(),
    x:   5  + Math.random() * 90,          // % left within badge
    dur: 0.7 + Math.random() * 0.8,        // seconds
    dx:  (Math.random() - 0.5) * 22,       // final x drift px
    size: statusId === 'slp' ? (6 + Math.random() * 5)
        : statusId === 'psn' || statusId === 'tox' ? (4 + Math.random() * 4)
        : (2 + Math.random() * 3),
    color: statusId === 'brn' ? BRN_COLORS[Math.floor(Math.random() * BRN_COLORS.length)]
         : statusId === 'tox' ? TOX_COLOR
         : PSN_COLOR,
    delay: Math.random() * 0.15,
  };
}

function StatusParticle({ type, p }) {
  const base = {
    position: 'absolute',
    bottom: '90%',
    left: p.x + '%',
    pointerEvents: 'none',
    animationDuration: p.dur + 's',
    animationDelay: p.delay + 's',
    animationFillMode: 'forwards',
    animationTimingFunction: 'ease-out',
    '--dx': p.dx + 'px',
    zIndex: 10,
  };
  if (type === 'brn') return (
    <span style={{
      ...base,
      width: p.size + 'px', height: p.size + 'px',
      borderRadius: '50%',
      background: p.color,
      boxShadow: `0 0 ${p.size * 2}px ${p.color}`,
      animationName: 'particle-rise',
      display: 'block',
    }}/>
  );
  if (type === 'psn' || type === 'tox') return (
    <span style={{
      ...base,
      width: p.size + 'px', height: p.size + 'px',
      borderRadius: '50%',
      border: `1.5px solid ${p.color}`,
      background: p.color + '55',
      animationName: 'bubble-rise',
      display: 'block',
    }}/>
  );
  if (type === 'slp') return (
    <span style={{
      ...base,
      fontSize: p.size + 'px',
      color: '#C8A8F0',
      fontWeight: 900,
      lineHeight: 1,
      animationName: 'zzz-rise',
      bottom: '85%',
      display: 'block',
    }}>Z</span>
  );
  return null;
}

function StatusBadge({ statusId, label, title }) {
  const [particles, setParticles] = useState([]);
  const intervalRef = useRef(null);
  const animTimeoutRef = useRef(null);
  const alive = useRef(true);
  const spanRef = useRef(null);
  const PARTICLE_TYPES = ['brn','psn','tox','slp'];
  const CSS_ANIM_TYPES  = ['par','frz'];

  // Add status-anim-active class to trigger CSS animation.
  // durationMs > 0 → remove after that many ms (mount burst).
  // durationMs = 0 → leave on until stopCssAnim is called (hover infinite).
  const triggerCssAnim = (durationMs) => {
    const el = spanRef.current;
    if (!el) return;
    clearTimeout(animTimeoutRef.current);
    el.classList.remove('status-anim-active');
    void el.offsetWidth; // force reflow so the browser restarts the animation
    el.classList.add('status-anim-active');
    if (durationMs > 0) {
      animTimeoutRef.current = setTimeout(() => {
        if (el) el.classList.remove('status-anim-active');
      }, durationMs);
    }
  };

  const stopCssAnim = () => {
    clearTimeout(animTimeoutRef.current);
    if (spanRef.current) spanRef.current.classList.remove('status-anim-active');
  };

  const spawn = (count) => {
    if (!alive.current || !PARTICLE_TYPES.includes(statusId)) return;
    const fresh = Array.from({ length: count }, () => makeParticle(statusId));
    setParticles(p => [...p, ...fresh]);
    fresh.forEach(pt => {
      setTimeout(() => {
        if (alive.current) setParticles(p => p.filter(x => x.id !== pt.id));
      }, (pt.dur + pt.delay + 0.3) * 1000);
    });
  };

  // Burst on mount / status change
  useEffect(() => {
    alive.current = true;
    // Particle burst for BRN/PSN/TOX/SLP
    if (PARTICLE_TYPES.includes(statusId)) {
      for (let i = 0; i < 4; i++) setTimeout(() => spawn(2), i * 160);
    }
    // CSS anim burst for PAR (3 × 0.45s ≈ 1.4s) and FRZ (2 × 0.55s ≈ 1.2s)
    if (statusId === 'par') triggerCssAnim(1400);
    if (statusId === 'frz') triggerCssAnim(1200);
    return () => {
      alive.current = false;
      clearInterval(intervalRef.current);
      clearTimeout(animTimeoutRef.current);
    };
  }, [statusId]);

  const onEnter = () => {
    if (PARTICLE_TYPES.includes(statusId)) {
      spawn(5);
      intervalRef.current = setInterval(() => spawn(2), 220);
    }
    // Infinite hover for PAR and FRZ — stays until onLeave removes the class
    if (CSS_ANIM_TYPES.includes(statusId)) triggerCssAnim(0);
  };

  const onLeave = () => {
    clearInterval(intervalRef.current);
    if (CSS_ANIM_TYPES.includes(statusId)) stopCssAnim();
  };

  return (
    <span
      ref={spanRef}
      className={`type-status-badge status-${statusId}`}
      title={title}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      {label}
      <span className="status-particles-host">
        {particles.map(p => <StatusParticle key={p.id} type={statusId} p={p}/>)}
      </span>
    </span>
  );
}

const computeDisplayBP = (move, attacker, defender) => {
  if (!move) return null;
  const id = move.id;
  const base = move.basePower;

  // attacker = { weight, spe, currentHp, maxHp }
  // defender = { weight, spe, currentHp, maxHp }
  const aHp  = attacker?.currentHp ?? attacker?.maxHp ?? 1;
  const aMax = attacker?.maxHp ?? 1;
  const dHp  = defender?.currentHp ?? defender?.maxHp ?? 1;
  const dMax = defender?.maxHp ?? 1;
  const aW   = attacker?.weight || 1;
  const dW   = defender?.weight || 1;
  const aSpe = attacker?.spe || 1;
  const dSpe = defender?.spe || 1;

  // HP-based (stronger at full HP) — user
  if (['eruption','waterspout','dragonenergy'].includes(id)) {
    return Math.max(1, Math.floor(150 * aHp / aMax));
  }
  // HP-based (stronger at low HP) — user
  if (['flail','reversal','mightycleaverflail'].includes(id)) {
    const pct = aHp / aMax * 100;
    if (pct <= 4.17)  return 200;
    if (pct <= 10.42) return 150;
    if (pct <= 20.83) return 100;
    if (pct <= 35.42) return 80;
    if (pct <= 68.75) return 40;
    return 20;
  }
  // HP-based (target HP)
  if (['crushgrip','wringout'].includes(id)) {
    return Math.max(1, Math.floor(120 * dHp / dMax));
  }
  if (id === 'hardpress') {
    return Math.max(1, Math.floor(100 * dHp / dMax));
  }
  // Weight-based (target weight)
  if (['grassknot','lowkick'].includes(id)) {
    if (dW < 10)  return 20;
    if (dW < 25)  return 40;
    if (dW < 50)  return 60;
    if (dW < 100) return 80;
    if (dW < 200) return 100;
    return 120;
  }
  // Weight-based (attacker vs target)
  if (['heavyslam','heatcrash'].includes(id)) {
    const ratio = aW / dW;
    if (ratio >= 5) return 120;
    if (ratio >= 4) return 100;
    if (ratio >= 3) return 80;
    if (ratio >= 2) return 60;
    return 40;
  }
  // Speed-based (gyro ball: slower user = more power)
  if (id === 'gyroball') {
    return Math.min(150, Math.floor(25 * dSpe / aSpe));
  }
  // Speed-based (electro ball: faster user = more power)
  if (id === 'electroball') {
    const r = Math.floor(aSpe / dSpe);
    if (r >= 4) return 150;
    if (r >= 3) return 120;
    if (r >= 2) return 80;
    if (r >= 1) return 60;
    return 40;
  }
  return base > 0 ? base : null;
};

const _normAb = s => (s ?? '').toLowerCase().replace(/[^a-z]/g, '');

// Pokemon that must have specific moves locked to specific slots (no X button).
// Keys match pokemon.id exactly as returned by @pkmn/data.
const FORCED_MOVES = {
  // Keldeo-Resolute must know Secret Sword (form requirement)
  'keldeo-resolute':   [{ slot: 0, moveName: 'Secret Sword' }],
  // Zacian-Crowned: Iron Head → Behemoth Blade in battle
  'zacian-crowned':    [{ slot: 0, moveName: 'Behemoth Blade' }],
  // Zamazenta-Crowned: Iron Head → Behemoth Bash in battle
  'zamazenta-crowned': [{ slot: 0, moveName: 'Behemoth Bash' }],
};
const BOOST_STAT_PRIORITY = ['atk','def','spa','spd','spe'];

// Stack-based abilities — each activation = +1 stat stage on the listed stat.
// beast boost / as one: highest stat (resolved at render time).
const STACK_STAT = {
  speedboost:   'spe',
  moxie:        'atk',
  grimneigh:    'spa',
  chillingneigh:'atk',
  beastboost:   null,  // highest stat resolved dynamically
  asone:        null,  // composite — same as beast boost half
  asonegrimm:   null,
  stamina:      'def',
  berserk:      'spa',
  strengthsap:  'atk', // negative on target — apply as -1 per use
};

// Which modifier pills are relevant for this pokemon/ability/status/entryPillDefs
// effectiveAbility: overrides selectedAbility when Trace/Receiver is active
function getModifierPills(selectedAbility, status, entryPillDefs, effectiveAbility, pokemonId) {
  const ab = _normAb(effectiveAbility ?? selectedAbility);
  const pills = [];
  const isStatused = !!status;
  const push = (id, label, extra = {}) => pills.push({ id, label, stat: null, delta: 0, isStage: false, ...extra });

  // ── Always-on (auto-enabled) ──────────────────────────────────────────────
  if (ab === 'imposter') push('imposter', 'Imposter'); // Ditto's imposter — always shown
  if (ab === 'hugepower' || ab === 'purepower') push(ab,               'Huge Power');
  if (ab === 'gorillatactics')                  push('gorillatactics', 'Gorilla Tactics');
  if (ab === 'hustle')                          push('hustle',         'Hustle');
  if (ab === 'slowstart')                       push('slowstart',      'Slow Start');

  // ── Stack-count abilities (dropdown 0-6, applied as stage changes) ────────
  if (ab === 'speedboost')    push('speedboost',    'Speed Boost',    { isStack: true });
  if (ab === 'moxie')         push('moxie',         'Moxie',          { isStack: true });
  if (ab === 'grimneigh')     push('grimneigh',      'Grim Neigh',     { isStack: true });
  if (ab === 'chillingneigh') push('chillingneigh',  'Chilling Neigh', { isStack: true });
  if (ab === 'beastboost')    push('beastboost',    'Beast Boost',    { isStack: true });
  // As One — catch all normalizations: 'asoneas', 'asonegrimm', 'asoneglastrier', 'asonespectrier', 'asone'
  if (['asone','asoneas','asonegrimm','asoneglastrier','asonespectrier'].includes(ab))
                              push('asone',         'As One',         { isStack: true });
  if (ab === 'stamina')       push('stamina',       'Stamina',        { isStack: true });
  if (ab === 'berserk')       push('berserk',       'Berserk',        { isStack: true });
  if (ab === 'strengthsap')   push('strengthsap',   'Strength Sap',   { isStack: true });

  // ── Status-conditional — shown always, auto-enabled when status present ──
  if (ab === 'guts')        push('guts',        'Guts');
  if (ab === 'quickfeet')   push('quickfeet',   'Quick Feet');
  if (ab === 'marvelscale') push('marvelscale', 'Marvel Scale');
  if (ab === 'flareboost')  push('flareboost',  'Flare Boost');
  if (ab === 'toxicboost')  push('toxicboost',  'Toxic Boost');

  // ── Weather/terrain speed doublers (OFF by default) ───────────────────────
  if (ab === 'chlorophyll') push('chlorophyll', 'Chlorophyll');
  if (ab === 'swiftswim')   push('swiftswim',   'Swift Swim');
  if (ab === 'sandrush')    push('sandrush',    'Sand Rush');
  if (ab === 'slushrush')   push('slushrush',   'Slush Rush');
  if (ab === 'surgesurfer') push('surgesurfer', 'Surge Surfer');

  // ── Weather-conditional stat boosts (OFF by default) ─────────────────────
  if (ab === 'solarpower')  push('solarpower',  'Solar Power');
  if (ab === 'flowergift')  push('flowergift',  'Flower Gift');
  if (ab === 'sandforce')   push('sandforce',   'Sand Force');

  // ── Condition-triggered multipliers (OFF by default) ─────────────────────
  if (ab === 'protosynthesis')  push('protosynthesis',  'Protosynthesis');
  if (ab === 'quarkdrive')      push('quarkdrive',      'Quark Drive');
  if (ab === 'hadronengine')    push('hadronengine',    'Hadron Engine');
  if (ab === 'orichalcumpulse') push('orichalcumpulse', 'Orichalcum Pulse');
  if (ab === 'flashfire')       push('flashfire',       'Flash Fire');
  if (ab === 'unburden')        push('unburden',        'Unburden');
  // ── On-hit multi-activatable stat boosts (stack counter 0-6) ────────────────
  // Each counter unit = one activation of that ability's effect.
  if (ab === 'justified')      push('justified',      'Justified',      { isStack: true }); // +1 ATK per Dark hit
  if (ab === 'rattled')        push('rattled',        'Rattled',        { isStack: true }); // +1 SPE per Bug/Dark/Ghost hit
  if (ab === 'thermalexchange')push('thermalexchange','Thermal Exchange',{ isStack: true }); // +1 ATK per Fire hit
  if (ab === 'sapsipper')      push('sapsipper',      'Sap Sipper',     { isStack: true }); // +1 ATK per Grass hit
  if (ab === 'motordrive')     push('motordrive',     'Motor Drive',    { isStack: true }); // +1 SPE per Electric hit
  if (ab === 'lightningrod')   push('lightningrod',   'Lightning Rod',  { isStack: true }); // +1 SPA per Electric hit
  if (ab === 'stormdrain')     push('stormdrain',     'Storm Drain',    { isStack: true }); // +1 SPA per Water hit
  // Steam Engine: +6 SPE per Fire/Water hit — counter = number of activations (each = +6, capped at +6 total)
  if (ab === 'steamengine')    push('steamengine',    'Steam Engine',   { isStack: true });
  // Water Compaction: +2 DEF per Water hit — counter = activations
  if (ab === 'watercompaction')push('watercompaction','Water Compaction',{ isStack: true });
  // Weak Armor: +1 SPE, -1 DEF per physical hit
  if (ab === 'weakarmor')      push('weakarmor',      'Weak Armor',     { isStack: true });
  // Anger Shell: +1 ATK/SPA/SPE -1 DEF/SPD — triggered once when HP drops ≤50%. Counter: 0 or 1.
  if (ab === 'angershell')     push('angershell',     'Anger Shell',    { isStack: true });
  // ── Off-by-default condition/event abilities ──────────────────────────────
  if (ab === 'windrider')      push('windrider',      'Wind Rider');       // entry pill handles stage
  if (ab === 'windpower')      push('windpower',       'Wind Power');      // charges Electric (no stage)
  // Transform pill — for Mew/Smeargle only (Ditto is always locked, no pill)
  // @pkmn/data ids are lowercase alphanumeric — 'mew', 'smeargle'
  // Transform modifier — shown for Ditto (any ability except Imposter), Mew, Smeargle
  // Transform modifier — Ditto-Limber (any non-Imposter ability), Mew, Smeargle
  // pokemonId is from @pkmn/data: 'ditto', 'mew', 'smeargle'
  const pid = (pokemonId ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const isTransformUser = ['mew','smeargle'].includes(pid) || (pid === 'ditto' && ab !== 'imposter');
  if (isTransformUser) push('transformpill', 'Transform');
  // "Copy Stat Changes" — shown for Imposter (always visible) and transform users (only when transform ON)
  // Note: actual filtering for transformpill is done in JSX (.filter step)
  const isImposter = ab === 'imposter' || _normAb(selectedAbility) === 'imposter';
  if (isImposter || isTransformUser) push('copystatchanges', 'Copy Stat Changes');
  if (ab === 'electromorphosis')push('electromorphosis','Electromorphosis'); // charges Electric (no stage)
  // Opportunist / Mirror Herb: copy opp stat boosts — informational toggle only
  if (ab === 'opportunist')    push('opportunist',    'Opportunist');
  if (ab === 'mirrorherb')     push('mirrorherb',     'Mirror Herb');
  // Seed Sower: sets Grassy Terrain when hit — toggle = terrain is now active
  if (ab === 'seedsower')      push('seedsower',      'Seed Sower');

  // ── Entry interaction pills (from applyEntryEffects) ─────────────────────
  const usedLabels = new Set(pills.map(p => p.label));
  for (const pill of (entryPillDefs ?? [])) {
    if (!usedLabels.has(pill.label)) pills.push(pill);
    usedLabels.add(pill.label);
  }

  return pills;
}

// Apply active modifier pills to a single stat's effective value.
// stagedStats = { atk, def, spa, spd, spe } WITH stages (base for multiplication)
function applyModifiers(stat, stagedVal, stagedStats, selectedAbility, activeModifiers, stackCounts, effectiveAbility) {
  const ab = _normAb(effectiveAbility ?? selectedAbility);
  let val = stagedVal;
  const on = id => activeModifiers.has(id);
  const sc = stackCounts ?? {};

  // ── Huge Power / Pure Power: ×2 ATK — always active, no toggle check ───────
  if ((ab === 'hugepower' || ab === 'purepower') && stat === 'atk')
    val = Math.floor(val * 2);

  // ── Gorilla Tactics: ×1.5 ATK — always active ────────────────────────────
  if (ab === 'gorillatactics' && stat === 'atk')
    val = Math.floor(val * 1.5);

  // ── Hustle: ×1.5 ATK — always active ─────────────────────────────────────
  if (ab === 'hustle' && stat === 'atk')
    val = Math.floor(val * 1.5);

  // ── Slow Start: ×0.5 ATK and SPE — always active ─────────────────────────
  if (ab === 'slowstart' && (stat === 'atk' || stat === 'spe'))
    val = Math.floor(val * 0.5);

  // ── Guts: ×1.5 ATK ───────────────────────────────────────────────────────
  if (ab === 'guts' && stat === 'atk' && on('guts'))
    val = Math.floor(val * 1.5);

  // ── Quick Feet: ×1.5 SPE ─────────────────────────────────────────────────
  if (ab === 'quickfeet' && stat === 'spe' && on('quickfeet'))
    val = Math.floor(val * 1.5);

  // ── Marvel Scale: ×1.5 DEF when statused ─────────────────────────────────
  if (ab === 'marvelscale' && stat === 'def' && on('marvelscale'))
    val = Math.floor(val * 1.5);

  // ── Flare Boost: ×1.5 SPA when burned ────────────────────────────────────
  if (ab === 'flareboost' && stat === 'spa' && on('flareboost'))
    val = Math.floor(val * 1.5);

  // ── Toxic Boost: ×1.5 ATK when poisoned ──────────────────────────────────
  if (ab === 'toxicboost' && stat === 'atk' && on('toxicboost'))
    val = Math.floor(val * 1.5);

  // ── Weather/terrain ×2 SPE ───────────────────────────────────────────────
  if (stat === 'spe') {
    if (ab === 'chlorophyll' && on('chlorophyll')) val = Math.floor(val * 2);
    if (ab === 'swiftswim'   && on('swiftswim'))   val = Math.floor(val * 2);
    if (ab === 'sandrush'    && on('sandrush'))     val = Math.floor(val * 2);
    if (ab === 'slushrush'   && on('slushrush'))    val = Math.floor(val * 2);
    if (ab === 'surgesurfer' && on('surgesurfer'))  val = Math.floor(val * 2);
    if (ab === 'unburden'    && on('unburden'))     val = Math.floor(val * 2);
  }

  // ── Solar Power: ×1.5 SPA in sun ─────────────────────────────────────────
  if (ab === 'solarpower' && stat === 'spa' && on('solarpower'))
    val = Math.floor(val * 1.5);

  // ── Flower Gift: ×1.5 ATK and SPD in sun ─────────────────────────────────
  if (ab === 'flowergift' && (stat === 'atk' || stat === 'spd') && on('flowergift'))
    val = Math.floor(val * 1.5);

  // ── Protosynthesis / Quark Drive: ×1.3 highest stat (×1.5 if SPE) ────────
  if ((ab === 'protosynthesis' || ab === 'quarkdrive') && on(ab)) {
    let best = BOOST_STAT_PRIORITY[0];
    for (const s of BOOST_STAT_PRIORITY.slice(1)) {
      if ((stagedStats[s] ?? 0) > (stagedStats[best] ?? 0)) best = s;
    }
    if (best === stat) val = Math.floor(val * (stat === 'spe' ? 1.5 : 1.3));
  }

  // ── Hadron Engine: ×1.3333 SPA ───────────────────────────────────────────
  if (ab === 'hadronengine' && stat === 'spa' && on('hadronengine'))
    val = Math.floor(val * 5461 / 4096);

  // ── Orichalcum Pulse: ×1.3333 ATK ────────────────────────────────────────
  if (ab === 'orichalcumpulse' && stat === 'atk' && on('orichalcumpulse'))
    val = Math.floor(val * 5461 / 4096);

  return val;
}

// Compute effective stages: base + intimidate reactions + stack ability stage additions
// stackCounts: { speedboost, moxie, ... } — number of activations
// baseStats: used to resolve Beast Boost / As One highest-stat
function computeEffectiveStages(statStages, opponentInfo, pillDefs, activeModifiers, stackCounts, baseStats, selectedAbility) {
  const stages = { ...statStages };
  const sc = stackCounts ?? {};

  // ── Intimidate reactions ─────────────────────────────────────────────────
  if (opponentInfo?.intimidateActive) {
    const find = r => pillDefs.find(p => p.reaction === r);
    const on   = p => p && activeModifiers.has(p.id);
    const guardDog = find('guarddog');
    const contrary = find('contrary');
    const blocker  = pillDefs.find(p => p.role === 'blocker');
    const defiant  = find('defiant');
    const compet   = find('competitive');

    if (on(guardDog) || on(contrary)) {
      stages.atk = Math.max(-6, Math.min(6, stages.atk + 1));
    } else if (on(blocker)) {
      // blocked — no change
    } else {
      stages.atk = Math.max(-6, Math.min(6, stages.atk - 1));
      if (on(defiant)) stages.atk = Math.max(-6, Math.min(6, stages.atk + 2));
      if (on(compet))  stages.spa = Math.max(-6, Math.min(6, stages.spa + 2));
    }
  }

  // ── Stack ability stage additions ────────────────────────────────────────
  const add = (stat, n) => { stages[stat] = Math.max(-6, Math.min(6, (stages[stat] ?? 0) + n)); };

  if ((sc.speedboost ?? 0) > 0)      add('spe', sc.speedboost);
  if ((sc.moxie ?? 0) > 0)           add('atk', sc.moxie);
  if ((sc.grimneigh ?? 0) > 0)       add('spa', sc.grimneigh);
  if ((sc.chillingneigh ?? 0) > 0)   add('atk', sc.chillingneigh);
  if ((sc.stamina ?? 0) > 0)         add('def', sc.stamina);
  if ((sc.berserk ?? 0) > 0)         add('spa', sc.berserk);
  if ((sc.strengthsap ?? 0) > 0)     add('atk', -(sc.strengthsap));
  // On-hit abilities — +1 per activation unless noted
  if ((sc.justified ?? 0) > 0)       add('atk', sc.justified);
  if ((sc.rattled ?? 0) > 0)         add('spe', sc.rattled);
  if ((sc.thermalexchange ?? 0) > 0) add('atk', sc.thermalexchange);
  if ((sc.sapsipper ?? 0) > 0)       add('atk', sc.sapsipper);
  if ((sc.motordrive ?? 0) > 0)      add('spe', sc.motordrive);
  if ((sc.lightningrod ?? 0) > 0)    add('spa', sc.lightningrod);
  if ((sc.stormdrain ?? 0) > 0)      add('spa', sc.stormdrain);
  // Steam Engine: +6 SPE per activation (each hit by Fire/Water = +6), clamp to +6 total
  if ((sc.steamengine ?? 0) > 0)     add('spe', Math.min(sc.steamengine * 6, 6));
  // Water Compaction: +2 DEF per activation
  if ((sc.watercompaction ?? 0) > 0) add('def', Math.min(sc.watercompaction * 2, 6));
  // Weak Armor: +1 SPE, -1 DEF per physical hit
  if ((sc.weakarmor ?? 0) > 0)       { add('spe', sc.weakarmor); add('def', -(sc.weakarmor)); }
  // Anger Shell: +1 ATK/SPA/SPE, -1 DEF/SPD — one trigger (counter 0 or 1)
  if ((sc.angershell ?? 0) > 0)      { add('atk', 1); add('spa', 1); add('spe', 1); add('def', -1); add('spd', -1); }

  // Beast Boost / As One: +1 to the highest base stat per activation
  // As One (Spectrier/Grimm) = Grim Neigh half → +SPA; As One (Glastrier) = Chilling Neigh half → +ATK
  const beastN = (sc.beastboost ?? 0) + (sc.asone ?? 0);
  const abForStack = (selectedAbility ?? '').toLowerCase().replace(/[^a-z]/g,'');
  if (beastN > 0 && baseStats) {
    const isGlastrierVariant = abForStack === 'asoneglastrier';
    const isSpectrierVariant = ['asonespectrier','asonegrimm','asoneas'].includes(abForStack);
    if (isSpectrierVariant) {
      add('spa', beastN); // Spectrier half = Grim Neigh = +SPA
    } else if (isGlastrierVariant) {
      add('atk', beastN); // Glastrier half = Chilling Neigh = +ATK
    } else {
      // Beast Boost: highest base stat
      const statList = ['atk','def','spa','spd','spe'];
      let best = statList[0];
      for (const s of statList.slice(1)) if ((baseStats[s] ?? 0) > (baseStats[best] ?? 0)) best = s;
      add(best, beastN);
    }
  }

  return stages;
}


const PokemonSelector = forwardRef(({ title, onSelect, selectedPokemon, collapsed, step = 1, onAbilityError, opponentInfo, opponentFullState, opponentPokemon, onStateChange, level = 100, onLevelChange = null, fieldConditions = null }, ref) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef(null);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 });
  const [allPokemon, setAllPokemon] = useState([]);
  const [userEvs, setUserEvs] = useState({ hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 });
  // evRaw stores the display string e.g. "252+" or "84" — decoupled from numeric evs
  const [evRaw, setEvRaw] = useState({ hp: '', atk: '', def: '', spa: '', spd: '', spe: '' });
  const [userIvs, setUserIvs] = useState({ hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 });
  const [statStages, setStatStages] = useState({ atk: 0, def: 0, spa: 0, spd: 0, spe: 0 });
  // Tracks which ability auto-applied each stage — shown as a label next to the stage button
  // Tracks toggleable modifier pills (Protosynthesis, Quark Drive, Guts, etc.)
  const [activeModifiers, setActiveModifiers] = useState(new Set());
  // Permanent pill definitions from entry effects — never cleared on toggle
  const entryPillDefsRef = useRef([]);
  // Stack-count abilities: number of activations (0–6)
  const [stackCounts, setStackCounts] = useState({ speedboost: 0, moxie: 0, grimneigh: 0, chillingneigh: 0, beastboost: 0, asone: 0, stamina: 0, berserk: 0, strengthsap: 0, justified: 0, rattled: 0, thermalexchange: 0, sapsipper: 0, motordrive: 0, lightningrod: 0, stormdrain: 0, steamengine: 0, watercompaction: 0, weakarmor: 0, angershell: 0 });
  const [stackDropdownOpen, setStackDropdownOpen] = useState(null); // id of open stack dropdown
  const [stackDropdownRect, setStackDropdownRect] = useState(null);
  // Ability copied by Trace / Receiver / Power of Alchemy (null when inactive)
  const [tracedAbility, setTracedAbility] = useState(null);
  // Ability manually picked by Power of Alchemy / Receiver from the ability picker
  const [poaPickedAbility, setPoaPickedAbility] = useState(null);
  const [poaSearch, setPoaSearch] = useState('');
  const [poaOpen, setPoaOpen] = useState(false);
  const [poaDropdownPos, setPoaDropdownPos] = useState({ top: 0, left: 0, bottom: null });
  const [selectedAbility, setSelectedAbility] = useState(null);
  const [calculatedStats, setCalculatedStats] = useState(null);
  const [evError, setEvError] = useState(null);
  const [shakeField, setShakeField] = useState(null);
  const [openStageDropdown, setOpenStageDropdown] = useState(null);
  const [dropdownDir, setDropdownDir] = useState('down');
  const [stageDropdownRect, setStageDropdownRect] = useState(null);
  const [shakeAbility, setShakeAbility] = useState(false);
  const [selectedNature, setSelectedNature] = useState('Hardy');
  const [natureOpen, setNatureOpen] = useState(false);
  const natureTriggerRef = useRef(null);
  // Local raw string for the level input — allows deletion to empty before re-clamping on blur
  const [levelRaw, setLevelRaw] = useState(String(level ?? 100));

  // Close all dropdowns when clicking outside
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (e.target.closest('.nature-dropdown-list') ||
          e.target.closest('.stat-stage-menu') ||
          e.target.closest('.search-results') ||
          e.target.closest('.nature-dropdown-wrap') ||
          e.target.closest('.stat-stage-dropdown') ||
          e.target.closest('.poa-dropdown-list') ||
          e.target.closest('.pokemon-search')) return;
      setNatureOpen(false);
      setOpenStageDropdown(null);
      setSearchOpen(false);
      setPoaOpen(false);
      setStackDropdownOpen(null);
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [natureOpen, openStageDropdown]);

  // Sync levelRaw when level prop changes externally (e.g. FieldConditions pill)
  useEffect(() => {
    setLevelRaw(String(level ?? 100));
  }, [level]);


  const [isShiny, setIsShiny] = useState(false);
  const [resolvedImageUrl, setResolvedImageUrl] = useState(null);
  const [opponentResolvedUrl, setOpponentResolvedUrl] = useState(null);
  const imageCache = useRef({});
  const itemWrapperRef = useRef(null);
  const itemSpriteCache = useRef({});
  const moveWrapperRefs = useRef([null, null, null, null]);
  const [moveSlotRects, setMoveSlotRects] = useState([null,null,null,null]);
  const fromPasteRef = useRef(false); // prevents useEffect from resetting pasted shiny
  // Tracks which stat Download is currently boosting so the reactive effect can diff correctly
  const downloadBoostRef = useRef(null); // null | 'atk' | 'spa'
  const preCommanderRef  = useRef(null); // stores Tatsugiri before Commander transform
  const [itemLocked, setItemLocked] = useState(false); // locked for transformation items

  // Marquee for long pokemon names
  const { wrapperRef: nameWrapperRef, textRef: nameTextRef } = useMarqueeOnOverflow([selectedPokemon?.name, step, collapsed]);

  // Convert item name to PokeAPI slug for sprite URL
  // e.g. "Life Orb" → "life-orb", "Ability Shield" → "ability-shield"
  const getItemSpriteUrl = (item) => {
    if (!item) return null;
    if (itemSpriteCache.current[item.id]) return itemSpriteCache.current[item.id];
    const slug = item.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const url = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/${slug}.png`;
    itemSpriteCache.current[item.id] = url;
    return url;
  };
  const [allItems, setAllItems] = useState([]);
  const [allAbilities, setAllAbilities] = useState([]);
  const [itemSearch, setItemSearch] = useState('');
  const [itemSearchOpen, setItemSearchOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [status, setStatus] = useState(null);

  // Auto-enable modifier pills — ONLY truly always-on abilities
  useEffect(() => {
    const ab = _normAb(selectedAbility);
    const ALWAYS_ACTIVE = ['hugepower','purepower','gorillatactics','hustle','slowstart'];
    if (ALWAYS_ACTIVE.includes(ab)) {
      setActiveModifiers(prev => { const n = new Set(prev); n.add(ab); return n; });
    }
  }, [selectedAbility]);

  // ── Imposter: auto-enable when ability is Imposter, keep locked ON ────────────
  useEffect(() => {
    const ab = _normAb(selectedAbility);
    if (ab === 'imposter') {
      setActiveModifiers(prev => { const n = new Set(prev); n.add('imposter'); n.add('copystatchanges'); return n; });
    }
  }, [selectedAbility]);

  // ── When transformed (Imposter or Transform pill), pipe the copied ability
  //    through tracedAbility so the full modifier machinery works identically
  //    to Trace/Receiver/PoA: pills appear, applyModifiers fires, entry effects
  //    fire — all automatically, exactly as if the pokemon natively had the ability.
  useEffect(() => {
    const isTransf = collapsed && (
      (_normAb(selectedAbility) === 'imposter' && activeModifiers.has('imposter')) ||
      activeModifiers.has('transformpill')
    );
    if (isTransf && opponentFullState?.ability) {
      setTracedAbility(opponentFullState.ability);
    } else if (!isTransf) {
      // Clear only if no Trace entry pill is holding tracedAbility
      const traceEntryPill = entryPillDefsRef.current.find(
        p => p.role === 'trace' && activeModifiers.has(p.id)
      );
      if (!traceEntryPill) setTracedAbility(null);
    }
  }, [activeModifiers.has('imposter'), activeModifiers.has('transformpill'), opponentFullState?.ability, collapsed]);

  // Auto-enable all status-conditional modifier pills when status is set
  useEffect(() => {
    const ab = _normAb(selectedAbility);
    const STATUS_ABS = ['guts','quickfeet','marvelscale','flareboost','toxicboost'];
    if (STATUS_ABS.includes(ab) && status) {
      setActiveModifiers(prev => { const n = new Set(prev); n.add(ab); return n; });
    }
  }, [status, selectedAbility]);

  // When tracedAbility changes (Trace/Receiver/PoA/Imposter/Transform), auto-enable
  // modifier pills exactly like the native ability would behave:
  //   • Always-on: enable unconditionally
  //   • Self-setting weather/terrain (Drought, Grassy Surge, Hadron Engine etc.): enable unconditionally
  //   • Condition-dependent (Chlorophyll, Quark Drive etc.): enable only if fieldConditions matches
  useEffect(() => {
    if (!tracedAbility) return;
    const ab = _normAb(tracedAbility);
    const fc = fieldConditions;
    const weather  = fc?.field?.weather  ?? null;
    const terrain  = fc?.field?.terrain  ?? null;
    const toEnable = new Set();

    // Always-on multipliers
    const ALWAYS_ON = ['hugepower','purepower','gorillatactics','hustle','slowstart'];
    if (ALWAYS_ON.includes(ab)) toEnable.add(ab);

    // Self-setting weather — always active regardless of field (they set it themselves on entry)
    const SELF_WEATHER = {
      drought: 'sun', desolateland: 'harshSunshine',
      drizzle: 'rain', primordialsea: 'heavyRain',
      sandstream: 'sand', snowwarning: 'snow', deltastream: 'strongWinds',
    };
    if (SELF_WEATHER[ab]) toEnable.add(ab);

    // Self-setting terrain
    const SELF_TERRAIN = {
      electricsurge: 'electric', grassysurge: 'grassy',
      mistysurge: 'misty', psychicsurge: 'psychic',
    };
    if (SELF_TERRAIN[ab]) toEnable.add(ab);

    // Hadron Engine: sets Electric Terrain + boosts SpA
    if (ab === 'hadronengine') toEnable.add(ab);
    // Orichalcum Pulse: sets Sun + boosts Atk
    if (ab === 'orichalcumpulse') toEnable.add(ab);

    // Condition-dependent — only enable if the matching weather/terrain is active
    const SUN  = weather === 'sun' || weather === 'harshSunshine';
    const RAIN = weather === 'rain' || weather === 'heavyRain';
    const SAND = weather === 'sand';
    const SNOW = weather === 'snow';
    const ELEC = terrain === 'electric';
    const GRASSY = terrain === 'grassy';

    if (ab === 'chlorophyll'      && SUN)   toEnable.add(ab);
    if (ab === 'swiftswim'        && RAIN)  toEnable.add(ab);
    if (ab === 'sandrush'         && SAND)  toEnable.add(ab);
    if (ab === 'slushrush'        && SNOW)  toEnable.add(ab);
    if (ab === 'surgesurfer'      && ELEC)  toEnable.add(ab);
    if (ab === 'quarkdrive'       && ELEC)  toEnable.add(ab);
    if (ab === 'protosynthesis'   && SUN)   toEnable.add(ab);
    if (ab === 'solarpower'       && SUN)   toEnable.add(ab);
    if (ab === 'flowergift'       && SUN)   toEnable.add(ab);
    if (ab === 'sandforce'        && SAND)  toEnable.add(ab);
    if (ab === 'seedsower'        && GRASSY) toEnable.add(ab);

    // Status-conditional — only enable if status is present
    const STATUS_ABS = ['guts','quickfeet','marvelscale','flareboost','toxicboost'];
    // (handled by separate status useEffect — skip here to avoid double-trigger)

    if (toEnable.size > 0)
      setActiveModifiers(prev => { const n = new Set(prev); toEnable.forEach(id => n.add(id)); return n; });
  }, [tracedAbility, fieldConditions]);

  // ── Transformation item lock ─────────────────────────────────────────────
  // These pokemon must hold their transformation item — user cannot change it.
  useEffect(() => {
    if (!selectedPokemon || !allItems.length) return;
    const findItem = name => allItems.find(it => it.name === name) ?? null;
    const id = selectedPokemon.id;
    const LOCKED_ITEMS = {
      'zaciancrowned':    'Rusted Sword',
      'zamazentacrowned': 'Rusted Shield',
      'palkiaorigin':     'Lustrous Globe',
      'dialganorigin':    'Adamant Crystal',
      'giratinaorigin':   'Griseous Core',
    };
    const lockedName = LOCKED_ITEMS[id];
    if (lockedName) {
      const item = findItem(lockedName);
      if (item) setSelectedItem(item);
      setItemLocked(true);
    } else {
      setItemLocked(false);
    }
  }, [selectedPokemon?.id, allItems]);

  const [allMoves, setAllMoves] = useState([]);
  const [learnableMoves, setLearnableMoves] = useState([]);
  const [selectedMoves, setSelectedMoves] = useState([null, null, null, null]);
  const [critMoves, setCritMoves] = useState([false, false, false, false]);
  // lockedMoves[i] = true → slot i is mandatory (no clear, no change)
  const [lockedMoves, setLockedMoves] = useState([false, false, false, false]);
  // transformOn: true when Transform pill is active
  const [transformOn, setTransformOn] = useState(false);

  // ── Keldeo-Resolute: Secret Sword is mandatory (required to maintain form) ──
  // Slot 1 = Move 1 (index 0). The user cannot remove it.
  useEffect(() => {
    setLockedMoves([false, false, false, false]);
    if (!selectedPokemon || !allMoves.length) return;
    // @pkmn/data id: 'keldeoresolute' (lowercase, alphanumeric only)
    if (selectedPokemon.id !== 'keldeoresolute') return;
    const secretSword = allMoves.find(m => m.name === 'Secret Sword');
    if (!secretSword) return;
    setSelectedMoves(prev => {
      const next = [...prev];
      if (!next[0] || next[0].name !== 'Secret Sword') next[0] = secretSword;
      return next;
    });
    setLockedMoves([true, false, false, false]);
  }, [selectedPokemon?.id, allMoves]);

  // ── Zacian-Crowned / Zamazenta-Crowned: Iron Head auto-becomes signature ──
  // When the user picks Iron Head in any slot, it's replaced by Behemoth Blade/Bash.
  const moveNamesKey = selectedMoves.map(m => m?.name ?? '').join(',');
  useEffect(() => {
    if (!selectedPokemon || !allMoves.length) return;
    const isBlade = selectedPokemon.id === 'zaciancrowned';
    const isBash  = selectedPokemon.id === 'zamazentacrowned';
    if (!isBlade && !isBash) return;
    const sigName = isBlade ? 'Behemoth Blade' : 'Behemoth Bash';
    const sigMove = allMoves.find(m => m.name === sigName);
    if (!sigMove) return;
    setSelectedMoves(prev => {
      if (!prev.some(m => m?.name === 'Iron Head')) return prev;
      return prev.map(m => (m?.name === 'Iron Head' ? sigMove : m));
    });
  }, [moveNamesKey, selectedPokemon?.id, allMoves]);

  // ── Auto-apply status + orb ONLY when modifier pill is explicitly toggled ON ──
  // Works for native ability OR copied ability (Trace/Receiver/PoA)
  useEffect(() => {
    if (!allItems.length) return;
    // Use the effective ability — copied takes priority over native
    const effectAb = _normAb(tracedAbility ?? poaPickedAbility ?? selectedAbility);
    const STATUS_ORB = {
      guts:        { status: 'brn', orb: 'Flame Orb'  },
      quickfeet:   { status: 'tox', orb: 'Toxic Orb'  },
      marvelscale: { status: 'brn', orb: 'Flame Orb'  },
      flareboost:  { status: 'brn', orb: 'Flame Orb'  },
      toxicboost:  { status: 'tox', orb: 'Toxic Orb'  },
      poisonheal:  { status: 'tox', orb: 'Toxic Orb'  },
    };
    const entry = STATUS_ORB[effectAb];
    if (!entry) return;
    const findItem = name => allItems.find(it => it.name === name) ?? null;
    // The pill id for the effective ability is the same as the ability id
    if (activeModifiers.has(effectAb)) {
      if (!status) setStatus(entry.status);
      if (!selectedItem) { const item = findItem(entry.orb); if (item) setSelectedItem(item); }
    } else {
      if (status === entry.status) setStatus(null);
      if (selectedItem?.name === entry.orb) setSelectedItem(null);
    }
  }, [activeModifiers, tracedAbility, poaPickedAbility]);
  // Auto-set ONLY the orb (not status) for Poison Heal on ability select — status is manual
  useEffect(() => {
    if (!allItems.length || selectedItem) return;
    const ab = _normAb(selectedAbility);
    if (ab === 'poisonheal') {
      const item = allItems.find(it => it.name === 'Toxic Orb');
      if (item) setSelectedItem(item);
    }
  }, [selectedAbility, allItems]);
  const [currentHp, setCurrentHp] = useState(null);
  const [hpPctStr, setHpPctStr] = useState(null);
  const [moveSearchOpen, setMoveSearchOpen] = useState(null);
  const [moveDropdownDir, setMoveDropdownDir] = useState('down');
  const moveDropdownRef = useRef(null);

  // Keep move dropdown in sync with its slot on scroll/resize — DOM-direct to avoid teleport
  useEffect(() => {
    if (moveSearchOpen === null) return;
    const update = () => {
      const slotEl = moveWrapperRefs.current[moveSearchOpen];
      const dropEl = moveDropdownRef.current;
      if (!slotEl || !dropEl) return;
      const rect = slotEl.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const dropH = dropEl.offsetHeight || 228;
      if (spaceBelow < dropH + 8) {
        dropEl.style.top = 'auto';
        dropEl.style.bottom = (window.innerHeight - rect.top + 4) + 'px';
      } else {
        dropEl.style.top = (rect.bottom + 4) + 'px';
        dropEl.style.bottom = 'auto';
      }
      dropEl.style.left = rect.left + 'px';
    };
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [moveSearchOpen]);
  const [moveSearchTerms, setMoveSearchTerms] = useState(['', '', '', '']); // raw string for pct input while typing

  useImperativeHandle(ref, () => ({
    validateAbility: () => {
      if (!selectedPokemon) return true;
      const abilities = getAbilityText(selectedPokemon.abilities);
      const needsAbility = abilities.length > 1 && !selectedAbility;
      if (needsAbility) {
        onAbilityError?.(`Select an ability for ${selectedPokemon.name}`);
        setShakeAbility(true);
        return false;
      }
      return true;
    },
    getFullState: () => {
      const imposterActive = (_normAb(selectedAbility) === 'imposter' && activeModifiers.has('imposter') || activeModifiers.has('transformpill')) && opponentFullState;
      const copyStats = imposterActive || (activeModifiers.has('copystatchanges') && opponentFullState);
      if (imposterActive) {
        return {
          evs:  { hp: userEvs.hp, atk: opponentFullState.evs?.atk??0, def: opponentFullState.evs?.def??0, spa: opponentFullState.evs?.spa??0, spd: opponentFullState.evs?.spd??0, spe: opponentFullState.evs?.spe??0 },
          ivs:  { hp: userIvs.hp, atk: opponentFullState.ivs?.atk??31, def: opponentFullState.ivs?.def??31, spa: opponentFullState.ivs?.spa??31, spd: opponentFullState.ivs?.spd??31, spe: opponentFullState.ivs?.spe??31 },
          stages: { ...(copyStats ? (opponentFullState.stages ?? {}) : (imposterActive ? (opponentFullState.stages ?? {}) : statStages)) },
          ability: opponentFullState.ability,
          nature: opponentFullState.nature ?? 'Hardy',
          shiny: isShiny,
          item: selectedItem,
          status,
          currentHp,
          hpPctStr,
          moves: [...(opponentFullState.moves ?? [null,null,null,null])],
          crits: [...critMoves],
        };
      }
      return {
        evs: { ...userEvs },
        ivs: { ...userIvs },
        stages: { ...statStages },
        ability: selectedAbility,
        nature: selectedNature,
        shiny: isShiny,
        item: selectedItem,
        status,
        currentHp,
        hpPctStr,
        moves: [...selectedMoves],
        crits: [...critMoves],
      };
    },
    loadShowdownSet: (text) => {
      const parsed = parseShowdownSet(text);
      if (!parsed) return { success: false, error: 'Could not parse set' };

      const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');

      const found = allPokemon.find(p =>
        norm(p.name) === norm(parsed.pokeName) ||
        p.id === norm(parsed.pokeName)
      );
      if (!found) return { success: false, error: `Pokémon "${parsed.pokeName}" not found` };

      // Flag BEFORE onSelect so the shiny useEffect skips reset
      if (parsed.shiny) fromPasteRef.current = true;

      onSelect(found);
      setUserEvs(parsed.evs);
      const pRaw = {};
      const pNature = (parsed.nature && NATURES[parsed.nature]) ? parsed.nature : null;
      const pBoost = pNature ? NATURES[pNature].boost : null;
      const pDrop  = pNature ? NATURES[pNature].drop  : null;
      for (const k of ['hp','atk','def','spa','spd','spe']) {
        const n = parsed.evs[k];
        const base = n > 0 ? String(n) : '';
        pRaw[k] = base + (pBoost === k ? '+' : pDrop === k ? '-' : '');
      }
      setEvRaw(pRaw);
      setUserIvs(parsed.ivs);
      if (parsed.nature && NATURES[parsed.nature]) setSelectedNature(parsed.nature);
      if (parsed.shiny) setIsShiny(true);

      // Defer item/moves/ability one tick so they apply AFTER any
      // selectedPokemon-change effects have settled
      setTimeout(() => {
        // Ability — value IS the ability name in getAbilityText
        const abilities = getAbilityText(found.abilities);
        if (abilities.length === 1) {
          setSelectedAbility(abilities[0].value);
        } else if (parsed.ability) {
          const match = abilities.find(a => norm(a.value) === norm(parsed.ability));
          if (match) setSelectedAbility(match.value);
        }

        // Item
        setSelectedItem(null);
        if (parsed.itemName && allItems.length) {
          const item = allItems.find(it => norm(it.name) === norm(parsed.itemName));
          if (item) setSelectedItem(item);
        }

        // Moves
        setSelectedMoves([null, null, null, null]);
        if (parsed.moves.length && allMoves.length) {
          const resolved = parsed.moves.slice(0, 4).map(name =>
            allMoves.find(m => norm(m.name) === norm(name)) ?? null
          );
          while (resolved.length < 4) resolved.push(null);
          setSelectedMoves(resolved);
        }

        setStatus(null);
        setCurrentHp(null);
        setHpPctStr(null);
      }, 0);

      return { success: true, pokemon: found };
    },
    setFullState: (s) => {
      setUserEvs(s.evs);
      // Rebuild raw display strings from numeric evs — no suffix since we don't know it
      const raw = {};
      for (const k of ['hp','atk','def','spa','spd','spe']) raw[k] = s.evs[k] > 0 ? String(s.evs[k]) : '';
      setEvRaw(raw);
      setUserIvs(s.ivs);
      setStatStages(s.stages);
      entryPillDefsRef.current = [];
      setSelectedAbility(s.ability);
      setSelectedNature(s.nature);
      setIsShiny(s.shiny);
      setSelectedItem(s.item);
      setStatus(s.status);
      setCurrentHp(s.currentHp);
      setHpPctStr(s.hpPctStr);
      setSelectedMoves(s.moves);
      setCritMoves(s.crits);
    },
    // Called from App.jsx when transitioning step 1→2.
    // Accepts array of { role, stat, delta, label, reaction } interactions.
    // 'own' role pills directly set base statStages.
    // 'attacker'/'blocker'/'reactor' pills only toggle modifiers — computeEffectiveStages handles stage math.
    applyEntryEffects: (interactions) => {
      const freshStages = { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
      downloadBoostRef.current = null;
      const pillDefs = [];
      const toEnable = new Set();
      let newTracedAbility = null;

      for (let i = 0; i < interactions.length; i++) {
        const { role, stat, delta, label, reaction, autoEnable, id: rawId,
                copiedAbility, itemName, thenEnable } = interactions[i];

        // role: 'autoEnable' — just enable an ability id, no pill
        if (role === 'autoEnable') {
          toEnable.add(rawId);
          continue;
        }

        // role: 'setItem' — auto-set item and optionally enable a modifier
        if (role === 'setItem') {
          if (!selectedItem && allItems.length) {
            const item = allItems.find(it => it.name === itemName);
            if (item) setSelectedItem(item);
          }
          if (thenEnable) toEnable.add(thenEnable);
          continue;
        }

        const id = `entry-${i}-${role}-${label.replace(/[^a-z]/gi, '')}`;

        // role: 'trace' — copies opp ability (auto-on), effects already merged by App.jsx
        // role: 'receiver' / 'powerofalchemy' — user picks ability (off by default)
        if (role === 'trace' || role === 'receiver' || role === 'powerofalchemy') {
          pillDefs.push({ id, label, role, stat: null, delta: 0, reaction: null, copiedAbility: copiedAbility ?? null });
          if (autoEnable !== false) {
            toEnable.add(id);
            if (copiedAbility) newTracedAbility = copiedAbility;
          }
          continue;
        }

        pillDefs.push({ id, label, role, stat: stat ?? null, delta: delta ?? 0, reaction: reaction ?? null });

        if (autoEnable !== false) toEnable.add(id);

        if (role === 'own' && stat && delta !== 0 && autoEnable !== false) {
          freshStages[stat] = Math.max(-6, Math.min(6, freshStages[stat] + delta));
          if (label === 'Download') downloadBoostRef.current = stat;
        }
      }

      entryPillDefsRef.current = pillDefs;
      setStatStages(freshStages);
      setTracedAbility(newTracedAbility);
      setActiveModifiers(prev => {
        const n = new Set(prev);
        toEnable.forEach(id => n.add(id));
        return n;
      });
    },
  }));

  const statStageMultiplier = (stage) => {
    const multipliers = {
      6: 4.0,
      5: 3.5,
      4: 3.0,
      3: 2.5,
      2: 2.0,
      1: 1.5,
      0: 1.0,
      '-1': 2/3,
      '-2': 0.5,
      '-3': 0.4,
      '-4': 1/3,
      '-5': 2/7,
      '-6': 0.25
    };
    return multipliers[stage] || 1.0;
  };

  const getNatureMultiplier = (nature, stat) => {
    if (!nature || !NATURES[nature]) return 1.0;
    const { boost, drop } = NATURES[nature];
    if (stat === boost) return 1.1;
    if (stat === drop) return 0.9;
    return 1.0;
  };

  useEffect(() => {
    try {
      const pokemonList = [];
      const gens = new Generations(Dex);
      const gen9 = gens.get(9);
      
      Array.from(gen9.species).forEach(species => {
        if (species && species.name && species.baseStats) {
          pokemonList.push({
            id: species.id,
            name: species.name,
            baseStats: species.baseStats,
            types: species.types || [],
            abilities: species.abilities || {},
            num: species.num,
            forme: species.forme || null,
            baseSpecies: species.baseSpecies || null,
            weight: species.weightkg || 0,
          });
        }
      });
      
      pokemonList.sort((a, b) => a.name.localeCompare(b.name));
      setAllPokemon(pokemonList);
    } catch (e) {
      console.error('Error loading Pokemon:', e);
    }
  }, []);

  // Preload items
  useEffect(() => {
    try {
      const gens = new Generations(Dex);
      const gen9 = gens.get(9);
      const itemList = [];
      Array.from(gen9.items).forEach(item => {
        if (item && item.name && item.name !== '(no item)') {
          itemList.push({
            id: item.id,
            name: item.name,
            num: item.num,
          });
        }
      });
      itemList.sort((a, b) => a.name.localeCompare(b.name));
      setAllItems(itemList);
    } catch (e) {
      console.error('Error loading items:', e);
    }
  }, []);

  // Build allAbilities from allPokemon data (already loaded, no extra fetch needed)
  useEffect(() => {
    if (!allPokemon.length) return;
    const NON_COPY_IDS = new Set([
      'receiver','powerofalchemy','trace','forecast','flowergift','multitype',
      'illusion','wonderguard','zenmode','imposter','stancechange','powerconstruct',
      'schooling','comatose','shieldsdown','disguise','rkssystem','battlebond',
      'wanderingspirit','gulpmissile','iceface','hungerswitch','asoneas','asonegrimm',
      'zerohero','commander','protosynthesis','quarkdrive',
    ]);
    const seen = new Set();
    const list = [];
    for (const p of allPokemon) {
      for (const val of Object.values(p.abilities ?? {})) {
        if (typeof val === 'string' && val) {
          const id = val.toLowerCase().replace(/[^a-z0-9]/g,'');
          if (!NON_COPY_IDS.has(id) && !seen.has(val)) {
            seen.add(val);
            list.push(val);
          }
        }
      }
    }
    list.sort((a, b) => a.localeCompare(b));
    setAllAbilities(list);
  }, [allPokemon]);
  useEffect(() => {
    try {
      const gens = new Generations(Dex);
      const gen9 = gens.get(9);
      const moveList = [];
      Array.from(gen9.moves).forEach(move => {
        if (move && move.name && move.category !== 'Status' || move?.category === 'Status') {
          moveList.push({
            id: move.id,
            name: move.name,
            type: move.type,
            category: move.category, // 'Physical' | 'Special' | 'Status'
            basePower: move.basePower || 0,
            accuracy: move.accuracy,
            shortDesc: move.shortDesc || move.desc || '',
          });
        }
      });
      moveList.sort((a, b) => a.name.localeCompare(b.name));
      setAllMoves(moveList);
    } catch (e) {
      console.error('Error loading moves:', e);
    }
  }, []);

  const getAbilityText = (abilities) => {
    if (!abilities) return [];
    
    const result = [];
    
    try {
      const abilityEntries = [];
      
      for (const [key, value] of Object.entries(abilities)) {
        if (key === 'toString' || !value || typeof value !== 'string') {
          continue;
        }
        abilityEntries.push({ key, value });
      }
      
      abilityEntries.sort((a, b) => {
        const aIsH = a.key === 'H';
        const bIsH = b.key === 'H';
        
        if (aIsH && !bIsH) return 1;
        if (!aIsH && bIsH) return -1;
        if (aIsH && bIsH) return 0;
        
        return parseInt(a.key) - parseInt(b.key);
      });
      
      abilityEntries.forEach(({ key, value }) => {
        result.push({
          key: key === 'H' ? 'H' : 'normal',
          value: value
        });
      });
    } catch (e) {
      console.error('Error parsing abilities:', e);
    }
    
    return result;
  };

  const getAbilityDesc = (abilityName) => {
    try {
      const ability = Dex.abilities.get(abilityName);
      return ability?.shortDesc || ability?.desc || null;
    } catch (e) {
      return null;
    }
  };

  const toPokeApiSlug = (name) =>
    name.toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-');

  const BASE_URL = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork';

  // Close dropdowns when step changes
  useEffect(() => {
    setOpenStageDropdown(null);
    setMoveSearchOpen(null);
  }, [step]);

  // Resolve learnable moves using Dex.learnsets (any-gen history, filtered to gen9 allMoves)
  useEffect(() => {
    if (!selectedPokemon || allMoves.length === 0) { setLearnableMoves([]); return; }
    let cancelled = false;

    const resolveLearnset = async () => {
      // getAllLearnableIds always returns a Set (never null) after the fix above
      const ids = await getAllLearnableIds(selectedPokemon.id);

      // Also merge base species learnset for alternate forms (e.g. Ogerpon-Cornerstone)
      if (selectedPokemon.baseSpecies && selectedPokemon.baseSpecies !== selectedPokemon.name) {
        const baseIds = await getAllLearnableIds(
          selectedPokemon.baseSpecies.toLowerCase().replace(/[^a-z0-9]/g, '')
        );
        baseIds.forEach(id => ids.add(id));
      }

      if (cancelled) return;

      // Only fall back to allMoves if we truly couldn't find any learnset data at all
      setLearnableMoves(ids.size > 0 ? allMoves.filter(m => ids.has(m.id)) : allMoves);
    };

    resolveLearnset();
    return () => { cancelled = true; };
  }, [selectedPokemon?.id, allMoves]);

  // Click-outside closes move dropdowns
  // Must also exclude the portal dropdown div — it lives in document.body,
  // outside the slot's DOM subtree, so without this check every click on a
  // result would be treated as an outside-click and race with the selection.
  useEffect(() => {
    const handler = (e) => {
      const slotEl = moveWrapperRefs.current[moveSearchOpen];
      const dropEl = moveDropdownRef.current;
      if (
        slotEl && !slotEl.contains(e.target) &&
        dropEl && !dropEl.contains(e.target)
      ) {
        setMoveSearchOpen(null);
      }
    };
    if (moveSearchOpen !== null) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [moveSearchOpen]);

  // Click-outside closes item dropdown
  useEffect(() => {
    const handler = (e) => {
      if (itemWrapperRef.current && !itemWrapperRef.current.contains(e.target)) {
        setItemSearchOpen(false);
      setMoveSearchOpen(null);
      }
    };
    if (itemSearchOpen) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [itemSearchOpen]);

  // Reset shiny when the selected pokemon changes (skip if loading from paste)
  useEffect(() => {
    if (fromPasteRef.current) { fromPasteRef.current = false; return; }
    setIsShiny(false);
  }, [selectedPokemon?.id]);

  useEffect(() => {
    if (!selectedPokemon) { setResolvedImageUrl(null); return; }

    const isForm = !!selectedPokemon.forme;
    const cacheKey = `${selectedPokemon.id}-${isShiny ? 'shiny' : 'normal'}`;

    if (imageCache.current[cacheKey]) {
      setResolvedImageUrl(imageCache.current[cacheKey]);
      return;
    }

    if (!isForm) {
      const url = isShiny
        ? `${BASE_URL}/shiny/${selectedPokemon.num}.png`
        : `${BASE_URL}/${selectedPokemon.num}.png`;
      imageCache.current[cacheKey] = url;
      setResolvedImageUrl(url);
      return;
    }

    // Alternate form — convert name to PokeAPI slug (e.g. "Goodra-Hisui" → "goodra-hisui")
    const slug = toPokeApiSlug(selectedPokemon.name);
    fetch(`https://pokeapi.co/api/v2/pokemon/${slug}/`)
      .then(r => { if (!r.ok) throw new Error('not found'); return r.json(); })
      .then(data => {
        // data.id is the correct numeric ID (e.g. 10230 for Goodra-Hisui)
        const url = isShiny
          ? `${BASE_URL}/shiny/${data.id}.png`
          : `${BASE_URL}/${data.id}.png`;
        imageCache.current[cacheKey] = url;
        setResolvedImageUrl(url);
      })
      .catch(() => {
        // Fallback to base species num
        const fallback = isShiny
          ? `${BASE_URL}/shiny/${selectedPokemon.num}.png`
          : `${BASE_URL}/${selectedPokemon.num}.png`;
        setResolvedImageUrl(fallback);
      });
  }, [selectedPokemon, isShiny]);

  // Resolve opponent's sprite URL for transformed display (handles alternate forms)
  useEffect(() => {
    if (!opponentPokemon) { setOpponentResolvedUrl(null); return; }
    const BASE_URL = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork';
    if (!opponentPokemon.forme) {
      setOpponentResolvedUrl(`${BASE_URL}/${opponentPokemon.num}.png`);
      return;
    }
    const slug = opponentPokemon.name.toLowerCase().replace(/[^a-z0-9 -]/g, '').replace(/ +/g, '-');
    fetch(`https://pokeapi.co/api/v2/pokemon/${slug}/`)
      .then(r => r.ok ? r.json() : null)
      .then(data => setOpponentResolvedUrl(data ? `${BASE_URL}/${data.id}.png` : `${BASE_URL}/${opponentPokemon.num}.png`))
      .catch(() => setOpponentResolvedUrl(`${BASE_URL}/${opponentPokemon.num}.png`));
  }, [opponentPokemon?.id]);

  const calculateStats = (pokemon, evs, ivs, stages, nature) => {
    if (!pokemon || !pokemon.baseStats) return null;

    try {
      const baseStats = pokemon.baseStats;
      const lvl = level ?? 100;
      
      const iv = (stat) => typeof ivs[stat] === 'number' ? ivs[stat] : 31;
      const hp = Math.floor(((2 * baseStats.hp + iv('hp') + Math.floor(evs.hp / 4)) * lvl / 100) + lvl + 10);
      
      const atkBase = Math.floor(Math.floor((2 * baseStats.atk + iv('atk') + Math.floor(evs.atk / 4)) * lvl / 100) + 5);
      const defBase = Math.floor(Math.floor((2 * baseStats.def + iv('def') + Math.floor(evs.def / 4)) * lvl / 100) + 5);
      const spaBase = Math.floor(Math.floor((2 * baseStats.spa + iv('spa') + Math.floor(evs.spa / 4)) * lvl / 100) + 5);
      const spdBase = Math.floor(Math.floor((2 * baseStats.spd + iv('spd') + Math.floor(evs.spd / 4)) * lvl / 100) + 5);
      const speBase = Math.floor(Math.floor((2 * baseStats.spe + iv('spe') + Math.floor(evs.spe / 4)) * lvl / 100) + 5);

      const atkNatured = Math.floor(atkBase * getNatureMultiplier(nature, 'atk'));
      const defNatured = Math.floor(defBase * getNatureMultiplier(nature, 'def'));
      const spaNatured = Math.floor(spaBase * getNatureMultiplier(nature, 'spa'));
      const spdNatured = Math.floor(spdBase * getNatureMultiplier(nature, 'spd'));
      const speNatured = Math.floor(speBase * getNatureMultiplier(nature, 'spe'));
      
      const atk = Math.floor(atkNatured * statStageMultiplier(stages.atk));
      const def = Math.floor(defNatured * statStageMultiplier(stages.def));
      const spa = Math.floor(spaNatured * statStageMultiplier(stages.spa));
      const spd = Math.floor(spdNatured * statStageMultiplier(stages.spd));
      const spe = Math.floor(speNatured * statStageMultiplier(stages.spe));
      
      return { hp, atk, def, spa, spd, spe };
    } catch (e) {
      console.error('Error calculating stats:', e);
      return null;
    }
  };

  useEffect(() => {
    if (selectedPokemon && collapsed) {
      const effAbility = tracedAbility ?? poaPickedAbility ?? selectedAbility;
      const isTransf = collapsed && ((_normAb(selectedAbility) === 'imposter' && activeModifiers.has('imposter')) || activeModifiers.has('transformpill'));
      const calcPoke   = isTransf && opponentPokemon  ? opponentPokemon  : selectedPokemon;
      const calcEvs    = isTransf && opponentFullState ? { ...opponentFullState.evs,  hp: userEvs.hp  } : userEvs;
      const calcIvs    = isTransf && opponentFullState ? { ...opponentFullState.ivs,  hp: userIvs.hp  } : userIvs;
      const calcNature = isTransf && opponentFullState ? (opponentFullState.nature ?? 'Hardy') : selectedNature;
      const copyStages = isTransf && activeModifiers.has('copystatchanges') && opponentFullState ? (opponentFullState.stages ?? {}) : statStages;
      const effStages  = computeEffectiveStages(copyStages, opponentInfo, entryPillDefsRef.current, activeModifiers, stackCounts, calcPoke?.baseStats, effAbility);
      // HP always uses own pokemon's base stats + own HP EVs/IVs — never copied
      const hpStats    = calculateStats(selectedPokemon, userEvs, userIvs, effStages, selectedNature);
      const mainStats  = calculateStats(calcPoke, calcEvs, calcIvs, effStages, calcNature);
      if (mainStats && hpStats) setCalculatedStats({ ...mainStats, hp: hpStats.hp });
      else if (mainStats) setCalculatedStats(mainStats);
    }
  }, [selectedPokemon, userEvs, userIvs, statStages, collapsed, selectedNature, level, opponentInfo?.intimidateActive, activeModifiers, stackCounts, opponentPokemon, opponentFullState]);

  // Notify parent of current stats (for opponent BP calculations + Download + Intimidate)
  useEffect(() => {
    if (calculatedStats && selectedPokemon) {
      const intimidatePill = entryPillDefsRef.current.find(p => p.role === 'attacker' && p.label === 'Intimidate');
      const intimidateActive = intimidatePill ? activeModifiers.has(intimidatePill.id) : false;
      const moldBreakerPill = entryPillDefsRef.current.find(p => p.role === 'moldbreaker');
      const hasMoldBreaker = moldBreakerPill ? activeModifiers.has(moldBreakerPill.id) : false;
      const neutralGasPill = entryPillDefsRef.current.find(p => p.role === 'neutralizinggas');
      const neutralizingGas = neutralGasPill ? activeModifiers.has(neutralGasPill.id) : false;
      onStateChange?.({
        weight: selectedPokemon.weight || 0,
        spe: calculatedStats.spe,
        def: calculatedStats.def,
        spd: calculatedStats.spd,
        currentHp: currentHp ?? calculatedStats.hp,
        maxHp: calculatedStats.hp,
        intimidateActive,
        moldBreaker: hasMoldBreaker,
        neutralizingGas,
      });
    }
  }, [calculatedStats, currentHp, selectedPokemon, activeModifiers]);

  // Download: re-evaluate which stat gets boosted in real time as opp EVs/IVs/nature change
  useEffect(() => {
    if (!collapsed) return;
    const ab = (selectedAbility ?? '').toLowerCase().replace(/[^a-z]/g, '');
    if (ab !== 'download') return;
    if (opponentInfo?.def === undefined && opponentInfo?.spd === undefined) return;

    const oppDef = opponentInfo?.def ?? 0;
    const oppSpd = opponentInfo?.spd ?? 0;
    const newStat = oppSpd < oppDef ? 'spa' : 'atk';
    const prevStat = downloadBoostRef.current;

    if (newStat === prevStat) return; // unchanged

    downloadBoostRef.current = newStat;

    setStatStages(prev => {
      const next = { ...prev };
      if (prevStat) next[prevStat] = Math.max(-6, next[prevStat] - 1);
      next[newStat] = Math.min(6, next[newStat] + 1);
      return next;
    });
    // Update the Download entry pill def's stat
    entryPillDefsRef.current = entryPillDefsRef.current.map(p =>
      p.label === 'Download' ? { ...p, stat: newStat } : p
    );
  }, [opponentInfo?.def, opponentInfo?.spd, selectedAbility, collapsed]);

  useEffect(() => {
    if (evError) {
      const timer = setTimeout(() => setEvError(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [evError]);

  useEffect(() => {
    if (shakeAbility) {
      const timer = setTimeout(() => setShakeAbility(false), 500);
      return () => clearTimeout(timer);
    }
  }, [shakeAbility]);

  const getTotalEvs = () => {
    return Object.values(userEvs).reduce((a, b) => a + b, 0);
  };

  // Update dropdown position whenever search opens or window resizes
  useLayoutEffect(() => {
    if (!searchOpen || !searchInputRef.current) return;
    const update = () => {
      const r = searchInputRef.current.getBoundingClientRect();
      setDropdownPos({
        top:   r.bottom + window.scrollY,
        left:  r.left   + window.scrollX,
        width: r.width,
      });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [searchOpen]);

  const filteredPokemon = searchTerm 
    ? allPokemon.filter(p => p.name.toLowerCase().startsWith(searchTerm.toLowerCase()))
    : [];

  const handleSelectPokemon = (pokemon) => {
    onSelect(pokemon);
    setSearchTerm('');
    setSearchOpen(false);
    setUserEvs({ hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 });
    setEvRaw({ hp: '', atk: '', def: '', spa: '', spd: '', spe: '' });
    setUserIvs({ hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 });
    setStatStages({ atk: 0, def: 0, spa: 0, spd: 0, spe: 0 });
    downloadBoostRef.current = null;
    entryPillDefsRef.current = [];
    setActiveModifiers(new Set());
    setStackCounts({ speedboost: 0, moxie: 0, grimneigh: 0, chillingneigh: 0, beastboost: 0, asone: 0, stamina: 0, berserk: 0, strengthsap: 0, justified: 0, rattled: 0, thermalexchange: 0, sapsipper: 0, motordrive: 0, lightningrod: 0, stormdrain: 0, steamengine: 0, watercompaction: 0, weakarmor: 0, angershell: 0 });
    setTracedAbility(null);
    setIsShiny(false);
    setSelectedItem(null);
    setItemSearch('');
    setStatus(null);
    setCurrentHp(null);
    setHpPctStr(null);
    setSelectedMoves([null, null, null, null]);
    setCritMoves([false, false, false, false]);
    setMoveSearchOpen(null);
    setMoveSearchTerms(['', '', '', '']);
    
    const abilities = getAbilityText(pokemon.abilities);
    if (abilities.length === 1) {
      setSelectedAbility(abilities[0].value);
    } else {
      setSelectedAbility(null);
    }
    setSelectedNature('Hardy');
  };

  const handleClearPokemon = () => {
    onSelect(null);
    setSelectedAbility(null);
    setCalculatedStats(null);
    setSelectedNature('Hardy');
    setActiveModifiers(new Set());
    setIsShiny(false);
    setSelectedItem(null);
    setItemSearch('');
    setStatus(null);
    setCurrentHp(null);
    setHpPctStr(null);
    setSelectedMoves([null, null, null, null]);
    setCritMoves([false, false, false, false]);
    setMoveSearchOpen(null);
    setMoveSearchTerms(['', '', '', '']);
  };

  const handleEvChange = (stat, value) => {
    // Allow only digits, one +, one - (max 4 chars total)
    let cleaned = value.replace(/[^0-9+\-]/g, '').slice(0, 4);

    // Reject if more than one + or more than one -
    if ((cleaned.match(/\+/g) || []).length > 1) return;
    if ((cleaned.match(/-/g) || []).length > 1) return;

    // Parse numeric part and detect suffix
    const numStr        = cleaned.replace(/[+\-]/g, '');
    const hasPlusSuffix  = cleaned.includes('+');
    const hasMinusSuffix = cleaned.includes('-');

    // Nature resolution — runs even when numStr is empty (e.g. user typed "+" or "-" only)
    const checkNature = (rawMap) => {
      const plusStat  = hasPlusSuffix  ? stat
        : Object.keys(rawMap).find(k => k !== stat && rawMap[k].includes('+')) ?? null;
      const minusStat = hasMinusSuffix ? stat
        : Object.keys(rawMap).find(k => k !== stat && rawMap[k].includes('-')) ?? null;
      if (plusStat && minusStat && plusStat !== minusStat) {
        const match = Object.entries(NATURES).find(([, n]) => n.boost === plusStat && n.drop === minusStat);
        if (match) setSelectedNature(match[0]);
      }
    };

    if (cleaned === '' || numStr === '') {
      const newRaw = { ...evRaw, [stat]: cleaned };
      checkNature(newRaw);
      setEvRaw(newRaw);
      setUserEvs({ ...userEvs, [stat]: 0 });
      setEvError(null);
      setShakeField(null);
      return;
    }

    let numValue = parseInt(numStr, 10) || 0;
    if (numValue < 0) numValue = 0;

    const currentStat = userEvs[stat];
    const otherEvs = getTotalEvs() - currentStat;
    const remainingEvs = 510 - otherEvs;
    numValue = Math.min(numValue, 252, remainingEvs);

    // Build the new raw values — use the CLAMPED number so display matches reality
    const suffix = hasPlusSuffix ? '+' : hasMinusSuffix ? '-' : '';
    const clampedRaw = numValue > 0 ? String(numValue) + suffix : suffix || '';
    const newRaw = { ...evRaw, [stat]: clampedRaw };

    checkNature(newRaw);
    setEvRaw(newRaw);
    setUserEvs({ ...userEvs, [stat]: numValue });
    setEvError(null);
    setShakeField(null);
  };

  const handleIvChange = (stat, value) => {
    if (value === '' || value === undefined) {
      setUserIvs({...userIvs, [stat]: ''});
      return;
    }
    const parsed = parseInt(value);
    if (isNaN(parsed)) return;
    let numValue = parsed;
    if (numValue > 31) numValue = 31;
    if (numValue < 0) numValue = 0;
    setUserIvs({...userIvs, [stat]: numValue});
  };

  const handleStageChange = (stat, value) => {
    setStatStages({...statStages, [stat]: value});
  };

  const handleAbilityClick = (ability) => {
    const abilities = getAbilityText(selectedPokemon.abilities);
    const isSingleAbility = abilities.length === 1;
    
    if (step >= 2) {
      return;
    }

    if (step === 1 && isSingleAbility) {
      return;
    }

    setSelectedAbility(selectedAbility === ability ? null : ability);
  };

  const StatBar = ({ stat, value }) => {
    const maxBase = 150;
    const percentage = (value / maxBase) * 100;
    
    return (
      <div className="stat-bar">
        <div 
          className="stat-fill" 
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>
    );
  };

  const statNames = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
  const statLabels = ['HP', 'Atk', 'Def', 'SpA', 'SpD', 'Spe'];

  return (
    <LiquidGlass
      className={`pokemon-selector ${collapsed ? 'collapsed' : ''}`}
      borderRadius={20}
      bezelWidth={26}
      scale={75}
      blur={18}
      saturation={1.7}
      brightness={0.96}
      background="rgba(12, 12, 16, 0.28)"
      style={{ marginBottom: 20, display: 'flex', flexDirection: 'column', height: collapsed ? '100%' : 'auto', boxSizing: 'border-box', overflow: 'visible' }}
    >
      {evError && (
        <div className="ev-error-notification">
          {evError}
        </div>
      )}
      
      {selectedPokemon ? (
        <LiquidGlass
          className={`selected-pokemon ${collapsed ? 'collapsed' : ''} ${shakeAbility ? 'shake' : ''}`}
          borderRadius={14}
          bezelWidth={22}
          scale={65}
          blur={40}
          saturation={2.1}
          brightness={0.93}
          background="rgba(8, 8, 12, 0.62)"
          style={{ position: 'relative', flex: 1, padding: 20, boxSizing: 'border-box' }}
        >
          {step === 1 && (
            <button 
              className="clear-pokemon-btn"
              onClick={handleClearPokemon}
              title="Change Pokemon"
            >
              ✕
            </button>
          )}

          {step === 3 && (
            <div className="shiny-btn-wrap">
              {/* Small glass circle — sits behind the PNG */}
              <LiquidGlass
                borderRadius={18}
                bezelWidth={12}
                scale={40}
                blur={14}
                saturation={1.5}
                brightness={0.93}
                background="rgba(8,8,12,0.55)"
                style={{ width: 44, height: 44, position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 0 }}
              />
              {/* PNG button — full size, on top, glow shows around it */}
              <button
                className={`shiny-toggle-btn ${isShiny ? 'active' : ''}`}
                onClick={() => setIsShiny(s => !s)}
                title={isShiny ? 'Switch to normal' : 'Switch to shiny'}
                style={{ position: 'relative', zIndex: 1 }}
              >
                <img
                  src={isShiny ? '/shinyBLACK.png' : '/shinyWHITE.png'}
                  alt="shiny"
                  className="shiny-icon"
                />
              </button>
            </div>
          )}

          {(() => {
            const isTransformed = collapsed && (
              (_normAb(selectedAbility) === 'imposter' && activeModifiers.has('imposter')) ||
              activeModifiers.has('transformpill')
            );
            const displayPokemon = isTransformed && opponentPokemon ? opponentPokemon : selectedPokemon;
            const displayImageUrl = isTransformed && opponentPokemon
              ? `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${opponentPokemon.num}.png`
              : resolvedImageUrl;
            return null; // just compute, header below uses these vars
          })()}
          {((_normAb(selectedAbility) === 'imposter' && activeModifiers.has('imposter')) || activeModifiers.has('transformpill')) && collapsed && opponentPokemon ? (
          /* ── Transformed header: shows opponent's pokemon ── */
          <div className={`pokemon-header ${collapsed ? 'collapsed' : ''} ${step === 3 ? 'has-shiny-btn' : ''}`}>
            <div className="pokemon-image-section" style={{ position:'relative' }}>
              <img
                src={opponentResolvedUrl || `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${opponentPokemon.num}.png`}
                alt={opponentPokemon.name}
                className="pokemon-image"
                style={{}}
              />
              {/* Small original ditto icon in corner */}
              <img
                src={resolvedImageUrl}
                alt={selectedPokemon.name}
                style={{ position:'absolute', bottom:2, left:2, width:32, height:32, objectFit:'contain', opacity:0.5, imageRendering:'auto', zIndex:2 }}
              />
              <span style={{ position:'absolute', top:2, right:2, fontSize:10, color:'rgba(255,255,255,0.5)', fontWeight:700, background:'rgba(0,0,0,0.5)', borderRadius:4, padding:'1px 4px', zIndex:2 }}>TRANSFORMED</span>
            </div>
            <div className="pokemon-info-section">
              <div className="pokemon-name-wrapper" ref={nameWrapperRef}>
                <h3 className="pokemon-name" ref={nameTextRef} style={{ opacity:0.85 }}>{opponentPokemon.name}</h3>
              </div>
              <div className="pokemon-types">
                {opponentPokemon.types?.map(type => (
                  <span key={type} className={`type-badge type-${type.toLowerCase()}`}>{type}</span>
                ))}
              </div>
              <div className="pokemon-abilities">
                <button className="ability-badge selected locked-step2" style={{ cursor:'not-allowed' }}>
                  {opponentFullState?.ability ?? '—'}
                </button>
              </div>
            </div>
            {/* Nature — read-only, locked to opponent's nature */}
            {step === 2 && (() => {
              const oppNature = opponentFullState?.nature ?? 'Hardy';
              return (
              <div className="pokemon-nature-section">
                <span className="nature-label">Nature</span>
                <div className="nature-dropdown-wrap">
                  <LiquidGlass
                    borderRadius={10} bezelWidth={14} scale={40} blur={18}
                    saturation={1.6} brightness={0.94}
                    background="rgba(255,255,255,0.07)"
                    style={{ display: 'block', cursor: 'not-allowed', opacity: 0.7 }}
                  >
                    <div className="nature-select-display">
                      <span>{oppNature}</span>
                      <span className="nature-select-arrow">🔒</span>
                    </div>
                  </LiquidGlass>
                </div>
                {NATURES[oppNature]?.boost && (
                  <div className="nature-effects">
                    <span className="nature-boost">+{NATURES[oppNature].boost.toUpperCase()}</span>
                    <span className="nature-drop">−{NATURES[oppNature].drop.toUpperCase()}</span>
                  </div>
                )}
              </div>
              );
            })()}
          </div>
          ) : (
          <div className={`pokemon-header ${collapsed ? 'collapsed' : ''} ${step === 3 ? 'has-shiny-btn' : ''}`}>
            <div className="pokemon-image-section">
              <img 
                src={resolvedImageUrl} 
                alt={selectedPokemon.name}
                className="pokemon-image"
              />
              {step >= 3 && selectedItem && (
                <img
                  src={getItemSpriteUrl(selectedItem)}
                  alt={selectedItem.name}
                  className="item-overlay-icon"
                  onError={e => { e.target.style.display = 'none'; }}
                />
              )}
            </div>
            
            <div className="pokemon-info-section">
              <div className="pokemon-name-wrapper" ref={nameWrapperRef}>
                <h3 className="pokemon-name" ref={nameTextRef}>{selectedPokemon.name}</h3>
              </div>
              
              <div className="pokemon-types">
                {selectedPokemon.types && selectedPokemon.types.map(type => (
                  <span key={type} className={`type-badge type-${type.toLowerCase()}`}>
                    {type}
                  </span>
                ))}
                {step >= 3 && status && (() => {
                  const s = STATUS_CONDITIONS.find(sc => sc.id === status);
                  return s ? <StatusBadge statusId={s.id} label={s.label} title={s.name} /> : null;
                })()}
              </div>

              <div className="pokemon-abilities">
                {(() => {
                  // Commander in step 2: show Dondozo's abilities as selectable
                  const commanderPill = entryPillDefsRef.current.find(p => p.role === 'commander');
                  const commanderOn   = commanderPill && activeModifiers.has(commanderPill.id);
                  const abSource = (commanderOn && step === 2)
                    ? allPokemon.find(p => p.id === 'dondozo') ?? selectedPokemon
                    : selectedPokemon;
                  const abilityList = getAbilityText(abSource.abilities);
                  // Determine if a copy ability (Trace/Receiver/PoA) is active — show copied name
                  const activeCopyPill = entryPillDefsRef.current.find(
                    p => (p.role === 'trace' || p.role === 'receiver' || p.role === 'powerofalchemy')
                      && activeModifiers.has(p.id)
                  );
                  const copiedName = activeCopyPill?.copiedAbility ?? poaPickedAbility ?? null;
                  return abilityList.map((ability, idx) => {
                    const isSingleAbility = abilityList.length === 1;
                    const isSelected = selectedAbility === ability.value;
                    const isCommanderStep2 = commanderOn && step === 2;
                    if (step >= 2 && !isSelected && !isCommanderStep2) return null;
                    // Display name: if copy is active, show the copied ability name instead
                    const displayName = (isSelected && step >= 2 && copiedName) ? copiedName : ability.value;
                    const copyDesc = activeCopyPill?.role === 'trace' ? 'Traced ability'
                      : activeCopyPill?.role === 'receiver' ? 'Received ability'
                      : activeCopyPill?.role === 'powerofalchemy' ? 'Copied via Power of Alchemy' : null;
                    return (
                      <div key={`${ability.value}-${idx}`} className="ability-tooltip-wrapper">
                        <button
                          className={`ability-badge ${isSelected ? 'selected' : ''} ${isSingleAbility && step === 1 ? 'locked' : ''} ${step >= 2 && isSelected && !isCommanderStep2 ? 'locked-step2' : ''}`}
                          onClick={() => {
                            if (isCommanderStep2) { setSelectedAbility(ability.value); return; }
                            handleAbilityClick(ability.value);
                          }}
                        >
                          {isSelected && step >= 2 && copiedName ? copiedName : ability.value}
                          {ability.key === 'H' && !(isSelected && step >= 2 && copiedName) && <span className="ability-hidden">(H)</span>}
                          {isSelected && step >= 2 && copiedName && (
                            <span className="ability-hidden" style={{ color: '#60c8f8', marginLeft: 4 }} title={copyDesc ?? 'Copied ability'}>(C)</span>
                          )}
                        </button>
                        {/* Mold Breaker / Neutralizing Gas labels */}
                        {isSelected && opponentInfo?.moldBreaker && (
                          <span style={{ fontSize: 9, color: '#f85050', fontWeight: 700, marginLeft: 4, letterSpacing: '0.04em' }}>(Ignored)</span>
                        )}
                        {isSelected && opponentInfo?.neutralizingGas && (
                          <span style={{ fontSize: 9, color: '#B97FC9', fontWeight: 700, marginLeft: 4, letterSpacing: '0.04em' }}>(Neutralized)</span>
                        )}
                        {getAbilityDesc(ability.value) && (
                          <div className="ability-tooltip">{getAbilityDesc(ability.value)}</div>
                        )}
                      </div>
                    );
                  });
                })()}
              </div>
            </div>

            {/* Moves + Spread column — shown from step 3 onwards */}
            {step === 5 && (
              <div className="collapsed-right-section">
                {/* Moves list — type-colored text */}
                <div className="collapsed-moves">
                  {[0,1,2,3].map(i => {
                    const mv = selectedMoves[i];
                    const TYPE_COLORS = {
                      normal:'#A8A878', fire:'#F08030', water:'#6890F0', electric:'#F8D030',
                      grass:'#78C850', ice:'#98D8D8', fighting:'#C03028', poison:'#A040A0',
                      ground:'#E0C068', flying:'#A890F0', psychic:'#F85888', bug:'#A8B820',
                      rock:'#B8A038', ghost:'#705898', dragon:'#7038F8', dark:'#705848',
                      steel:'#B8B8D0', fairy:'#EE99AC', stellar:'#61D3D3',
                    };
                    const typeColor = mv ? (TYPE_COLORS[mv.type?.toLowerCase()] ?? '#aaa') : null;
                    return (
                      <div key={i} className={`collapsed-move-item ${mv ? '' : 'empty'}`}>
                        <span className="collapsed-move-dot" style={mv ? { color: typeColor } : {}}>•</span>
                        {mv ? (
                          <span className="collapsed-move-name" style={{ color: typeColor }}>{mv.name}</span>
                        ) : (
                          <span className="collapsed-move-empty">—</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}



            {step === 2 && (() => {
              const isTransfNature = (_normAb(selectedAbility) === 'imposter' && activeModifiers.has('imposter')) || activeModifiers.has('transformpill');
              const shownNature = isTransfNature && opponentFullState ? (opponentFullState.nature ?? 'Hardy') : selectedNature;
              return (
              <div className="pokemon-nature-section">
                <span className="nature-label">Nature</span>
                {/* Custom glass nature dropdown — read-only when transformed */}
                <div ref={natureTriggerRef} className="nature-dropdown-wrap" style={{ position: 'relative' }}>
                      <LiquidGlass
                        borderRadius={10} bezelWidth={14} scale={40} blur={18}
                        saturation={1.6} brightness={0.94}
                        background="rgba(255,255,255,0.07)"
                        hoverBackground={isTransfNature ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.11)"}
                        style={{ display: 'block', cursor: isTransfNature ? 'not-allowed' : 'pointer', opacity: isTransfNature ? 0.7 : 1 }}
                        onClick={() => { if (!isTransfNature) setNatureOpen(o => !o); }}
                      >
                        <div className="nature-select-display">
                          <span>{shownNature}</span>
                          <span className="nature-select-arrow">{isTransfNature ? '🔒' : (natureOpen ? '▲' : '▼')}</span>
                        </div>
                      </LiquidGlass>
                      {natureOpen && !isTransfNature && (() => {
                        const rect = natureTriggerRef.current?.getBoundingClientRect() ?? { bottom: 0, top: 0, left: 0, width: 120 };
                        const natOpenUp = window.innerHeight - rect.bottom < 268;
                        return createPortal(
                          <div
                            className="nature-dropdown-list"
                            style={{
                              position: 'fixed',
                              ...(natOpenUp ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
                              left: rect.left,
                              width: Math.max(rect.width, 150),
                              zIndex: 99999,
                              background: 'rgba(10,10,16,0.92)',
                              backdropFilter: 'blur(40px) saturate(200%) brightness(0.96)',
                              WebkitBackdropFilter: 'blur(40px) saturate(200%) brightness(0.96)',
                              border: '1px solid rgba(255,255,255,0.07)',
                              borderTop: '1px solid rgba(255,255,255,0.18)',
                              borderRadius: 14,
                              boxShadow: 'inset 0 0.5px 0 rgba(255,255,255,0.1), 0 16px 40px rgba(0,0,0,0.7)',
                              maxHeight: 260,
                              overflowY: 'auto',
                              scrollbarWidth: 'none',
                            }}
                          >
                            <style>{`.nature-dropdown-list::-webkit-scrollbar { display: none; }`}</style>
                            {Object.keys(NATURES).map(nature => {
                              const { boost, drop } = NATURES[nature];
                              return (
                                <div
                                  key={nature}
                                  className={`nature-option ${shownNature === nature ? 'selected' : ''}`}
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    setSelectedNature(nature);
                                    setNatureOpen(false);
                                    const { boost, drop } = NATURES[nature] ?? {};
                                    const newRaw = {};
                                    for (const k of ['hp','atk','def','spa','spd','spe']) {
                                      const base = (evRaw[k] ?? '').replace(/[+\-]/g, '');
                                      if (boost && k === boost) newRaw[k] = base ? base + '+' : '';
                                      else if (drop && k === drop) newRaw[k] = base ? base + '-' : '';
                                      else newRaw[k] = base;
                                    }
                                    setEvRaw(newRaw);
                                  }}
                                >
                                  <span>{nature}</span>
                                  {boost && (
                                    <span className="nature-option-effects">
                                      <span style={{ color: '#C8E8A0', fontSize: 10 }}>+{boost.toUpperCase()}</span>
                                      <span style={{ color: '#F08080', fontSize: 10 }}>−{drop.toUpperCase()}</span>
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>,
                          document.body
                        );
                      })()}
                </div>
                {NATURES[shownNature]?.boost && (
                  <div className="nature-effects">
                    <span className="nature-boost">+{NATURES[shownNature].boost.toUpperCase()}</span>
                    <span className="nature-drop">−{NATURES[shownNature].drop.toUpperCase()}</span>
                  </div>
                )}
              </div>
              );
            })()}
          </div>
          )} {/* end transformed ternary */}



          {step < 3 && (          <div className={`pokemon-stats ${collapsed ? 'collapsed' : ''}`}>
            <h4>Base Stats</h4>
            {selectedPokemon.baseStats && (
              <>
                {statNames.map((stat, idx) => {
                  // ── Transformed state: use opponent's values for display ──────────────
                  const isTransformedRow = collapsed && ((_normAb(selectedAbility) === 'imposter' && activeModifiers.has('imposter')) || activeModifiers.has('transformpill'));
                  const copyStageChanges = isTransformedRow && activeModifiers.has('copystatchanges');
                  // Which pokemon/evs/ivs/nature to use for stat calculations
                  const displayPoke  = isTransformedRow && opponentPokemon ? opponentPokemon : selectedPokemon;
                  const displayEvs   = isTransformedRow && opponentFullState ? opponentFullState.evs   : userEvs;
                  const displayIvs   = isTransformedRow && opponentFullState ? opponentFullState.ivs   : userIvs;
                  const displayNature= isTransformedRow && opponentFullState ? (opponentFullState.nature ?? 'Hardy') : selectedNature;
                  const displayStages= copyStageChanges && opponentFullState ? (opponentFullState.stages ?? {}) : statStages;

                  // Effective stages including reactive intimidate (shown in stage button)
                  const effStages = collapsed
                    ? computeEffectiveStages(displayStages, opponentInfo, entryPillDefsRef.current, activeModifiers, stackCounts, displayPoke?.baseStats, selectedAbility)
                    : statStages;

                  // Natural stat: EVs + IVs + nature, NO stages (shown in colored box)
                  const naturalStat = collapsed && displayPoke?.baseStats ? (() => {
                    if (stat === 'hp') {
                      // HP always uses OWN base stats and OWN HP EVs/IVs — never copied
                      const hpIv = typeof userIvs.hp === 'number' ? userIvs.hp : 31;
                      const hpEv = userEvs.hp ?? 0;
                      const lvl = level ?? 100;
                      return Math.floor((2 * selectedPokemon.baseStats.hp + hpIv + Math.floor(hpEv / 4)) * lvl / 100 + lvl + 10);
                    }
                    const base = displayPoke.baseStats[stat];
                    const iv = typeof displayIvs[stat] === 'number' ? displayIvs[stat] : 31;
                    const ev = displayEvs[stat] ?? 0;
                    const lvl = level ?? 100;
                    const raw = Math.floor(Math.floor((2 * base + iv + Math.floor(ev / 4)) * lvl / 100) + 5);
                    return Math.floor(raw * getNatureMultiplier(displayNature, stat));
                  })() : null;

                  // Effective box: shows whenever the final stat differs from natural (stages OR multipliers)
                  const MULTIPLIER_IDS = new Set([
                    'guts','quickfeet','marvelscale','flareboost','toxicboost',
                    'protosynthesis','quarkdrive','hadronengine','orichalcumpulse',
                    'hustle','slowstart','hugepower','purepower','gorillatactics',
                    'chlorophyll','swiftswim','sandrush','slushrush','surgesurfer',
                    'solarpower','flowergift','sandforce','unburden',
                    'speedboost','beastboost','stamina',
                  ]);
                  // Use copied ability when Trace/Receiver/PoA pill is active
                  const traceActivePill = entryPillDefsRef.current.find(
                    p => (p.role === 'trace' || p.role === 'receiver' || p.role === 'powerofalchemy') && activeModifiers.has(p.id)
                  );
                  const effectiveAbility = traceActivePill?.copiedAbility ?? tracedAbility ?? poaPickedAbility ?? null;
                  const effAbId = effectiveAbility ? _normAb(effectiveAbility) : null;
                  const hasMultiplier = [...activeModifiers].some(id => MULTIPLIER_IDS.has(id))
                    || Object.values(stackCounts).some(v => v > 0)
                    || (effAbId !== null && MULTIPLIER_IDS.has(effAbId));
                  const effectiveStat = collapsed && calculatedStats && stat !== 'hp' ? (() => {
                    return hasMultiplier
                      ? applyModifiers(stat, calculatedStats[stat], calculatedStats, selectedAbility, activeModifiers, stackCounts, effectiveAbility)
                      : calculatedStats[stat];
                  })() : null;

                  const showEffective = effectiveStat !== null && effectiveStat !== naturalStat;

                  return (
                  <div key={stat} className={`stat-row ${collapsed ? 'input-mode' : ''}`}>
                    <span className="stat-label">{statLabels[idx]}</span>
                    <span className="stat-value">{displayPoke?.baseStats?.[stat] ?? selectedPokemon.baseStats[stat]}</span>
                    
                    {!collapsed && <StatBar stat={stat} value={selectedPokemon.baseStats[stat]} />}
                    
                    {collapsed && (
                      <>
                        <div className={`stat-input-field ${shakeField === stat ? 'shake' : ''}`}>
                          {(() => {
                            const isTransformed = collapsed && ((_normAb(selectedAbility) === 'imposter' && activeModifiers.has('imposter')) || activeModifiers.has('transformpill'));
                            const oppEv = isTransformed && stat !== 'hp' ? (opponentFullState?.evs?.[stat] ?? 0) : null;
                            // Build display string with nature +/- suffix
                            const oppNature = isTransformed ? (opponentFullState?.nature ?? 'Hardy') : null;
                            const oppNatureBoost = oppNature ? NATURES[oppNature]?.boost : null;
                            const oppNatureDrop  = oppNature ? NATURES[oppNature]?.drop  : null;
                            const oppEvDisplay = oppEv !== null
                              ? (String(oppEv) + (oppNatureBoost === stat ? '+' : oppNatureDrop === stat ? '-' : ''))
                              : null;
                            return (
                              <input
                                type="text"
                                inputMode="numeric"
                                value={oppEvDisplay !== null ? oppEvDisplay : (evRaw[stat] ?? '')}
                                onChange={(e) => { if (!isTransformed || stat === 'hp') handleEvChange(stat, e.target.value); }}
                                readOnly={isTransformed && stat !== 'hp'}
                                placeholder="0-252"
                                className="stat-input"
                                maxLength={4}
                                style={isTransformed && stat !== 'hp' ? { opacity: 0.45, cursor: 'not-allowed' } : {}}
                                title={isTransformed && stat !== 'hp' ? 'Copied from opponent (Transformed)' : ''}
                              />
                            );
                          })()}
                        </div>
                        <div className="stat-iv-field">
                          {(() => {
                            const isTransformed = collapsed && ((_normAb(selectedAbility) === 'imposter' && activeModifiers.has('imposter')) || activeModifiers.has('transformpill'));
                            const oppIv = isTransformed && stat !== 'hp' ? (opponentFullState?.ivs?.[stat] ?? 31) : null;
                            return (
                              <input
                                type="text"
                                inputMode="numeric"
                                value={oppIv !== null ? String(oppIv) : userIvs[stat]}
                                onChange={(e) => { if (!isTransformed || stat === 'hp') handleIvChange(stat, e.target.value); }}
                                readOnly={isTransformed && stat !== 'hp'}
                                placeholder="0-31"
                                className="stat-input iv-input"
                                style={isTransformed && stat !== 'hp' ? { opacity: 0.45, cursor: 'not-allowed' } : {}}
                                title={isTransformed && stat !== 'hp' ? 'Copied from opponent (Transformed)' : ''}
                              />
                            );
                          })()}
                        </div>
                        {/* Colored box: EVs + IVs + nature only, no stages */}
                        {naturalStat !== null && (
                          <span className={`calculated-stat stat-${stat}`}>{naturalStat}</span>
                        )}
                        {/* Outlined effective box: natural × stage × modifiers */}
                        {stat !== 'hp' && (
                          <span className={`effective-stat stat-${stat} ${showEffective ? 'has-change' : ''}`}>
                            {showEffective ? effectiveStat : '—'}
                          </span>
                        )}
                        {stat === 'hp' && step === 4 && calculatedStats && (() => {
                          const maxHp = calculatedStats.hp;
                          const hp = currentHp !== null ? currentHp : maxHp;
                          const pct = Math.max(0, Math.min(100, (hp / maxHp) * 100));
                          return (
                            <span className="hp-current-inline">
                              <span className="hp-inline-bar">
                                <span className="hp-inline-fill" style={{ width: `${pct}%` }} />
                              </span>
                              {hp}
                              <span className="hp-current-sep">/</span>
                              {maxHp}
                            </span>
                          );
                        })()}
                        {stat !== 'hp' && (
                          <div className="stat-stage-dropdown">
                            <button
                              className={`stat-stage-button stat-${stat}`}
                              data-stage-btn={stat}
                              onClick={(e) => {
                                if (openStageDropdown === stat) {
                                  setOpenStageDropdown(null);
                                  setStageDropdownRect(null);
                                } else {
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  const spaceBelow = window.innerHeight - rect.bottom;
                                  setDropdownDir(spaceBelow < 260 ? 'up' : 'down');
                                  setStageDropdownRect(rect);
                                  setOpenStageDropdown(stat);
                                }
                              }}
                            >
                              {effStages[stat] > 0 ? '+' : ''}{effStages[stat]}
                            </button>
                            {openStageDropdown === stat && (() => {
                              const r = stageDropdownRect ?? { bottom: 0, left: 0, top: 0, width: 50 };
                              const hex = STAT_COLORS[stat] || '#ffffff';
                              const rr = parseInt(hex.slice(1,3),16);
                              const gg = parseInt(hex.slice(3,5),16);
                              const bb = parseInt(hex.slice(5,7),16);
                              const openUp = dropdownDir === 'up';
                              return createPortal(
                                <div
                                  className="stat-stage-menu"
                                  style={{
                                    position: 'fixed',
                                    left: r.left,
                                    ...(openUp ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }),
                                    '--stat-color': hex,
                                    background: `rgba(${rr},${gg},${bb},0.08)`,
                                    zIndex: 99999,
                                    scrollbarWidth: 'none',
                                  }}
                                >
                                  {[6, 5, 4, 3, 2, 1, 0, -1, -2, -3, -4, -5, -6].map(value => (
                                    <button
                                      key={value}
                                      className={`stage-option ${statStages[stat] === value ? 'selected' : ''}`}
                                      onMouseDown={(e) => {
                                        e.preventDefault();
                                        handleStageChange(stat, value);
                                        setOpenStageDropdown(null);
                                      }}
                                    >
                                      {value > 0 ? '+' : ''}{value}
                                    </button>
                                  ))}
                                </div>,
                                document.body
                              );
                            })()}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                  );
                })}



                {/* Modifier pills — always shown when collapsed */}
                {collapsed && (() => {
                  const traceActivePill2 = entryPillDefsRef.current.find(
                    p => (p.role === 'trace' || p.role === 'receiver' || p.role === 'powerofalchemy') && activeModifiers.has(p.id)
                  );
                  const traceEffectiveAbility = traceActivePill2?.copiedAbility ?? tracedAbility ?? poaPickedAbility ?? null;
                  const pills = getModifierPills(selectedAbility, status, entryPillDefsRef.current, traceEffectiveAbility, selectedPokemon?.id ?? '');
                  // Find PoA/Receiver pill separately — rendered inline as a picker
                  const poaPill = entryPillDefsRef.current.find(p => p.role === 'receiver' || p.role === 'powerofalchemy');
                  return (
                    <>
                    <div className="modifier-pills-row">
                      <span className="modifier-pills-label">Modifiers</span>
                      {/* PoA / Receiver inline picker */}
                      {poaPill && (
                        <span style={{ display:'inline-flex', alignItems:'center', gap:4 }}>
                          <button
                            className={`ability-badge ${poaPickedAbility ? 'selected' : ''}`}
                            onMouseDown={e => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (poaOpen) { setPoaOpen(false); return; }
                              const rect = e.currentTarget.getBoundingClientRect();
                              const openUp = window.innerHeight - rect.bottom < 260;
                              setPoaDropdownPos({ left: rect.left, ...(openUp ? { bottom: window.innerHeight - rect.top + 4, top: null } : { top: rect.bottom + 4, bottom: null }) });
                              setPoaOpen(true);
                            }}
                          >
                            {poaPill.role === 'powerofalchemy' ? 'Power of Alchemy' : 'Receiver'}{poaPickedAbility ? `: ${poaPickedAbility}` : ''}
                          </button>
                          {poaPickedAbility && (
                            <button style={{ background:'none',border:'none',color:'#666',cursor:'pointer',fontSize:13,padding:'0 3px',lineHeight:1 }}
                              onMouseDown={e => { e.preventDefault(); setPoaPickedAbility(null); setTracedAbility(null); setPoaOpen(false); setActiveModifiers(prev => { const n=new Set(prev); n.delete(poaPill.id); return n; }); }}
                            >✕</button>
                          )}
                        </span>
                      )}
                      {pills.length === 0 && !poaPill
                        ? <span className="modifier-pills-none">None</span>
                        : pills
                          // Hide "Copy Stat Changes" until Transform pill is ON
                          .filter(p => p.id !== 'copystatchanges' || activeModifiers.has('transformpill') || (_normAb(selectedAbility) === 'imposter' && activeModifiers.has('imposter')))
                          .map(({ id, label, stat, delta, role, isStack, copiedAbility }) => {
                          const isActive = activeModifiers.has(id);
                          const stackKey = id;
                          const stackVal = stackCounts[stackKey] ?? 0;

                          // Imposter pill: always ON, cannot toggle off (locked)
                          if (id === 'imposter') {
                            const neutGasActive = opponentInfo?.neutralizingGas;
                            const canToggle = !!neutGasActive; // only off if NeutGas suppresses it
                            return (
                              <span key={id} style={{ display:'inline-flex', alignItems:'center', gap:4 }}>
                                <button
                                  className="ability-badge selected"
                                  style={canToggle ? {} : { cursor:'not-allowed', opacity:0.9 }}
                                  onClick={() => {
                                    if (!canToggle) return;
                                    setActiveModifiers(prev => { const n=new Set(prev); isActive?n.delete(id):n.add(id); return n; });
                                  }}
                                  title={canToggle ? 'Neutralizing Gas active — Imposter suppressed' : 'Imposter is always active'}
                                >
                                  Imposter {!canToggle && <span style={{fontSize:9, opacity:0.6}}>🔒</span>}
                                </button>
                              </span>
                            );
                          }

                          // Stack-count pills: dropdown 0-6, white style like stage button
                          if (isStack) {
                            const isDropOpen = stackDropdownOpen === id;
                            return (
                              <span key={id} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>{label}:</span>
                                <button
                                  className="stat-stage-button"
                                  style={{ color: stackVal > 0 ? '#fff' : 'rgba(255,255,255,0.4)', minWidth: 32 }}
                                  onClick={e => {
                                    if (isDropOpen) { setStackDropdownOpen(null); setStackDropdownRect(null); return; }
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    const dropH = 7 * 34; // 7 options × ~34px each
                                    const openUp = window.innerHeight - rect.bottom < dropH + 8;
                                    setStackDropdownRect({ ...rect.toJSON(), openUp });
                                    setStackDropdownOpen(id);
                                  }}
                                >
                                  {stackVal}
                                </button>
                                {isDropOpen && stackDropdownRect && createPortal(
                                  <div
                                    className="stat-stage-menu"
                                    style={{
                                      position: 'fixed',
                                      left: stackDropdownRect.left,
                                      ...(stackDropdownRect.openUp
                                        ? { bottom: window.innerHeight - stackDropdownRect.top + 4 }
                                        : { top: stackDropdownRect.bottom + 4 }),
                                      background: 'rgba(10,10,16,0.92)',
                                      zIndex: 99999,
                                      scrollbarWidth: 'none',
                                    }}
                                  >
                                    {[0,1,2,3,4,5,6].map(v => (
                                      <button
                                        key={v}
                                        className={`stage-option ${stackVal === v ? 'selected' : ''}`}
                                        style={{ '--stat-color': '#fff' }}
                                        onMouseDown={e => {
                                          e.preventDefault();
                                          setStackCounts(prev => ({ ...prev, [stackKey]: v }));
                                          setStackDropdownOpen(null);
                                        }}
                                      >{v}</button>
                                    ))}
                                  </div>,
                                  document.body
                                )}
                              </span>
                            );
                          }

                          // Power of Alchemy / Receiver: handled in dedicated section above pills row
                          if (role === 'receiver' || role === 'powerofalchemy') return null;

                          return (
                          <button
                            key={id}
                            className={`ability-badge ${isActive ? 'selected' : ''}`}
                            onClick={() => {
                              if (role === 'commander') {
                                if (!isActive) {
                                  preCommanderRef.current = selectedPokemon;
                                  const dondozo = allPokemon.find(p => p.id === 'dondozo');
                                  if (dondozo) onSelect(dondozo);
                                  setStatStages({ atk: 2, def: 2, spa: 2, spd: 2, spe: 2 });
                                } else {
                                  if (preCommanderRef.current) onSelect(preCommanderRef.current);
                                  setStatStages({ atk: 0, def: 0, spa: 0, spd: 0, spe: 0 });
                                }
                                setActiveModifiers(prev => { const n = new Set(prev); isActive ? n.delete(id) : n.add(id); return n; });
                                return;
                              }
                              if (role === 'trace') {
                                setTracedAbility(isActive ? null : (copiedAbility ?? null));
                                setActiveModifiers(prev => { const n = new Set(prev); isActive ? n.delete(id) : n.add(id); return n; });
                                return;
                              }
                              // Transform pill (Mew/Smeargle)
                              if (id === 'transformpill') {
                                const turningOn = !isActive;
                                setTransformOn(turningOn);
                                if (turningOn && allMoves.length) {
                                  const tm = allMoves.find(m => m.name === 'Transform');
                                  if (tm) { setSelectedMoves(prev => { const n=[...prev]; n[0]=tm; return n; }); setLockedMoves([true,false,false,false]); }
                                } else {
                                  setLockedMoves([false,false,false,false]);
                                  setSelectedMoves(prev => { const n=[...prev]; if(n[0]?.name==='Transform') n[0]=null; return n; });
                                }
                                setActiveModifiers(prev => { const n=new Set(prev); isActive?n.delete(id):n.add(id); return n; });
                                return;
                              }
                              // Copy Stat Changes: simple toggle
                              if (id === 'copystatchanges') {
                                setActiveModifiers(prev => { const n = new Set(prev); isActive ? n.delete(id) : n.add(id); return n; });
                                return;
                              }
                              if (role === 'own' && stat && delta !== 0) {
                                setStatStages(prev => ({
                                  ...prev,
                                  [stat]: Math.max(-6, Math.min(6, prev[stat] + (isActive ? -delta : delta))),
                                }));
                              }
                              setActiveModifiers(prev => {
                                const n = new Set(prev);
                                isActive ? n.delete(id) : n.add(id);
                                return n;
                              });
                            }}
                          >
                            {label}
                          </button>
                          );
                        })
                      }
                    </div>
                    {/* PoA dropdown portal — lives outside the row div to avoid clip */}
                    {poaOpen && createPortal(
                      <div
                        onMouseDown={e => { e.preventDefault(); e.stopPropagation(); }}
                        style={{
                          position: 'fixed',
                          ...(poaDropdownPos.bottom != null ? { bottom: poaDropdownPos.bottom } : { top: poaDropdownPos.top }),
                          left: poaDropdownPos.left,
                          minWidth: 240,
                          zIndex: 99999,
                          background: 'rgba(10,10,16,0.92)',
                          backdropFilter: 'blur(40px) saturate(200%) brightness(0.96)',
                          WebkitBackdropFilter: 'blur(40px) saturate(200%) brightness(0.96)',
                          border: '1px solid rgba(255,255,255,0.07)',
                          borderTop: '1px solid rgba(255,255,255,0.18)',
                          borderRadius: 14,
                          boxShadow: 'inset 0 0.5px 0 rgba(255,255,255,0.1), 0 16px 40px rgba(0,0,0,0.7)',
                          overflow: 'hidden',
                        }}
                      >
                        <input
                          autoFocus
                          value={poaSearch}
                          onChange={e => setPoaSearch(e.target.value)}
                          placeholder="Search ability..."
                          style={{ width:'100%', background:'transparent', border:'none', borderBottom:'1px solid rgba(255,255,255,0.07)', color:'#ddd', padding:'9px 12px', fontSize:13, outline:'none', boxSizing:'border-box' }}
                        />
                        <div style={{ maxHeight:220, overflowY:'auto', scrollbarWidth:'none' }}>
                          {allAbilities.filter(n => {
                            const nid = n.toLowerCase().replace(/[^a-z0-9]/g,'');
                            const poaPillRole = entryPillDefsRef.current.find(p => p.role === 'receiver' || p.role === 'powerofalchemy')?.role;
                            // Receiver blocked list (official)
                            // Block by exact display name — matches Bulbapedia Gen IX tables
                            const BLOCKED_RECEIVER = new Set([
                              'Receiver','Power of Alchemy','Trace','Forecast','Flower Gift','Multitype',
                              'Illusion','Wonder Guard','Zen Mode','Imposter','Stance Change','Power Construct',
                              'Schooling','Comatose','Shields Down','Disguise','RKS System','Battle Bond',
                              'Wandering Spirit','Ice Face','Hunger Switch',
                              'As One (Glastrier)','As One (Spectrier)',
                              'Zero to Hero','Commander','Protosynthesis','Quark Drive',
                            ]);
                            const BLOCKED_POA = new Set([...BLOCKED_RECEIVER,
                              'Poison Puppeteer','Teraform Zero','Tera Shell','Tera Shift',
                            ]);
                            const bannedSet = poaPillRole === 'powerofalchemy' ? BLOCKED_POA : BLOCKED_RECEIVER;
                            return !bannedSet.has(n) && n.toLowerCase().includes(poaSearch.toLowerCase());
                          }).slice(0,80).map(name => {
                            const poaPillInner = entryPillDefsRef.current.find(p => p.role === 'receiver' || p.role === 'powerofalchemy');
                            return (
                              <div key={name}
                                style={{ padding:'7px 14px', fontSize:13, color:'rgba(255,255,255,0.75)', cursor:'pointer', borderBottom:'1px solid rgba(255,255,255,0.04)', transition:'background 0.1s' }}
                                onMouseDown={e => {
                                  e.preventDefault();
                                  setPoaPickedAbility(name);
                                  setTracedAbility(name);
                                  setPoaOpen(false);
                                  setPoaSearch('');
                                  if (poaPillInner) setActiveModifiers(prev => { const n=new Set(prev); n.add(poaPillInner.id); return n; });
                                }}
                                onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,0.08)'}
                                onMouseLeave={e => e.currentTarget.style.background=''}
                              >{name}</div>
                            );
                          })}
                        </div>
                      </div>,
                      document.body
                    )}
                  </>
                  );
                })()}

                {collapsed && (
                  <div className="ev-total">
                    <span>Total EVs: {getTotalEvs()}/510</span>
                    {step === 2 && onLevelChange && (
                      <span className="level-inline">
                        <span className="level-row-label">LVL</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          className="stat-input level-inline-input"
                          value={levelRaw}
                          onChange={e => {
                            const raw = e.target.value.replace(/[^0-9]/g, '').slice(0, 3);
                            setLevelRaw(raw);
                            const v = parseInt(raw, 10);
                            if (!isNaN(v)) onLevelChange(Math.max(1, Math.min(100, v)));
                          }}
                          onBlur={() => {
                            const v = parseInt(levelRaw, 10);
                            const clamped = isNaN(v) ? 1 : Math.max(1, Math.min(100, v));
                            setLevelRaw(String(clamped));
                            onLevelChange(clamped);
                          }}
                          placeholder="100"
                          maxLength={3}
                        />
                      </span>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
          )}

          {(step === 3 || step === 4 || step === 5) && (() => {
            const nonHpStats = ['atk', 'def', 'spa', 'spd', 'spe'];
            const statLabelsMap = { atk: 'ATK', def: 'DEF', spa: 'SPA', spd: 'SPD', spe: 'SPE' };
            const mainTokens = [];
            const ivTokens = [];

            // Include HP EV in spread tokens
            const hpEv = userEvs['hp'] ?? 0;
            if (hpEv !== 0) mainTokens.push({ stat: 'hp', ev: hpEv, stage: 0, isBoost: false, isDrop: false });

            nonHpStats.forEach(stat => {
              const ev = userEvs[stat];
              const ivRaw = userIvs[stat];
              const iv = typeof ivRaw === 'number' ? ivRaw : 31;
              const stage = statStages[stat];
              const isBoost = NATURES[selectedNature]?.boost === stat;
              const isDrop = NATURES[selectedNature]?.drop === stat;
              const hasMain = ev !== 0 || stage !== 0 || isBoost || isDrop;
              if (hasMain) mainTokens.push({ stat, ev, stage, isBoost, isDrop });
              if (iv !== 31) ivTokens.push({ stat, iv });
            });

            // HP display — shown in both step 3 and 4
            const hpDisplay = calculatedStats ? (() => {
              const maxHp = calculatedStats.hp;
              const hp = currentHp !== null ? currentHp : maxHp;
              return (
                <span className="spread-hp-inline">
                  <span className="spread-hp-label"> (HP</span>
                  <span className="spread-hp-val">{hp}<span className="spread-hp-sep">/</span>{maxHp})</span>
                </span>
              );
            })() : null;

            const statusBadge = status ? (() => {
              const s = STATUS_CONDITIONS.find(sc => sc.id === status);
              return s ? (
                <span
                  className="spread-status-badge"
                  style={{ background: s.color }}
                  title={s.name}
                >{s.label}</span>
              ) : null;
            })() : null;

            const statLabelsFull = { hp: 'HP', atk: 'ATK', def: 'DEF', spa: 'SPA', spd: 'SPD', spe: 'SPE' };

            const spreadContent = (
              <>
                {mainTokens.map(({ stat, ev, stage, isBoost, isDrop }, idx) => (
                  <span key={stat} className="spread-token">
                    {idx > 0 && <span className="spread-sep"> / </span>}
                    {stage !== 0 && (
                      <span style={{ color: stage > 0 ? '#6dff6d' : '#ff6d6d', fontWeight: 700 }}>
                        {stage > 0 ? '+' : ''}{stage}{' '}
                      </span>
                    )}
                    {(ev !== 0 || stage !== 0) && (
                      <span style={{ color: stat === 'hp' ? '#D8B8FF' : STAT_COLORS[stat], fontWeight: 700 }}>{ev} </span>
                    )}
                    <span style={{ color: stat === 'hp' ? '#D8B8FF' : STAT_COLORS[stat], fontWeight: 700 }}>
                      {statLabelsFull[stat]}
                    </span>
                    {isBoost && <span style={{ color: '#6dff6d', fontWeight: 700 }}>+</span>}
                    {isDrop && <span style={{ color: '#ff6d6d', fontWeight: 700 }}>-</span>}
                  </span>
                ))}
                {ivTokens.length > 0 && (
                  <span className="spread-token" style={{ color: '#fff', fontWeight: 600 }}>
                    {mainTokens.length > 0 && <span className="spread-sep"> || </span>}
                    IVs:{ivTokens.map(({ stat, iv }) => (
                      <span key={stat}> {iv} {statLabelsFull[stat]}</span>
                    ))}
                  </span>
                )}
                {hpDisplay}
              </>
            );

            return (
              <div className="spread-row-outer">
                <div className="spread-summary-section">
                  {mainTokens.length === 0 && ivTokens.length === 0
                    ? <span className="spread-empty">No EVs, stages, or IVs modified</span>
                    : <div className="spread-tokens">{spreadContent}</div>
                  }
                </div>
              </div>
            );
          })()}

          {step === 3 && (
            <div className="step3-bottom">

              {/* Item Selection */}
              <div className="step3-section">
                <span className="step3-section-label">Item</span>
                <div className="item-search-wrapper" ref={itemWrapperRef}>
                  <div
                    className={`item-selected-display ${itemSearchOpen ? 'open' : ''}`}
                    onClick={() => { if (!itemLocked) setItemSearchOpen(o => !o); }}
                    style={itemLocked ? { cursor: 'not-allowed', opacity: 0.7 } : {}}
                    title={itemLocked ? 'Required for this form — cannot be changed' : ''}
                  >
                    {selectedItem ? (
                      <>
                        <img
                          src={getItemSpriteUrl(selectedItem)}
                          alt={selectedItem.name}
                          className="item-icon"
                          onError={e => { e.target.style.display = 'none'; }}
                        />
                        <span className="item-name-text">{selectedItem.name}</span>
                        {!itemLocked && (
                          <button
                            className="item-clear-btn"
                            onClick={(e) => { e.stopPropagation(); setSelectedItem(null); setItemSearch(''); }}
                          >✕</button>
                        )}
                      </>
                    ) : (
                      <span className="item-placeholder">No item</span>
                    )}
                  </div>
                  {itemSearchOpen && (
                    <div className="item-dropdown">
                      <input
                        type="text"
                        className="item-search-input"
                        placeholder="Search items..."
                        value={itemSearch}
                        onChange={e => setItemSearch(e.target.value)}
                        autoFocus
                      />
                      <div className="item-list">
                        {allItems
                          .filter(item => item.name.toLowerCase().includes(itemSearch.toLowerCase()))
                          .slice(0, 80)
                          .map(item => (
                            <div
                              key={item.id}
                              className={`item-option ${selectedItem?.id === item.id ? 'selected' : ''}`}
                              onMouseDown={() => { setSelectedItem(item); setItemSearchOpen(false); setItemSearch(''); }}
                            >
                              <span>{item.name}</span>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Status Condition */}
              <div className="step3-section">
                <span className="step3-section-label">Status</span>
                <div className="status-pills">
                  {STATUS_CONDITIONS.map(s => (
                    <button
                      key={s.id}
                      className={`status-pill pill-${s.id} ${status === s.id ? 'active' : ''}`}
                      style={{
                        '--status-color': s.color,
                        '--status-bg': s.bg,
                      }}
                      onClick={() => setStatus(status === s.id ? null : s.id)}
                      title={s.name}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* HP */}
              {calculatedStats && (() => {
                const maxHp = calculatedStats.hp;
                const hp = currentHp ?? maxHp;
                // Exact pct for bar (float)
                const exactPct = (hp / maxHp) * 100;
                // Display: use hpPctStr while typing, otherwise show 1-decimal float
                const pctDisplay = hpPctStr !== null
                  ? hpPctStr
                  : (Math.round(exactPct * 10) / 10).toString();
                const barColor = '#D8B8FF';

                const applyPct = (raw) => {
                  // Accept comma or dot as decimal separator, allow max 1 decimal
                  const normalised = raw.replace(',', '.').replace(/(\.\d)\d+/, '$1');
                  const v = parseFloat(normalised);
                  if (isNaN(v)) { setCurrentHp(0); setHpPctStr('0'); return; }
                  const clamped = Math.max(0, Math.min(100, v));
                  // Showdown floor rounding
                  setCurrentHp(Math.floor(clamped / 100 * maxHp));
                  setHpPctStr((Math.round(clamped * 10) / 10).toString());
                };

                return (
                  <div className="step3-section">
                    <span className="step3-section-label">HP</span>
                    <div className="hp-section">
                      <div className="hp-bar-wrapper">
                        <div className="hp-bar-fill" style={{ width: `${exactPct}%`, background: barColor }} />
                      </div>
                      <div className="hp-inputs">
                        <input
                          type="text"
                          inputMode="numeric"
                          className="stat-input hp-val-input"
                          value={hp}
                          onChange={e => {
                            const v = parseInt(e.target.value);
                            if (isNaN(v)) { setCurrentHp(0); setHpPctStr('0'); return; }
                            const clamped = Math.max(0, Math.min(maxHp, v));
                            setCurrentHp(clamped);
                            setHpPctStr(null); // recalculate from hp
                          }}
                        />
                        <span className="hp-sep">/ {maxHp}</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          className="stat-input hp-pct-input"
                          value={pctDisplay}
                          onChange={e => {
                            const raw = e.target.value;
                            // Allow typing mid-decimal: keep raw until blur or valid
                            const normalised = raw.replace(',', '.');
                            // Only allow pattern like "91", "91.", "91.6"
                            if (/^\d{0,3}([.,]\d?)?$/.test(raw)) {
                              setHpPctStr(raw);
                              const v = parseFloat(normalised);
                              if (!isNaN(v)) {
                                const clamped = Math.max(0, Math.min(100, v));
                                setCurrentHp(Math.floor(clamped / 100 * maxHp));
                              }
                            }
                          }}
                          onBlur={e => applyPct(e.target.value)}
                        />
                        <span className="hp-sep">%</span>
                      </div>
                    </div>
                  </div>
                );
              })()}

            </div>
          )}

          {step === 4 && (() => {
            const CATEGORY_META = {
              Physical: { label: 'PHY', color: '#F08030' },
              Special:  { label: 'SPC', color: '#6890F0' },
              Status:   { label: 'STA', color: '#A8A8A8' },
            };
            const attackerInfo = {
              weight:    selectedPokemon?.weight || 0,
              spe:       calculatedStats?.spe || 1,
              currentHp: currentHp ?? calculatedStats?.hp ?? 1,
              maxHp:     calculatedStats?.hp || 1,
            };
            return (
              <div className="move-slots">
                {[0, 1, 2, 3].map(idx => {
                  const isTransformed = (_normAb(selectedAbility) === 'imposter' && activeModifiers.has('imposter')) || activeModifiers.has('transformpill');
                  const oppMoves = opponentFullState?.moves ?? [null,null,null,null];
                  const move = isTransformed ? (oppMoves[idx] ?? null) : selectedMoves[idx];
                  const term = moveSearchTerms[idx];
                  const isOpen = moveSearchOpen === idx;
                  const crit = critMoves[idx];
                  const catMeta = move ? CATEGORY_META[move.category] : null;
                  // Exclude moves already selected in other slots
                  const otherSelected = new Set(
                    selectedMoves.filter((m, i) => m && i !== idx).map(m => m.name)
                  );
                  const filtered = learnableMoves.filter(m =>
                    !otherSelected.has(m.name) && (
                      m.name.toLowerCase().startsWith(term.toLowerCase()) ||
                      m.name.toLowerCase().includes(term.toLowerCase())
                    )
                  ).slice(0, 80);

                  const displayBP = move ? computeDisplayBP(move, attackerInfo, opponentInfo) : null;
                  const displayAcc = move
                    ? (move.accuracy === true ? '∞' : move.accuracy ? String(move.accuracy) : '—')
                    : null;

                  return (
                    <div key={idx} className="move-slot-row">
                      {/* The clickable search box */}
                      <div
                        className={`move-slot ${isOpen ? 'open' : ''} ${move ? 'has-move' : ''}`}
                        ref={el => moveWrapperRefs.current[idx] = el}
                      >
                        <div
                          className="move-slot-display"
                          onClick={() => {
                            const isTransformed = (_normAb(selectedAbility) === 'imposter' && activeModifiers.has('imposter')) || activeModifiers.has('transformpill');
                            if (lockedMoves[idx] || isTransformed) return; // locked
                            if (!isOpen) {
                              const el = moveWrapperRefs.current[idx];
                              const rect = el?.getBoundingClientRect();
                              if (rect) {
                                const spaceBelow = window.innerHeight - rect.bottom;
                                setMoveDropdownDir(spaceBelow < 236 ? 'up' : 'down');
                                setMoveSlotRects(r => { const n=[...r]; n[idx]=rect; return n; });
                              }
                              setMoveSearchTerms(t => { const n=[...t]; n[idx]=''; return n; });
                              setMoveSearchOpen(idx);
                            }
                          }}
                        >
                          {isOpen ? (
                            <input
                              type="text"
                              autoFocus
                              className="move-search-inline"
                              placeholder={move ? move.name : `Search move ${idx + 1}…`}
                              value={term}
                              onChange={e => setMoveSearchTerms(t => { const n=[...t]; n[idx]=e.target.value; return n; })}
                              onClick={e => e.stopPropagation()}
                            />
                          ) : move ? (
                            <div className="move-selected-content" title={move.shortDesc || ''}>
                              <span className={`type-badge type-${move.type.toLowerCase()}`}>{move.type}</span>
                              <span className="move-cat-badge" style={{ color: catMeta.color }}>{catMeta.label}</span>
                              <span className="move-name">{move.name}</span>
                            </div>
                          ) : (
                            <span className="move-placeholder">— Move {idx + 1}</span>
                          )}
                        </div>

                        {/* Clear button — hidden when open, slot locked, or transformed */}
                        {(() => {
                          const isTransf = (_normAb(selectedAbility) === 'imposter' && activeModifiers.has('imposter')) || activeModifiers.has('transformpill');
                          if (isTransf) return <span style={{ fontSize:10, color:'rgba(255,255,255,0.25)', marginRight:8, flexShrink:0 }} title="Copied from opponent (Transformed)">🔒</span>;
                          if (lockedMoves[idx]) return <span style={{ fontSize:10, color:'rgba(255,255,255,0.25)', marginRight:8, flexShrink:0 }} title="Required for this form">🔒</span>;
                          if (move && !isOpen) return (
                            <button
                              className="move-clear-btn"
                              onClick={e => { e.stopPropagation(); setSelectedMoves(m => { const n=[...m]; n[idx]=null; return n; }); setCritMoves(c => { const n=[...c]; n[idx]=false; return n; }); }}
                              title="Clear move"
                            >✕</button>
                          );
                          return null;
                        })()}

                        {/* Dropdown portal — results list only, no search input (search is inline in the slot) */}
                        {isOpen && moveSlotRects[idx] && createPortal(
                          <div
                            ref={moveDropdownRef}
                            className="move-dropdown"
                            style={{
                              position: 'fixed',
                              ...(moveDropdownDir === 'down'
                                ? { top: moveSlotRects[idx].bottom + 4, bottom: 'auto' }
                                : { bottom: window.innerHeight - moveSlotRects[idx].top + 4, top: 'auto' }),
                              left: moveSlotRects[idx].left,
                              width: moveSlotRects[idx].width,
                              zIndex: 99999,
                              background: 'rgba(10,10,16,0.92)',
                              backdropFilter: 'blur(40px) saturate(200%) brightness(0.96)',
                              WebkitBackdropFilter: 'blur(40px) saturate(200%) brightness(0.96)',
                              border: '1px solid rgba(255,255,255,0.07)',
                              borderTop: '1px solid rgba(255,255,255,0.16)',
                              borderRadius: 12,
                              boxShadow: 'inset 0 0.5px 0 rgba(255,255,255,0.08), 0 12px 32px rgba(0,0,0,0.7)',
                              overflow: 'hidden',
                              scrollbarWidth: 'none',
                            }}
                          >
                            <div className="move-list" style={{ maxHeight: 220, overflowY: 'auto', scrollbarWidth: 'none' }}>
                              {filtered.length === 0 ? (
                                <div className="move-option-empty">
                                {filtered.length === 0 && term === '' && learnableMoves.length > 0
                                  ? 'No selectable moves available'
                                  : 'No moves found'}
                              </div>
                              ) : filtered.map(m => {
                                const cm = CATEGORY_META[m.category];
                                return (
                                  <div
                                    key={m.id}
                                    className={`move-option ${selectedMoves[idx]?.id === m.id ? 'selected' : ''}`}
                                    title={m.shortDesc}
                                    onMouseDown={() => {
                                      setSelectedMoves(sm => { const n=[...sm]; n[idx]=m; return n; });
                                      setMoveSearchOpen(null);
                                    }}
                                  >
                                    <span className={`type-badge type-${m.type.toLowerCase()} type-badge-sm`}>{m.type}</span>
                                    <span className="move-cat-badge-sm" style={{ color: cm.color }}>{cm.label}</span>
                                    <span className="move-option-name">{m.name}</span>
                                    {m.basePower > 0 && <span className="move-option-power">{m.basePower}</span>}
                                  </div>
                                );
                              })}
                            </div>
                          </div>,
                          document.body
                        )}
                      </div>

                      {/* Stats + crit OUTSIDE the box */}
                      <div className="move-row-ext">
                        <span className="move-ext-label">BP:</span>
                        <span className="move-ext-val">{displayBP ?? '—'}</span>
                        <span className="move-ext-label">Acc:</span>
                        <span className="move-ext-val">{displayAcc ?? '—'}</span>
                        <button
                          className={`crit-btn ${crit ? 'active' : ''}`}
                          onClick={() => setCritMoves(c => { const n=[...c]; n[idx]=!n[idx]; return n; })}
                          title="Critical Hit"
                        >CRIT</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}

        </LiquidGlass>
      ) : (
        <div className="pokemon-search">
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search for a Pokemon..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onFocus={() => setSearchOpen(true)}
            className="search-input"
          />
          
          {searchOpen && filteredPokemon.length > 0 && createPortal(
            <div
              className="search-results"
              style={{
                position: 'absolute',
                top:   dropdownPos.top,
                left:  dropdownPos.left,
                width: dropdownPos.width,
                zIndex: 99999,
                background: 'rgba(10,10,16,0.88)',
                backdropFilter: 'blur(40px) saturate(200%) brightness(0.96)',
                WebkitBackdropFilter: 'blur(40px) saturate(200%) brightness(0.96)',
                border: '1px solid rgba(255,255,255,0.07)',
                borderTop: '1px solid rgba(255,255,255,0.14)',
                borderRadius: '14px',
                boxShadow: 'inset 0 0.5px 0 rgba(255,255,255,0.08), 0 16px 40px rgba(0,0,0,0.7)',
                scrollbarWidth: 'none',
              }}
            >
              {filteredPokemon.slice(0, 50).map(pokemon => (
                <div
                  key={pokemon.id}
                  className="search-result"
                  onMouseDown={(e) => {
                    // onMouseDown fires before onBlur so we can intercept it
                    e.preventDefault();
                    handleSelectPokemon(pokemon);
                  }}
                >
                  <span className="result-name">{pokemon.name}</span>
                  <div className="result-types">
                    {pokemon.types && pokemon.types.map(type => (
                      <span key={type} className={`type-badge type-${type.toLowerCase()}`}>
                        {type}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>,
            document.body
          )}
        </div>
      )}
    </LiquidGlass>
  );
});

PokemonSelector.displayName = 'PokemonSelector';
export default PokemonSelector;