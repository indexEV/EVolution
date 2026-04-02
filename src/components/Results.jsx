
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { solveSpreads, toShowdownEvLine, toShowdownSet } from '../solver/solver.js';
import LiquidGlass from './LiquidGlass';
import '../styles/Results.css';

const SPRITE_BASE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork';

const STAT_COLORS = {
  hp: '#D8B8FF',
  atk: '#B8D8FF',
  def: '#98D8B8',
  spa: '#C8E8A0',
  spd: '#F0F080',
  spe: '#F8B860',
};
const STAT_LABELS = { hp: 'HP', atk: 'ATK', def: 'DEF', spa: 'SPA', spd: 'SPD', spe: 'SPE' };
const TYPE_META = {
  shield: { label: 'Survive', color: '#78c850' },
  sword: { label: 'KO', color: '#f85050' },
  scarf: { label: 'Outspeed', color: '#60c8f8' },
};
const STATUS_LABELS = {
  brn: 'Burn',
  psn: 'Poison',
  tox: 'Toxic',
  par: 'Paralysis',
  slp: 'Sleep',
  frz: 'Freeze',
};
const WEATHER_LABELS = {
  sun: 'Sun',
  harshSunshine: 'Harsh Sun',
  rain: 'Rain',
  heavyRain: 'Heavy Rain',
  sand: 'Sandstorm',
  snow: 'Snow',
  strongWinds: 'Strong Winds',
};
const TERRAIN_LABELS = {
  electric: 'Electric Terrain',
  grassy: 'Grassy Terrain',
  psychic: 'Psychic Terrain',
  misty: 'Misty Terrain',
};
const GLOBAL_FIELD_LABELS = {
  gravity: 'Gravity',
  magicRoom: 'Magic Room',
  wonderRoom: 'Wonder Room',
};
const SIDE_FIELD_LABELS = {
  stealthRock: 'Stealth Rock',
  reflect: 'Reflect',
  lightScreen: 'Light Screen',
  auroraVeil: 'Aurora Veil',
  protect: 'Protect',
  leechSeed: 'Leech Seed',
  saltCure: 'Salt Cure',
  foresight: 'Foresight',
  helpingHand: 'Helping Hand',
  tailwind: 'Tailwind',
  flowerGift: 'Flower Gift',
  powerTrick: 'Power Trick',
  steelySpirit: 'Steely Spirit',
  friendGuard: 'Friend Guard',
  battery: 'Battery',
  powerSpot: 'Power Spot',
  switchingOut: 'Switching Out',
  justSwitchedIn: 'Just Switched In',
};
const STAGE_TAG_LABELS = {
  atk: 'Attack',
  def: 'Defense',
  spa: 'Sp. Atk',
  spd: 'Sp. Def',
  spe: 'Speed',
};
const EMPTY_EVS = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
const STAT_ORDER = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
const NATURE_BOOST = {
  Lonely: 'atk', Brave: 'atk', Adamant: 'atk', Naughty: 'atk',
  Bold: 'def', Relaxed: 'def', Impish: 'def', Lax: 'def',
  Timid: 'spe', Jolly: 'spe', Hasty: 'spe', Naive: 'spe',
  Modest: 'spa', Mild: 'spa', Quiet: 'spa', Rash: 'spa',
  Calm: 'spd', Gentle: 'spd', Sassy: 'spd', Careful: 'spd',
};
const NATURE_DROP = {
  Lonely: 'def', Bold: 'atk', Modest: 'atk', Calm: 'atk',
  Brave: 'spe', Relaxed: 'spe', Quiet: 'spe', Sassy: 'spe',
  Adamant: 'spa', Impish: 'spa', Jolly: 'spa', Careful: 'spa',
  Naughty: 'spd', Lax: 'spd', Rash: 'spd', Naive: 'spd',
  Hasty: 'def', Mild: 'def', Gentle: 'def', Timid: 'atk',
};

const normId = (value) => (value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const stageLabel = (stage) => (stage === 0 ? '0' : stage > 0 ? `+${stage}` : `${stage}`);

function totalEvs(evs = EMPTY_EVS) {
  return Object.values({ ...EMPTY_EVS, ...evs }).reduce((sum, value) => sum + (value ?? 0), 0);
}

function buildCalculationBaseSignature({
  userPokemon,
  userFullState,
  userLevel,
  enemyPokemon,
  enemyFullState,
  enemyLevel,
  constraints,
  fieldConditions,
}) {
  return JSON.stringify({
    userPokemonId: userPokemon?.name ?? userPokemon?.num ?? null,
    userLevel: userLevel ?? 100,
    userFullState: userFullState ?? null,
    enemyPokemonId: enemyPokemon?.name ?? enemyPokemon?.num ?? null,
    enemyLevel: enemyLevel ?? 100,
    enemyFullState: enemyFullState ?? null,
    constraints: constraints ?? [],
    fieldConditions: fieldConditions ?? null,
  });
}

function getNatureMultiplier(nature, statKey) {
  if (NATURE_BOOST[nature] === statKey) return 1.1;
  if (NATURE_DROP[nature] === statKey) return 0.9;
  return 1;
}

function calculatePreviewStats(pokemon, fullState, level = 100) {
  if (!pokemon?.baseStats) return null;
  const evs = { ...EMPTY_EVS, ...(fullState?.evs ?? EMPTY_EVS) };
  const ivs = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31, ...(fullState?.ivs ?? {}) };
  const nature = fullState?.nature ?? 'Hardy';

  const hp = Math.floor(((2 * pokemon.baseStats.hp + (ivs.hp ?? 31) + Math.floor((evs.hp ?? 0) / 4)) * level) / 100) + level + 10;
  const calcOther = (statKey) => Math.floor(
    (Math.floor(((2 * pokemon.baseStats[statKey] + (ivs[statKey] ?? 31) + Math.floor((evs[statKey] ?? 0) / 4)) * level) / 100) + 5) *
    getNatureMultiplier(nature, statKey)
  );

  return {
    hp,
    atk: calcOther('atk'),
    def: calcOther('def'),
    spa: calcOther('spa'),
    spd: calcOther('spd'),
    spe: calcOther('spe'),
  };
}

