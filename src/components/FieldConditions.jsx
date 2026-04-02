import { useState, useEffect, useRef } from 'react';
import LiquidGlass from '../components/LiquidGlass';
import '../styles/FieldConditions.css';

const normId = (s) => (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Ability → auto field/side patches
const WEATHER_ABILITIES = {
  drought: 'sun', desolateland: 'harshSunshine', orichalcumpulse: 'sun',
  drizzle: 'rain', primordialsea: 'heavyRain',
  sandstream: 'sand', snowwarning: 'snow',
  deltastream: 'strongWinds',
};
const TERRAIN_ABILITIES = {
  electricsurge: 'electric', hadronengine: 'electric', grassysurge: 'grassy',
  mistysurge: 'misty', psychicsurge: 'psychic',
};
const SIDE_ABILITY_KEYS = {
  friendguard: 'friendGuard', battery: 'battery',
  powerspot: 'powerSpot', steelyspirit: 'steelySpirit',
  flowergift: 'flowerGift',
};

const DEFAULT_SIDE = {
  stealthRock: false, spikes: 0, toxicSpikes: 0,
  reflect: false, lightScreen: false, auroraVeil: false,
  protect: false, leechSeed: false, saltCure: false,
  foresight: false, helpingHand: false, tailwind: false,
  flowerGift: false, powerTrick: false, steelySpirit: false,
  friendGuard: false, battery: false, powerSpot: false,
  switchingOut: false, justSwitchedIn: false,
};

const DEFAULT_FIELD = {
  format: 'singles', level: 100,
  terrain: null, weather: null,
  magicRoom: false, wonderRoom: false, gravity: false,
};

const DESCS = {
  electric: 'Boosts Electric moves 30%. Grounded Pokémon can\'t fall asleep.',
  grassy:   'Boosts Grass moves 30%. Restores 1/16 HP/turn. Weakens Earthquake.',
  misty:    'Halves Dragon damage. Grounded Pokémon cannot be statused.',
  psychic:  'Boosts Psychic moves 30%. Prevents priority on grounded Pokémon.',
  sun:           'Boosts Fire 1.5×, weakens Water 0.5×. Lasts 5 turns.',
  rain:          'Boosts Water 1.5×, weakens Fire 0.5×. Lasts 5 turns.',
  sand:          'Rock/Steel/Ground immune. Others lose 1/16 HP/turn.',
  snow:          'Ice-types gain 1.5× Defense. Lasts 5 turns.',
  harshSunshine: 'Permanent sun (Desolate Land). Water moves fail entirely.',
  heavyRain:     'Permanent rain (Primordial Sea). Fire moves fail entirely.',
  strongWinds:   'Permanent wind (Delta Stream). Flying weaknesses negated.',
  magicRoom:  'Held items have no effect for 5 turns.',
  wonderRoom: 'Defense and Sp.Def swapped for 5 turns.',
  gravity:    'All Pokémon grounded. Accuracy up. Fly/Bounce unusable.',
  stealthRock: 'Deals damage on switch-in based on Rock type effectiveness.',
  reflect:     'Halves physical damage taken for 5 turns.',
  lightScreen: 'Halves special damage taken for 5 turns.',
  auroraVeil:  'Halves both physical and special damage for 5 turns (requires snow).',
  protect:     'User is protected from most moves this turn.',
  leechSeed:   '1/8 max HP drained each turn, transferred to attacker.',
  saltCure:    '1/8 HP/turn (1/4 for Water or Steel types).',
  foresight:   'Normal and Fighting moves hit Ghost-types. Evasion ignored.',
  helpingHand: 'Boosts partner\'s move power by 1.5× this turn (Doubles).',
  tailwind:    'Doubles Speed for 4 turns for the user\'s side.',
  flowerGift:  'Cherrim in sunshine: boosts Atk and Sp.Def of allies by 1.5×.',
  powerTrick:  'User swaps its Attack and Defense stats.',
  steelySpirit:'Doubles Steel-type move power for the side (Doubles).',
  friendGuard: 'Reduces damage dealt to allies by 25% (Doubles).',
  battery:     'Boosts ally special moves by 1.3× (Doubles).',
  powerSpot:   'Boosts ally moves by 1.3× (Doubles).',
  switchingOut:'Pokémon is switching out this turn (Pursuit does ×2 damage).',
  justSwitchedIn:'Pokémon just switched in this turn (Stakeout does ×2 damage).',
};

function hexToRgb(hex) {
  if (!hex) return null;
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return {r,g,b};
}

function Pill({ label, active, onClick, color, desc }) {
  const rgb = color ? hexToRgb(color) : null;
  const activeStyle = active && rgb ? {
    background: `rgba(${rgb.r},${rgb.g},${rgb.b},0.3)`,
    backdropFilter: 'blur(16px) saturate(220%) brightness(1.06)',
    WebkitBackdropFilter: 'blur(16px) saturate(220%) brightness(1.06)',
    borderColor: `rgba(${rgb.r},${rgb.g},${rgb.b},0.45)`,
    borderTopColor: `rgba(${rgb.r},${rgb.g},${rgb.b},0.7)`,
    color: '#fff',
    boxShadow: `inset 0 0.5px 0 rgba(255,255,255,0.2), 0 0 12px rgba(${rgb.r},${rgb.g},${rgb.b},0.4)`,
  } : {};
  return (
    <button
      type="button"
      className={`fc-pill ${active ? 'active' : ''}`}
      style={activeStyle}
      onClick={onClick}
      title={desc ?? ''}
    >{label}</button>
  );
}

function Toggle({ label, active, onClick, color, desc }) {
  const rgb = color ? hexToRgb(color) : null;
  const activeStyle = active && rgb ? {
    background: `rgba(${rgb.r},${rgb.g},${rgb.b},0.28)`,
    backdropFilter: 'blur(16px) saturate(220%) brightness(1.06)',
    WebkitBackdropFilter: 'blur(16px) saturate(220%) brightness(1.06)',
    borderColor: `rgba(${rgb.r},${rgb.g},${rgb.b},0.4)`,
    borderTopColor: `rgba(${rgb.r},${rgb.g},${rgb.b},0.65)`,
    color: '#fff',
    boxShadow: `inset 0 0.5px 0 rgba(255,255,255,0.2), 0 0 12px rgba(${rgb.r},${rgb.g},${rgb.b},0.35)`,
  } : {};
  return (
    <button
      type="button"
      className={`fc-toggle ${active ? 'active' : ''}`}
      style={activeStyle}
      onClick={onClick}
      title={desc ?? ''}
    >{label}</button>
  );
}

function SidePanel({ title, side, onChange }) {
  const set = (k, v) => onChange({ ...side, [k]: v });
  const tog = (k) => set(k, !side[k]);

  const SIDE_TOGGLES = [
    { key: 'protect',     label: 'Protect' },
    { key: 'leechSeed',   label: 'Leech Seed' },
    { key: 'saltCure',    label: 'Salt Cure' },
    { key: 'foresight',   label: 'Foresight' },
    { key: 'helpingHand', label: 'Helping Hand' },
    { key: 'tailwind',    label: 'Tailwind' },
    { key: 'flowerGift',  label: 'Flower Gift' },
    { key: 'powerTrick',  label: 'Power Trick' },
    { key: 'steelySpirit',label: 'Steely Spirit' },
    { key: 'friendGuard', label: 'Friend Guard' },
    { key: 'battery',     label: 'Battery' },
    { key: 'powerSpot',   label: 'Power Spot' },
    { key: 'switchingOut',   label: 'Switching Out (Pursuit)' },
    { key: 'justSwitchedIn', label: 'Just Switched In (Stakeout)' },
  ];

  return (
    <LiquidGlass borderRadius={18} bezelWidth={20} scale={60} blur={40} saturation={2.1} brightness={0.93} background="rgba(8,8,12,0.62)" style={{}}>
    <div className="fc-side-card" style={{background:'transparent',border:'none',boxShadow:'none'}}>
      <div className="fc-side-title">{title}</div>

      <Toggle label="Stealth Rock" active={side.stealthRock} onClick={() => tog('stealthRock')} desc={DESCS.stealthRock} />

      <div className="fc-counter-row">
        <span className="fc-counter-label">Spikes</span>
        <div className="fc-counter-btns">
          {[0,1,2,3].map(n => (
            <button type="button" key={n} className={`fc-counter-btn ${side.spikes === n ? 'active' : ''}`} onClick={() => set('spikes', n)}>
              {n === 0 ? '✕' : n}
            </button>
          ))}
        </div>
      </div>

      <div className="fc-counter-row">
        <span className="fc-counter-label">Toxic Spikes</span>
        <div className="fc-counter-btns">
          {[0,1,2].map(n => (
            <button type="button" key={n} className={`fc-counter-btn ${side.toxicSpikes === n ? 'active' : ''}`} onClick={() => set('toxicSpikes', n)}>
              {n === 0 ? '✕' : n}
            </button>
          ))}
        </div>
      </div>

      <div className="fc-pair-row">
        <Toggle label="Reflect"      active={side.reflect}      onClick={() => tog('reflect')}      color="#f0d040" desc={DESCS.reflect} />
        <Toggle label="Light Screen" active={side.lightScreen}  onClick={() => tog('lightScreen')}  color="#f0d040" desc={DESCS.lightScreen} />
      </div>

      <Toggle label="Aurora Veil" active={side.auroraVeil} onClick={() => tog('auroraVeil')} color="#98d8d8" desc={DESCS.auroraVeil} />

      {SIDE_TOGGLES.map(({ key, label }) => (
        <Toggle key={key} label={label} active={side[key]} onClick={() => tog(key)} desc={DESCS[key]} />
      ))}
    </div>
    </LiquidGlass>
  );
}

export default function FieldConditions({ value, onChange, userFullState, enemyFullState }) {
  const field    = value?.field    ?? DEFAULT_FIELD;
  const userSide = value?.userSide ?? DEFAULT_SIDE;
  const enemySide= value?.enemySide?? DEFAULT_SIDE;
  const autoSeedRef = useRef(null);

  const setField    = (patch) => onChange({ field: { ...field, ...patch }, userSide, enemySide });
  const setUserSide = (s)     => onChange({ field, userSide: s, enemySide });
  const setEnemySide= (s)     => onChange({ field, userSide, enemySide: s });
  const userAb = normId(userFullState?.ability ?? '');
  const enemyAb = normId(enemyFullState?.ability ?? '');
  const userSpe = userFullState?.calculatedStats?.spe ?? userFullState?.pokemon?.baseStats?.spe ?? 0;
  const enemySpe = enemyFullState?.calculatedStats?.spe ?? enemyFullState?.pokemon?.baseStats?.spe ?? 0;
  const autoSeedKey = `${userAb}|${enemyAb}|${userSpe}|${enemySpe}`;

  // Auto-apply ability-based field conditions when entering step 5
  useEffect(() => {
    if (!userAb && !enemyAb) return;
    if (autoSeedRef.current === autoSeedKey) return;
    autoSeedRef.current = autoSeedKey;

    let fieldPatch = {};
    let userSidePatch = {};
    let enemySidePatch = {};

    // Speed determines who sets weather/terrain — faster pokemon wins
    const userFaster = userSpe >= enemySpe; // tie goes to user

    const userWeather  = WEATHER_ABILITIES[userAb];
    const enemyWeather = WEATHER_ABILITIES[enemyAb];
    if (userWeather && enemyWeather) {
      fieldPatch.weather = userFaster ? userWeather : enemyWeather;
    } else if (userWeather) {
      fieldPatch.weather = userWeather;
    } else if (enemyWeather) {
      fieldPatch.weather = enemyWeather;
    }

    const userTerrain  = TERRAIN_ABILITIES[userAb];
    const enemyTerrain = TERRAIN_ABILITIES[enemyAb];
    if (userTerrain && enemyTerrain) {
      fieldPatch.terrain = userFaster ? userTerrain : enemyTerrain;
    } else if (userTerrain) {
      fieldPatch.terrain = userTerrain;
    } else if (enemyTerrain) {
      fieldPatch.terrain = enemyTerrain;
    }

    // Side abilities - user pokemon
    const userSideKey = SIDE_ABILITY_KEYS[userAb];
    if (userSideKey) userSidePatch[userSideKey] = true;

    // Side abilities - enemy pokemon (they apply to their own side)
    const enemySideKey = SIDE_ABILITY_KEYS[enemyAb];
    if (enemySideKey) enemySidePatch[enemySideKey] = true;

    const hasPatch = Object.keys(fieldPatch).length > 0 ||
                     Object.keys(userSidePatch).length > 0 ||
                     Object.keys(enemySidePatch).length > 0;
    if (!hasPatch) return;

    onChange({
      field:     { ...field,     ...fieldPatch },
      userSide:  { ...userSide,  ...userSidePatch },
      enemySide: { ...enemySide, ...enemySidePatch },
    });
  // Only run when fullStates arrive (entering step 5)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSeedKey, enemyAb, enemySpe, userAb, userSpe]);

  const terrains = [
    { id: 'electric', label: 'Electric', color: '#f8d030' },
    { id: 'grassy',   label: 'Grassy',   color: '#78c850' },
    { id: 'misty',    label: 'Misty',    color: '#f8b8d8' },
    { id: 'psychic',  label: 'Psychic',  color: '#f85888' },
  ];

  const weathers = [
    { id: 'sun',           label: 'Sun',           color: '#f8a040' },
    { id: 'rain',          label: 'Rain',          color: '#6890f0' },
    { id: 'sand',          label: 'Sand',          color: '#c8a060' },
    { id: 'snow',          label: 'Snow',          color: '#98d8d8' },
    { id: 'harshSunshine', label: 'Harsh Sun',     color: '#f86030' },
    { id: 'heavyRain',     label: 'Heavy Rain',    color: '#4040c0' },
    { id: 'strongWinds',   label: 'Strong Winds',  color: '#a8b8d8' },
  ];

  return (
    <div className="field-conditions">

      {/* ── Global conditions card ── */}
      <LiquidGlass borderRadius={20} bezelWidth={24} scale={65} blur={18} saturation={1.7} brightness={0.96} background="rgba(12,12,16,0.28)" style={{}}>
      <div className="fc-card" style={{background:'transparent',border:'none',boxShadow:'none'}}>
        <div className="fc-section-label">Global</div>

        <div className="fc-row">
          <span className="fc-row-label">Format</span>
          {['singles','doubles'].map(f => (
            <Pill key={f} label={f.charAt(0).toUpperCase()+f.slice(1)}
              active={field.format === f} onClick={() => setField({ format: f })} />
          ))}
        </div>

        <div className="fc-row">
          <span className="fc-row-label">Terrain</span>
          {terrains.map(t => (
            <Pill key={t.id} label={t.label} color={t.color} desc={DESCS[t.id]}
              active={field.terrain === t.id}
              onClick={() => setField({ terrain: field.terrain === t.id ? null : t.id })} />
          ))}
        </div>

        <div className="fc-row">
          <span className="fc-row-label">Weather</span>
          <Pill label="None" active={field.weather === null} onClick={() => setField({ weather: null })} />
          {weathers.map(w => (
            <Pill key={w.id} label={w.label} color={w.color} desc={DESCS[w.id]}
              active={field.weather === w.id}
              onClick={() => setField({ weather: w.id })} />
          ))}
        </div>

        <div className="fc-row">
          <span className="fc-row-label">Rooms</span>
          <Toggle label="Magic Room"  active={field.magicRoom}  color="#9060c8" desc={DESCS.magicRoom}  onClick={() => setField({ magicRoom:  !field.magicRoom  })} />
          <Toggle label="Wonder Room" active={field.wonderRoom} color="#6080f0" desc={DESCS.wonderRoom} onClick={() => setField({ wonderRoom: !field.wonderRoom })} />
          <Toggle label="Gravity"     active={field.gravity}    color="#8080a0" desc={DESCS.gravity}    onClick={() => setField({ gravity:    !field.gravity    })} />
        </div>
      </div>
      </LiquidGlass>

      {/* ── Per-side panels ── */}
      <div className="fc-sides">
        <SidePanel title="Your Side"   side={userSide}  onChange={setUserSide}  />
        <SidePanel title="Enemy Side"  side={enemySide} onChange={setEnemySide} />
      </div>

    </div>
  );

}