function getThreatForConstraint(constraint, enemyPokemon, enemyFullState, enemyLevel) {
  if (constraint.opponentSource === 'custom' && constraint.customThreat) {
    return {
      key: constraint.customThreat.id ?? constraint.id,
      source: 'custom',
      pokemon: constraint.customThreat.pokemon,
      fullState: constraint.customThreat.fullState,
      level: 100,
      fieldConditions: constraint.customThreat.fieldConditions,
    };
  }

  return {
    key: 'existing-enemy',
    source: 'existing',
    pokemon: enemyPokemon,
    fullState: enemyFullState,
    level: enemyLevel,
    fieldConditions: null,
  };
}

function getFieldTags(fieldConditions) {
  const tags = [];
  const field = fieldConditions?.field ?? {};
  const userSide = fieldConditions?.userSide ?? {};
  const enemySide = fieldConditions?.enemySide ?? {};

  if (field.format === 'doubles') tags.push('Doubles');
  if (WEATHER_LABELS[field.weather]) tags.push(WEATHER_LABELS[field.weather]);
  if (TERRAIN_LABELS[field.terrain]) tags.push(TERRAIN_LABELS[field.terrain]);

  Object.entries(GLOBAL_FIELD_LABELS).forEach(([key, label]) => {
    if (field[key]) tags.push(label);
  });

  [
    ['Your', userSide],
    ['Their', enemySide],
  ].forEach(([prefix, side]) => {
    if ((side.spikes ?? 0) > 0) tags.push(`${prefix} ${side.spikes}x Spikes`);
    if ((side.toxicSpikes ?? 0) > 0) tags.push(`${prefix} ${side.toxicSpikes}x Toxic Spikes`);

    Object.entries(SIDE_FIELD_LABELS).forEach(([key, label]) => {
      if (side[key]) tags.push(`${prefix} ${label}`);
    });
  });

  return [...new Set(tags)];
}

function getStageTags(stages, keys = ['atk', 'def', 'spa', 'spd', 'spe']) {
  return keys
    .filter((key) => (stages?.[key] ?? 0) !== 0)
    .map((key) => `${stageLabel(stages[key])} ${STAGE_TAG_LABELS[key]}`);
}

function getAbilitySummary(fullState, fieldConditions, speedOnly = false) {
  const abilityName = fullState?.ability;
  if (!abilityName) return null;

  const abilityId = normId(abilityName);
  const weather = fieldConditions?.field?.weather;
  const terrain = fieldConditions?.field?.terrain;
  const itemId = normId(fullState?.item?.name);
  const status = fullState?.status ?? null;

  if (abilityId === 'guts' && status) return 'Guts active';
  if (abilityId === 'quickfeet' && status) return 'Quick Feet active';
  if (abilityId === 'poisonheal' && ['psn', 'tox'].includes(status)) return 'Poison Heal';
  if (abilityId === 'protosynthesis' && (weather === 'sun' || weather === 'harshSunshine' || itemId === 'boosterenergy')) return 'Protosynthesis';
  if (abilityId === 'quarkdrive' && (terrain === 'electric' || itemId === 'boosterenergy')) return 'Quark Drive';

  if (speedOnly) {
    if (['chlorophyll', 'swiftswim', 'sandrush', 'slushrush', 'surgesurfer', 'unburden', 'slowstart'].includes(abilityId)) {
      return abilityName;
    }
    return null;
  }

  return abilityName;
}

function getStateTags(fullState, fieldConditions, { speedOnly = false, omitItem = false, omitSpeedStage = false } = {}) {
  const tags = [];
  const abilitySummary = getAbilitySummary(fullState, fieldConditions, speedOnly);
  const status = STATUS_LABELS[fullState?.status];

  if (abilitySummary) tags.push(abilitySummary);
  if (!omitItem && fullState?.item?.name) tags.push(fullState.item.name);
  if (status) tags.push(status);

  if (speedOnly) {
    if (!omitSpeedStage) tags.push(...getStageTags(fullState?.stages, ['spe']));
  } else {
    tags.push(...getStageTags(fullState?.stages));
  }

  return [...new Set(tags)];
}

function getIvSummary(ivs = {}) {
  const changed = Object.entries(ivs)
    .filter(([, value]) => value !== 31 && value !== undefined && value !== null)
    .map(([key, value]) => `${value} ${STAT_LABELS[key]}`);

  return changed.length > 0 ? changed.join(' / ') : 'All 31 IVs';
}

function getUniqueThreats(constraints, enemyPokemon, enemyFullState, enemyLevel) {
  const seen = new Map();

  constraints.forEach((constraint) => {
    const threat = getThreatForConstraint(constraint, enemyPokemon, enemyFullState, enemyLevel);
    if (!threat?.pokemon || !threat?.fullState || seen.has(threat.key)) return;
    seen.set(threat.key, threat);
  });

  return [...seen.values()];
}

function getConstraintLabel(constraint, userFullState, enemyPokemon, enemyFullState, enemyLevel) {
  const typeLabel = TYPE_META[constraint.type]?.label ?? 'Constraint';
  return `${typeLabel}: ${getConstraintGoal(constraint, userFullState, enemyPokemon, enemyFullState, enemyLevel)}`;
}

function getConstraintGoal(constraint, userFullState, enemyPokemon, enemyFullState, enemyLevel) {
  const threat = getThreatForConstraint(constraint, enemyPokemon, enemyFullState, enemyLevel);
  const threatName = threat?.pokemon?.name ?? 'the target';
  const enemyMoveName = threat?.fullState?.moves?.[constraint.enemyMoveIndex]?.name ?? 'the selected move';
  const userMoveName = userFullState?.moves?.[constraint.userMoveIndex]?.name ?? 'the selected move';

  if (constraint.type === 'shield') {
    if (constraint.survive === '4hko') return `Avoid a guaranteed 4HKO from ${enemyMoveName} by ${threatName}.`;
    if (constraint.survive === '1hko') return `Survive ${enemyMoveName} from ${threatName}.`;
    return `Survive ${constraint.survive === '2hko' ? '2 hits' : '3 hits'} of ${enemyMoveName} from ${threatName}.`;
  }

  if (constraint.type === 'sword') {
    const hits = constraint.achieve === '1hko' ? '1 hit' : constraint.achieve === '2hko' ? '2 hits' : '3 hits';
    return `KO ${threatName} with ${userMoveName} in ${hits}.`;
  }

  return `Outspeed ${threatName}.`;
}

function getSmartUnlockedStats(constraints, userFullState, enemyPokemon, enemyFullState, enemyLevel) {
  const next = { hp: false, atk: false, def: false, spa: false, spd: false, spe: false };

  constraints.forEach((constraint) => {
    if (constraint.type === 'shield') {
      const threat = getThreatForConstraint(constraint, enemyPokemon, enemyFullState, enemyLevel);
      const moveCategory = threat?.fullState?.moves?.[constraint.enemyMoveIndex]?.category;
      next.hp = true;
      if (moveCategory === 'Special') next.spd = true;
      else if (moveCategory === 'Physical') next.def = true;
      else {
        next.def = true;
        next.spd = true;
      }
    } else if (constraint.type === 'sword') {
      const moveCategory = userFullState?.moves?.[constraint.userMoveIndex]?.category;
      if (moveCategory === 'Special') next.spa = true;
      else if (moveCategory === 'Physical') next.atk = true;
      else {
        next.atk = true;
        next.spa = true;
      }
    } else if (constraint.type === 'scarf') {
      next.spe = true;
    }
  });

  return next;
}

function getConstraintAssumptions(constraint, userFullState, enemyPokemon, enemyFullState, enemyLevel, fieldConditions) {
  const threat = getThreatForConstraint(constraint, enemyPokemon, enemyFullState, enemyLevel);
  const effectiveField = threat?.source === 'custom' ? (threat.fieldConditions ?? fieldConditions) : fieldConditions;
  const fieldLabel = threat?.source === 'custom' ? 'Threat-local field' : 'Current field';

  if (constraint.type === 'scarf') {
    const userBaseSpe = userFullState?.stages?.spe ?? 0;
    const threatBaseSpe = threat?.fullState?.stages?.spe ?? 0;
    const fieldTags = getFieldTags(effectiveField).filter((tag) => tag !== 'Your Tailwind' && tag !== 'Their Tailwind');
    const mySpeedTags = [];
    const theirSpeedTags = [];

    const yourStageTotal = userBaseSpe + (constraint.yourExtraStage ?? 0) + (constraint.yourIcyWind ? -1 : 0);
    const theirStageTotal = threatBaseSpe + (constraint.theirExtraStage ?? 0) + (constraint.theirIcyWind ? -1 : 0);

    if (yourStageTotal !== 0) mySpeedTags.push(`Speed ${stageLabel(yourStageTotal)}`);
    if (constraint.yourTailwind) mySpeedTags.push('Tailwind');
    if (constraint.yourScarf) mySpeedTags.push('Choice Scarf');
    if (constraint.yourIcyWind) mySpeedTags.push('Icy Wind');
    mySpeedTags.push(...getStateTags(userFullState, effectiveField, { speedOnly: true, omitItem: constraint.yourScarf, omitSpeedStage: true }));

    if (theirStageTotal !== 0) theirSpeedTags.push(`Speed ${stageLabel(theirStageTotal)}`);
    if (constraint.theirTailwind) theirSpeedTags.push('Tailwind');
    if (constraint.theirScarf) theirSpeedTags.push('Choice Scarf');
    if (constraint.theirIcyWind) theirSpeedTags.push('Icy Wind');
    theirSpeedTags.push(...getStateTags(threat?.fullState, effectiveField, { speedOnly: true, omitItem: constraint.theirScarf, omitSpeedStage: true }));

    return [
      { label: 'My speed assumptions', tags: [...new Set(mySpeedTags)] },
      { label: 'Their speed assumptions', tags: [...new Set(theirSpeedTags)] },
      { label: fieldLabel, tags: fieldTags.length > 0 ? fieldTags : ['Neutral field'] },
    ];
  }

  const fieldTags = getFieldTags(effectiveField);
  const myStateTags = getStateTags(userFullState, effectiveField);
  const theirStateTags = getStateTags(threat?.fullState, effectiveField);

  return [
    { label: fieldLabel, tags: fieldTags.length > 0 ? fieldTags : ['Neutral field'] },
    ...(myStateTags.length > 0 ? [{ label: 'My state', tags: myStateTags }] : []),
    ...(theirStateTags.length > 0 ? [{ label: 'Their state', tags: theirStateTags }] : []),
  ];
}

function StatPill({ stat, value }) {
  if (!value) return null;
  return (
    <span className="result-stat-pill" style={{ '--stat-color': STAT_COLORS[stat] }}>
      <span className="result-stat-name">{STAT_LABELS[stat]}</span>
      <span className="result-stat-val">{value}</span>
    </span>
  );
}

function CopyBtn({ text, label = 'Copy' }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <button className={`result-copy-btn ${copied ? 'copied' : ''}`} onClick={handleCopy}>
      {copied ? 'Copied' : label}
    </button>
  );
}

function ConstraintResult({ cr }) {
  const { c, passed, desc, range, threat } = cr;
  const typeLabel = c.type === 'shield' ? 'SURVIVE' : c.type === 'sword' ? 'KO' : 'OUTSPEED';
  const typeColor = c.type === 'shield' ? '#78c850' : c.type === 'sword' ? '#f85050' : '#60c8f8';

  return (
    <div className={`cr-row ${passed ? 'cr-pass' : 'cr-fail'}`}>
      <span className="cr-icon">{passed ? 'OK' : 'X'}</span>
      <span className="cr-type" style={{ color: typeColor }}>{typeLabel}</span>
      {threat && <span className="cr-threat">{threat.name}</span>}
      <span className="cr-desc">{desc}</span>
      {range && <span className={`cr-range ${c.type === 'sword' ? 'offensive' : ''}`}>{range}</span>}
    </div>
  );
}

function SpreadCard({ spread, userPokemon, userFullState, userLevel, isMin }) {
  const { evs, total, remaining, added, constraintResults, allPassed, nature } = spread;
  const exportState = nature ? { ...userFullState, nature } : userFullState;
  const showdown = toShowdownSet(userPokemon, exportState, evs, userLevel);
  const evLine = toShowdownEvLine(evs);

  return (
    <div className={`spread-card ${allPassed ? '' : 'spread-fail'} ${isMin ? 'spread-min' : ''}`}>
      <div className="spread-card-header">
        <div className="spread-header-left">
          {isMin && <span className="spread-badge-min">MINIMUM</span>}
          {allPassed
            ? <span className="spread-badge-ok">All constraints pass</span>
            : <span className="spread-badge-fail">Constraints not met</span>}
        </div>
        <div className="spread-header-right">
          <span className="spread-total">{total} EVs used</span>
          {added > 0 && (
            <span className="spread-added">+{added} added</span>
          )}
          {nature && nature !== userFullState?.nature && (
            <span className="spread-added">{nature} Nature</span>
          )}
          {remaining > 0 && (
            <span className="spread-remaining">+{remaining} free</span>
          )}
          <CopyBtn text={showdown} label="Copy Set" />
          <CopyBtn text={evLine || '(no EVs)'} label="Copy EVs" />
        </div>
      </div>

      <div className="spread-stats">
        {Object.entries(evs).map(([stat, val]) => (
          val > 0 ? <StatPill key={stat} stat={stat} value={val} /> : null
        ))}
        {total === 0 && <span className="spread-no-evs">No EVs required</span>}
      </div>

      {remaining > 0 && (
        <div className="spread-suggestions">
          <span className="spread-suggestions-label">Free EV ideas:</span>
          <span className="spread-suggestion">dump in HP</span>
          <span className="spread-suggestion-sep">.</span>
          <span className="spread-suggestion">dump in Speed</span>
          <span className="spread-suggestion-sep">.</span>
          <span className="spread-suggestion">split bulk</span>
        </div>
      )}

      <div className="spread-constraints">
        {constraintResults.map((cr, i) => (
          <ConstraintResult key={i} cr={cr} />
        ))}
      </div>
    </div>
  );
}

function GlassPanel({ className = '', innerClassName = '', children }) {
  return (
    <LiquidGlass
      borderRadius={18}
      bezelWidth={24}
      scale={68}
      hoverScaleMultiplier={1}
      blur={22}
      saturation={1.8}
      brightness={0.95}
      background="rgba(12,12,16,0.3)"
      hoverBackground="rgba(18,18,24,0.36)"
      hoverBrightness={1.02}
      className={className}
    >
      <div className={innerClassName}>{children}</div>
    </LiquidGlass>
  );
}

function ControlSelect({ value, onChange, options, placeholder = 'Select' }) {
  const [open, setOpen] = useState(false);
  const shellRef = useRef(null);
  const selected = options.find((option) => String(option.value) === String(value));

  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event) => {
      if (!shellRef.current?.contains(event.target)) setOpen(false);
    };
    const handleEscape = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  return (
    <div className={`results-select-shell ${open ? 'open' : ''}`} ref={shellRef}>
      <LiquidGlass
        borderRadius={14}
        bezelWidth={18}
        scale={50}
        hoverScaleMultiplier={1}
        blur={18}
        saturation={1.75}
        brightness={0.95}
        background="rgba(12,12,16,0.28)"
        hoverBackground="rgba(18,18,24,0.36)"
        hoverBrightness={1.02}
        className="results-select-glass"
      >
        <div className="results-select-inner">
          <button
            type="button"
            className="results-control-select-trigger"
            onClick={() => setOpen((current) => !current)}
            aria-haspopup="listbox"
            aria-expanded={open}
          >
            <span className="results-control-select-value">{selected?.label ?? placeholder}</span>
            <span className="results-select-caret" aria-hidden="true" />
          </button>
        </div>
      </LiquidGlass>

      {open && (
        <div className="results-select-menu" role="listbox">
          {options.map((option) => {
            const active = String(option.value) === String(value);
            return (
              <button
                key={option.value}
                type="button"
                className={`results-select-option ${active ? 'active' : ''}`}
                onClick={() => {
                  onChange({ target: { value: String(option.value) } });
                  setOpen(false);
                }}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatToggleButton({ statKey, unlocked, lockedValue, previewValue, onToggle }) {
  return (
    <button
      type="button"
      className={`results-stat-toggle ${unlocked ? 'unlocked' : 'locked'}`}
      style={{ '--stat-color': STAT_COLORS[statKey] }}
      onClick={onToggle}
    >
      <span className="results-stat-toggle-main">
        <span className="results-stat-toggle-name">{STAT_LABELS[statKey]}</span>
        <span className="results-stat-toggle-value">{previewValue}</span>
      </span>
      <span className="results-stat-toggle-meta">
        <span className="results-stat-toggle-note">{lockedValue} EVs fixed</span>
        <span className="results-stat-toggle-state">{unlocked ? 'Brute force on' : 'Locked'}</span>
      </span>
    </button>
  );
}

function ResultsControlPanel({
  userPokemon,
  userFullState,
  userLevel,
  lockedEvs,
  remainingBudget,
  unlockedStats,
  smartUnlockedStats,
  onToggleStat,
  onResetStats,
  optimizeNature,
  onToggleNatureOptimization,
}) {
  const previewStats = calculatePreviewStats(userPokemon, userFullState, userLevel);
  const statsMatchSmartDefaults = STAT_ORDER.every((statKey) => unlockedStats[statKey] === smartUnlockedStats[statKey]);

  return (
    <GlassPanel className="results-controls-card" innerClassName="results-controls-card-inner">
      <div className="results-controls-header">
        <div>
          <span className="results-section-kicker">Step 7 Controls</span>
          <h3>Configure the brute force</h3>
        </div>
        <div className="results-budget-strip">
          <span>Remaining EV budget</span>
          <strong>{remainingBudget}</strong>
        </div>
      </div>

      <div className="results-controls-grid">
        <div className="results-control-block">
          <div className="results-control-copy">
            <span className="results-control-title">Stat lock preview</span>
            <p>These are your current Step 2 stats. Click a row to allow or block brute-force EV changes on that stat.</p>
          </div>
          <div className="results-stat-toggle-grid">
            {STAT_ORDER.map((statKey) => (
              <StatToggleButton
                key={statKey}
                statKey={statKey}
                unlocked={unlockedStats[statKey]}
                lockedValue={lockedEvs[statKey] ?? 0}
                previewValue={previewStats?.[statKey] ?? '--'}
                onToggle={() => onToggleStat(statKey)}
              />
            ))}
          </div>
          <button
            type="button"
            className={`results-nature-lock ${optimizeNature ? 'unlocked' : 'locked'}`}
            onClick={onToggleNatureOptimization}
          >
            <span className="results-nature-lock-copy">
              <span className="results-nature-lock-title">Nature</span>
              <span className="results-nature-lock-value">{userFullState?.nature ?? 'Hardy'} Nature</span>
            </span>
            <span className="results-nature-lock-state">{optimizeNature ? 'Brute force on' : 'Locked by default'}</span>
          </button>
          <div className="results-control-inline-row">
            <span className="results-inline-note">
              Step 2 EVs remain fixed. Smart default unlocked stats come from your active constraints.
            </span>
            <button
              type="button"
              className="results-ghost-btn"
              onClick={onResetStats}
              disabled={statsMatchSmartDefaults}
            >
              Use smart defaults
            </button>
          </div>
        </div>

        <div className="results-control-block">
          <div className="results-control-copy">
            <span className="results-control-title">Result ordering</span>
            <p>After calculation, sort the generated spreads by minimum EVs or by strongest overall guarantee.</p>
          </div>
          <div className="results-inline-note">
            Accuracy sorting uses the actual per-constraint result quality that was calculated for each spread.
          </div>
          <div className="results-inline-note results-inline-note-strong">
            Use the top navigation Calculate button when you’re ready to run the search.
          </div>
        </div>
      </div>
    </GlassPanel>
  );
}

function ResultTag({ children }) {
  return <span className="results-tag">{children}</span>;
}

function getSpreadAccuracyMetrics(spread) {
  const rates = (spread?.constraintResults ?? [])
    .map((result) => result?.successRate)
    .filter((value) => typeof value === 'number');

  if (rates.length === 0) return { minRate: 0, avgRate: 0 };

  return {
    minRate: Math.min(...rates),
    avgRate: rates.reduce((sum, value) => sum + value, 0) / rates.length,
  };
}

function ThreatCard({ threat, fieldConditions }) {
  const tags = getStateTags(threat.fullState, threat.source === 'custom' ? threat.fieldConditions : fieldConditions);

  return (
    <div className="results-threat-card">
      <div className="results-threat-header">
        {threat.pokemon?.num ? (
          <img
            src={`${SPRITE_BASE}/${threat.pokemon.num}.png`}
            alt=""
            className="results-threat-sprite"
            onError={(event) => { event.target.style.display = 'none'; }}
          />
        ) : null}
        <div className="results-threat-copy">
          <span className="results-threat-name">{threat.pokemon?.name ?? 'Threat'}</span>
          <span className="results-threat-meta">
            {threat.source === 'custom' ? 'Custom threat' : 'Existing enemy'}
            {threat.level !== 100 ? ` - Lv. ${threat.level}` : ''}
          </span>
        </div>
      </div>
      <div className="results-tag-list">
        {tags.length > 0 ? tags.map((tag) => <ResultTag key={tag}>{tag}</ResultTag>) : <ResultTag>Neutral state</ResultTag>}
      </div>
    </div>
  );
}

function ConstraintSummaryCard({ constraint, userFullState, enemyPokemon, enemyFullState, enemyLevel, fieldConditions }) {
  const typeMeta = TYPE_META[constraint.type] ?? TYPE_META.shield;
  const goal = getConstraintGoal(constraint, userFullState, enemyPokemon, enemyFullState, enemyLevel);
  const groups = getConstraintAssumptions(constraint, userFullState, enemyPokemon, enemyFullState, enemyLevel, fieldConditions);

  return (
    <div className="results-constraint-card" style={{ '--constraint-color': typeMeta.color }}>
      <div className="results-constraint-header">
        <span className="results-constraint-type">{typeMeta.label}</span>
      </div>
      <p className="results-constraint-goal">{goal}</p>
      <div className="results-constraint-assumptions">
        {groups.map((group) => (
          <div key={group.label} className="results-assumption-row">
            <span className="results-assumption-label">{group.label}</span>
            <div className="results-tag-list">
              {group.tags.length > 0
                ? group.tags.map((tag) => <ResultTag key={`${group.label}-${tag}`}>{tag}</ResultTag>)
                : <ResultTag>None</ResultTag>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ResultsRecap({
  userPokemon,
  userFullState,
  userLevel,
  enemyPokemon,
  enemyFullState,
  enemyLevel,
  constraints,
  fieldConditions,
  result,
}) {
  const lockedEvs = { ...EMPTY_EVS, ...(userFullState?.evs ?? EMPTY_EVS) };
  const lockedTotal = result?.lockedTotal ?? totalEvs(lockedEvs);
  const remainingBudget = result?.remainingBudget ?? Math.max(0, 510 - lockedTotal);
  const threats = getUniqueThreats(constraints, enemyPokemon, enemyFullState, enemyLevel);
  const userStateTags = getStateTags(userFullState, fieldConditions);
  const fieldTags = getFieldTags(fieldConditions);

  return (
    <div className="results-summary-card">
      <div className="results-summary-primary">
        <div className="results-section-heading">
          <span className="results-section-kicker">Step 7</span>
          <h3>{userPokemon?.name ?? 'Pokemon'} brute-force setup</h3>
        </div>
        <div className="results-tag-list">
          <ResultTag>{constraints.length} constraint{constraints.length !== 1 ? 's' : ''}</ResultTag>
          <ResultTag>{threats.length} threat{threats.length !== 1 ? 's' : ''}</ResultTag>
          <ResultTag>{lockedTotal}/510 EVs locked</ResultTag>
          <ResultTag>{remainingBudget} EVs left</ResultTag>
          {userLevel !== 100 && <ResultTag>Lv. {userLevel}</ResultTag>}
        </div>
      </div>

      <div className="results-summary-secondary">
        <div className="results-tag-list">
          {userFullState?.ability && <ResultTag>{userFullState.ability}</ResultTag>}
          {userFullState?.item?.name && <ResultTag>{userFullState.item.name}</ResultTag>}
          {userFullState?.nature && <ResultTag>{userFullState.nature} Nature</ResultTag>}
          {userStateTags.map((tag) => <ResultTag key={tag}>{tag}</ResultTag>)}
          {(fieldTags.length > 0 ? fieldTags : ['Neutral field']).map((tag) => <ResultTag key={tag}>{tag}</ResultTag>)}
        </div>
        <div className="results-support-text">
          Enemy Pokemon, enemy EVs, enemy moves, and threat-local assumptions stay fixed. Only your Pokemon&apos;s remaining EV budget is optimized.
        </div>
        <div className="results-support-text">IVs: {getIvSummary(userFullState?.ivs ?? {})}</div>
      </div>
    </div>
  );
}

export default function Results({
  userPokemon,
  userFullState,
  userLevel,
  enemyPokemon,
  enemyFullState,
  enemyLevel,
  constraints,
  fieldConditions,
  calculateToken,
  onCalculatingChange,
  canCalculate,
  isCalculating,
  onRequestCalculate,
}) {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [progressValue, setProgressValue] = useState(0);
  const [progressLabel, setProgressLabel] = useState('Preparing calculation...');
  const [error, setError] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const smartUnlockedStats = getSmartUnlockedStats(constraints, userFullState, enemyPokemon, enemyFullState, enemyLevel);
  const smartUnlockedSignature = STAT_ORDER.map((statKey) => (smartUnlockedStats[statKey] ? '1' : '0')).join('');
  const calculationBaseSignature = buildCalculationBaseSignature({
    userPokemon,
    userFullState,
    userLevel,
    enemyPokemon,
    enemyFullState,
    enemyLevel,
    constraints,
    fieldConditions,
  });
  const [unlockedStats, setUnlockedStats] = useState(smartUnlockedStats);
  const [statsCustomized, setStatsCustomized] = useState(false);
  const [sortMode, setSortMode] = useState('minimum');
  const [optimizeNature, setOptimizeNature] = useState(true);
  const previousBaseSignatureRef = useRef(calculationBaseSignature);

  useEffect(() => {
    if (!loading) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [loading]);

  useEffect(() => {
    if (!statsCustomized) {
      setUnlockedStats((current) => {
        const same = STAT_ORDER.every((statKey) => current[statKey] === smartUnlockedStats[statKey]);
        return same ? current : smartUnlockedStats;
      });
    }
  }, [smartUnlockedSignature, statsCustomized]);

  useEffect(() => {
    if (!calculateToken) return undefined;
    if (!userPokemon || !userFullState || !enemyPokemon || !enemyFullState || constraints.length === 0) return undefined;

    let cancelled = false;
    const MIN_VISIBLE_MS = 1400;
    const CALC_START_DELAY_MS = 60;
    const FINISH_ANIMATION_MS = 220;
    let progressInterval = null;
    let calcTimeout = null;
    let finishTimeout = null;
    const startedAt = performance.now();

    setLoading(true);
    setProgressValue(8);
    setProgressLabel('Preparing brute force...');
    setError(null);
    setShowAll(false);
    onCalculatingChange?.(true);

    progressInterval = window.setInterval(() => {
      setProgressValue((current) => {
        if (current >= 92) return current;
        const next = current + Math.max(1.5, (94 - current) * 0.09);
        return Math.min(92, next);
      });
    }, 90);

    // Defer so the overlay paints before the synchronous solver starts.
    calcTimeout = window.setTimeout(() => {
      try {
        if (!cancelled) setProgressLabel('Searching legal EV spreads...');
        const nextResult = solveSpreads({
          userPokemon,
          userFullState,
          userLevel,
          enemyPokemon,
          enemyFullState,
            enemyLevel,
            constraints,
            fieldConditions,
            unlockedStats,
            optimizeNature,
          });
        if (cancelled) return;

        const elapsed = performance.now() - startedAt;
        const waitForMinimum = Math.max(0, MIN_VISIBLE_MS - elapsed);
        const hasValidSpreads = (nextResult?.spreads ?? []).some((spread) => spread.allPassed);

        setProgressLabel(hasValidSpreads ? 'Finalizing results...' : 'Finalizing report...');
        setProgressValue(100);

        finishTimeout = window.setTimeout(() => {
          if (cancelled) return;
          if (progressInterval) window.clearInterval(progressInterval);
          setResult(nextResult);
          setLoading(false);
          setProgressValue(0);
          onCalculatingChange?.(false);
        }, waitForMinimum + FINISH_ANIMATION_MS);
      } catch (calcError) {
        if (cancelled) return;
        const elapsed = performance.now() - startedAt;
        const waitForMinimum = Math.max(0, MIN_VISIBLE_MS - elapsed);
        setProgressLabel('Unable to finish calculation.');
        setProgressValue(100);
        finishTimeout = window.setTimeout(() => {
          if (cancelled) return;
          if (progressInterval) window.clearInterval(progressInterval);
          setError(calcError.message || 'Unknown error during calculation.');
          setLoading(false);
          setProgressValue(0);
          onCalculatingChange?.(false);
        }, waitForMinimum + FINISH_ANIMATION_MS);
      }
    }, CALC_START_DELAY_MS);

    return () => {
      cancelled = true;
      if (progressInterval) window.clearInterval(progressInterval);
      if (calcTimeout) window.clearTimeout(calcTimeout);
      if (finishTimeout) window.clearTimeout(finishTimeout);
      onCalculatingChange?.(false);
    };
  }, [calculateToken, onCalculatingChange]);

  useEffect(() => {
    const previousSignature = previousBaseSignatureRef.current;
    previousBaseSignatureRef.current = calculationBaseSignature;

    if (previousSignature === calculationBaseSignature) return;

    setResult(null);
    setError(null);
    setShowAll(false);

    if (!loading) {
      setProgressValue(0);
      setProgressLabel('Preparing calculation...');
      onCalculatingChange?.(false);
    }
  }, [calculationBaseSignature, loading, onCalculatingChange]);

  useEffect(() => {
    setResult(null);
    setShowAll(false);
  }, [unlockedStats, optimizeNature]);

  useEffect(() => () => onCalculatingChange?.(false), [onCalculatingChange]);

  const spreads = result?.spreads ?? [];
  const impossible = result?.impossible ?? [];
  const validSpreads = [...spreads.filter((spread) => spread.allPassed)].sort((a, b) => {
    if (sortMode === 'accuracy') {
      const aMetrics = getSpreadAccuracyMetrics(a);
      const bMetrics = getSpreadAccuracyMetrics(b);
      if (aMetrics.minRate !== bMetrics.minRate) return bMetrics.minRate - aMetrics.minRate;
      if (aMetrics.avgRate !== bMetrics.avgRate) return bMetrics.avgRate - aMetrics.avgRate;
    }
    if (a.total !== b.total) return a.total - b.total;
    return (a.added ?? 0) - (b.added ?? 0);
  });
  const displayedSpreads = showAll ? validSpreads : validSpreads.slice(0, 5);
  const lockedEvs = result?.lockedEvs ?? { ...EMPTY_EVS, ...(userFullState?.evs ?? EMPTY_EVS) };
  const remainingBudget = result?.remainingBudget ?? Math.max(0, 510 - totalEvs(lockedEvs));

  const toggleStat = (statKey) => {
    setStatsCustomized(true);
    setUnlockedStats((current) => ({ ...current, [statKey]: !current[statKey] }));
  };

  const resetUnlockedStats = () => {
    setStatsCustomized(false);
    setUnlockedStats(smartUnlockedStats);
  };

  const loadingOverlay = loading ? createPortal(
    <div className="results-loading-overlay" role="status" aria-live="polite">
      <div className="results-loading-backdrop" />
      <div className="results-loading-panel">
        <div className="results-loading-copy">
          <span className="results-loading-kicker">Step 7</span>
          <h3>Calculating your EV spread</h3>
          <p>{progressLabel}</p>
        </div>
        <div className="results-loading-bar">
          <div className="results-loading-bar-fill" style={{ width: `${progressValue}%` }} />
        </div>
        <div className="results-loading-meta">
          <div className="results-spinner" />
          <span>{Math.round(progressValue)}%</span>
        </div>
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <div className="results">
      {loadingOverlay}
      <ResultsControlPanel
        userPokemon={userPokemon}
        userFullState={userFullState}
        userLevel={userLevel}
        lockedEvs={lockedEvs}
        remainingBudget={remainingBudget}
        unlockedStats={unlockedStats}
        smartUnlockedStats={smartUnlockedStats}
        onToggleStat={toggleStat}
        onResetStats={resetUnlockedStats}
        optimizeNature={optimizeNature}
        onToggleNatureOptimization={() => setOptimizeNature((current) => !current)}
      />

      {error && (
        <div className="results-error">
          <span>Error: {error}</span>
        </div>
      )}

      {!loading && result && (
        <>
          {/* Impossible constraints */}
          {impossible.length > 0 && (
            <div className="results-impossible">
              <div className="results-impossible-title">Impossible constraints under the current locked setup</div>
              {impossible.map((imp, i) => (
                <div key={i} className="results-impossible-row">
                  {imp.reason}
                </div>
              ))}
            </div>
          )}

          {/* Summary banner */}
          {validSpreads.length > 0 ? (
            <div className="results-banner results-banner-ok">
              <span className="results-banner-count">{validSpreads.length} valid spread{validSpreads.length !== 1 ? 's' : ''} found</span>
              <span className="results-banner-sub">
                {sortMode === 'accuracy'
                  ? 'Sorted by strongest overall guarantee first, then by minimum EVs.'
                  : 'Sorted by minimum total EVs used while preserving the EVs already locked in Step 2.'}
              </span>
            </div>
          ) : (
            <div className="results-banner results-banner-fail">
              <span>No valid EV spread was found that satisfies every active constraint under the current locked EVs and assumptions.</span>
            </div>
          )}

          {validSpreads.length > 0 && (
            <div className="results-control-inline-row">
              <span className="results-inline-note">Sort valid results by:</span>
              <div style={{ minWidth: 240 }}>
                <ControlSelect
                  value={sortMode}
                  onChange={(event) => setSortMode(event.target.value)}
                  options={[
                    { value: 'minimum', label: 'Minimum EVs' },
                    { value: 'accuracy', label: 'Accuracy / guarantee' },
                  ]}
                  placeholder="Sort results"
                />
              </div>
            </div>
          )}

          {/* Spread cards */}
          <div className="results-spreads">
            {displayedSpreads.map((s, i) => (
              <SpreadCard
                key={i}
                spread={s}
                userPokemon={userPokemon}
                userFullState={userFullState}
                userLevel={userLevel}
                isMin={i === 0}
              />
            ))}
          </div>

          {validSpreads.length > 5 && (
            <button className="results-show-more" onClick={() => setShowAll(v => !v)}>
              {showAll ? 'Show less' : `Show all ${validSpreads.length} spreads`}
            </button>
          )}

          {validSpreads.length === 0 && impossible.length === 0 && spreads.length > 0 && (
            <div className="results-partial">
              <p>Partial spreads found but they don't pass all constraints. Try relaxing some requirements.</p>
              {spreads.slice(0, 3).map((s, i) => (
                <SpreadCard
                  key={i}
                  spread={s}
                  userPokemon={userPokemon}
                  userFullState={userFullState}
                  userLevel={userLevel}
                  isMin={false}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
