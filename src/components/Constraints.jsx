import { useState, useEffect, useRef } from 'react';
import ThreatModal from './ThreatModal';
import '../styles/Constraints.css';
import RustedShieldImg  from '../assets/RustedShield.png';
import RustedSwordImg   from '../assets/RustedSword.png';
import ChoiceScarfImg   from '../assets/ChoiceScarf.png';

const SPRITE_BASE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork';
const ATK_COLOR = '#B8D8FF';
const SPE_COLOR = '#F8B860';

const TYPE_META = {
  shield: { img: RustedShieldImg, label: 'Survive',  color: '#78c850', accent: 'rgba(120,200,80,0.07)'  },
  sword:  { img: RustedSwordImg,  label: 'KO',       color: '#f85050', accent: 'rgba(248,80,80,0.07)'   },
  scarf:  { img: ChoiceScarfImg,  label: 'Outspeed', color: '#60c8f8', accent: 'rgba(96,200,248,0.07)'  },
};

const clamp = (v, min = -6, max = 6) => Math.max(min, Math.min(max, v));
const stageLabel = (s) => s === 0 ? '0' : s > 0 ? `+${s}` : `${s}`;
const normId = (s) => (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

function getMoves(fullState) {
  if (!fullState?.moves) return [];
  return fullState.moves.map((m, i) => ({
    index: i,
    name: m?.name ?? null,
    category: m?.category ?? null,
  }));
}

function getAbilityId(fullState) {
  return normId(fullState?.ability ?? '');
}

function hasAbility(fullState, name) { return getAbilityId(fullState) === normId(name); }

function hasItem(fullState, name) {
  return normId(fullState?.item?.name ?? '') === normId(name);
}

const SURVIVE_OPTIONS = [
  { value: '1hko', label: '1 hit' },
  { value: '2hko', label: '2 hits' },
  { value: '3hko', label: '3 hits' },
  { value: '4hko', label: '4+ hits' },
];

const KO_OPTIONS = [
  { value: '1hko', label: '1 hit' },
  { value: '2hko', label: '2 hits' },
  { value: '3hko', label: '3 hits' },
];

const WEATHER_LABELS = {
  sun: 'Sun',
  harshSunshine: 'Harsh Sun',
  rain: 'Rain',
  heavyRain: 'Heavy Rain',
  sand: 'Sandstorm',
  snow: 'Snow',
};

const TERRAIN_LABELS = {
  electric: 'Electric Terrain',
  grassy: 'Grassy Terrain',
  psychic: 'Psychic Terrain',
  misty: 'Misty Terrain',
};

const SIDE_FIELD_LABELS = {
  reflect: 'Reflect',
  lightScreen: 'Light Screen',
  auroraVeil: 'Aurora Veil',
  helpingHand: 'Helping Hand',
  tailwind: 'Tailwind',
  friendGuard: 'Friend Guard',
  battery: 'Battery',
  powerSpot: 'Power Spot',
  steelySpirit: 'Steely Spirit',
  foresight: 'Foresight',
};

const STAGE_OPTIONS = Array.from({ length: 13 }, (_, i) => {
  const total = i - 6;
  return { value: total, label: `Speed ${stageLabel(total)}` };
});

function getFieldTags(fieldConditions) {
  const tags = [];
  const weather = WEATHER_LABELS[fieldConditions?.field?.weather];
  const terrain = TERRAIN_LABELS[fieldConditions?.field?.terrain];

  if (weather) tags.push(weather);
  if (terrain) tags.push(terrain);

  [['userSide', 'Your'], ['enemySide', 'Their']].forEach(([sideKey, prefix]) => {
    const side = fieldConditions?.[sideKey] ?? {};
    Object.entries(SIDE_FIELD_LABELS).forEach(([key, label]) => {
      if (side[key]) tags.push(`${prefix} ${label}`);
    });
  });

  return tags;
}

function getThreatOptionLabel(pokemon, fallback = 'Enemy Pokemon') {
  if (!pokemon) return fallback;
  return (
    <span className="constraint-inline-threat">
      <img
        src={`${SPRITE_BASE}/${pokemon.num}.png`}
        className="constraint-threat-sprite"
        alt=""
        onError={e => { e.target.style.display = 'none'; }}
      />
      <span>{pokemon.name}</span>
    </span>
  );
}

function createSavedThreatEntry(pokemon, fullState, fieldConditions) {
  return {
    id: crypto.randomUUID(),
    pokemon,
    fullState,
    fieldConditions,
  };
}

function getIntimidateToggleLabel(fullState, fallback) {
  const ab = getAbilityId(fullState);
  if (ab === 'defiant') return 'after Intimidate triggers Defiant';
  if (ab === 'competitive') return 'after Intimidate triggers Competitive';
  if (ab === 'contrary') return 'after Intimidate flips into +1 Attack';
  if (['clearbody', 'whitesmoke', 'fullmetalbody'].includes(ab)) return 'with Intimidate blocked';
  return fallback;
}

function totalStageToExtra(totalStage, baseStage, icyWind) {
  return clamp(totalStage - (baseStage ?? 0) - (icyWind ? -1 : 0));
}

const STATUS_LABELS = {
  brn: 'Burn',
  psn: 'Poison',
  tox: 'Toxic',
  par: 'Paralysis',
  slp: 'Sleep',
  frz: 'Freeze',
};

const STAGE_TAG_LABELS = {
  atk: 'Attack',
  def: 'Defense',
  spa: 'Sp. Atk',
  spd: 'Sp. Def',
  spe: 'Speed',
};

function getAbilitySummary(fullState, fieldConditions, speedOnly = false) {
  const abilityName = fullState?.ability;
  if (!abilityName) return null;

  const ab = getAbilityId(fullState);
  const weather = fieldConditions?.field?.weather;
  const terrain = fieldConditions?.field?.terrain;
  const itemId = normId(fullState?.item?.name ?? '');
  const status = fullState?.status ?? null;

  if (ab === 'guts' && status) return 'Guts active';
  if (ab === 'quickfeet' && status) return 'Quick Feet active';
  if (ab === 'poisonheal' && ['psn', 'tox'].includes(status)) return 'Poison Heal';
  if (ab === 'protosynthesis' && (weather === 'sun' || weather === 'harshSunshine' || itemId === 'boosterenergy')) return 'Protosynthesis';
  if (ab === 'quarkdrive' && (terrain === 'electric' || itemId === 'boosterenergy')) return 'Quark Drive';

  if (speedOnly) {
    if (['chlorophyll', 'swiftswim', 'sandrush', 'slushrush', 'surgesurfer', 'unburden', 'slowstart'].includes(ab)) {
      return abilityName;
    }
    return null;
  }

  return abilityName;
}

function getStageTags(stages, keys = ['atk', 'def', 'spa', 'spd', 'spe']) {
  return keys
    .filter(key => (stages?.[key] ?? 0) !== 0)
    .map(key => `${stageLabel(stages[key])} ${STAGE_TAG_LABELS[key]}`);
}

function getStateTags(fullState, fieldConditions, { speedOnly = false, omitItem = false, omitSpeedStage = false } = {}) {
  const tags = [];
  const abilitySummary = getAbilitySummary(fullState, fieldConditions, speedOnly);
  if (abilitySummary) tags.push(abilitySummary);
  if (!omitItem && fullState?.item?.name) tags.push(fullState.item.name);
  const statusTag = STATUS_LABELS[fullState?.status];
  if (statusTag) tags.push(statusTag);
  if (speedOnly) {
    if (!omitSpeedStage) tags.push(...getStageTags(fullState?.stages, ['spe']));
  } else {
    tags.push(...getStageTags(fullState?.stages));
  }
  return [...new Set(tags)];
}

function AssumptionRow({ label, children }) {
  return (
    <div className="constraint-assumption-row">
      <span className="constraint-assumption-label">{label}</span>
      <div className="constraint-assumption-content">{children}</div>
    </div>
  );
}

function intimDesc(defenderFullState) {
  const ab = getAbilityId(defenderFullState);
  if (ab === 'defiant')     return 'Defiant! Net ATK +1';
  if (ab === 'competitive') return 'Competitive! ATK −1 / SPA +2';
  if (ab === 'contrary')    return 'Contrary! ATK +1';
  if (['clearbody','whitesmoke','fullmetalbody'].includes(ab)) return `Blocked by ability`;
  return 'ATK −1';
}

// Derive auto-values for a constraint from pokemon state + field conditions
function autoValues(userFullState, threatFullState, fieldConditions) {
  const yourTailwind  = !!fieldConditions?.userSide?.tailwind;
  const theirTailwind = !!fieldConditions?.enemySide?.tailwind;
  const yourScarf     = hasItem(userFullState, 'Choice Scarf');
  const theirScarf    = hasItem(threatFullState, 'Choice Scarf');
  return { yourTailwind, theirTailwind, yourScarf, theirScarf };
}

function newConstraint(userFullState, threatFullState, fieldConditions) {
  const auto = autoValues(userFullState, threatFullState, fieldConditions);
  return {
    id: crypto.randomUUID(),
    type: 'shield',
    opponentSource: 'existing',
    customThreat: null,
    // Shield
    enemyMoveIndex: 0,
    survive: '1hko',
    intimidateOn: false,
    defiantOn: false,      // user has Defiant/Competitive, manually triggered
    // Sword
    userMoveIndex: 0,
    achieve: '1hko',
    intimidateEnemy: false,
    defiantSword: false,   // user has Defiant/Competitive, manually triggered
    // Scarf (outspeed)
    yourExtraStage: 0,
    theirExtraStage: 0,
    yourIcyWind: false,
    theirIcyWind: false,
    ...auto,
  };
}

function PokemonPill({ pokemon, active, onClick }) {
  if (!pokemon) return null;
  return (
    <button className={`constraint-threat-pill ${active ? 'active' : ''}`} onClick={onClick}>
      <img src={`${SPRITE_BASE}/${pokemon.num}.png`} className="constraint-threat-sprite" alt=""
        onError={e => { e.target.style.display = 'none'; }} />
      {pokemon.name}
    </button>
  );
}

// Speed row: stage from step-2 + extra manual adj + icy wind toggle + tailwind + scarf
function SpeedRow({ label, baseStage, extraStage, onExtra, icyWind, onIcyWind, tailwind, onTailwind, scarf, onScarf }) {
  // Effective stage = step2 base + manual extra + icy wind bonus
  const icyDelta = icyWind ? -1 : 0;
  const totalStage = clamp((baseStage ?? 0) + extraStage + icyDelta);
  const stageColor = totalStage > 0 ? '#78c850' : totalStage < 0 ? '#f85050' : '#888';

  return (
    <div className="constraint-row" style={{ alignItems: 'center', flexWrap: 'nowrap', gap: 8 }}>
      <span className="constraint-row-label">{label}</span>
      <div className="constraint-speed-content">

        {/* Stage adjuster */}
        <div className="constraint-speed-stage">
          <span className="constraint-spe-label" style={{ color: SPE_COLOR }}>SPE</span>
          <button className="constraint-stage-adj"
            onClick={() => onExtra(clamp(extraStage - 1))}
            disabled={(baseStage ?? 0) + extraStage + icyDelta <= -6}>−</button>
          <span className="constraint-stage-val" style={{ color: stageColor }}>
            {stageLabel(totalStage)}
            {(baseStage ?? 0) !== 0 &&
              <span className="constraint-stage-base"> (step2: {stageLabel(baseStage)})</span>}
          </span>
          <button className="constraint-stage-adj"
            onClick={() => onExtra(clamp(extraStage + 1))}
            disabled={(baseStage ?? 0) + extraStage + icyDelta >= 6}>+</button>
        </div>

        {/* Tailwind toggle */}
        <button className={`constraint-pill ${tailwind ? 'active' : ''}`} onClick={onTailwind}>
          Tailwind ×2
        </button>

        {/* Scarf toggle */}
        <button className={`constraint-pill ${scarf ? 'active' : ''}`} onClick={onScarf}>
          Choice Scarf ×1.5
        </button>

        {/* Icy Wind — pure toggle, when ON adds -1 to effective stage */}
        <button
          className={`constraint-pill condition-pill ${icyWind ? 'active' : ''}`}
          onClick={onIcyWind}
          disabled={!icyWind && totalStage <= -6}
          title={icyWind ? 'Icy Wind active: −1 SPE' : 'Toggle Icy Wind −1 SPE'}
        >
          Icy Wind −1
        </button>

      </div>
    </div>
  );
}

function IntimidateRow({ attackerFullState, defenderFullState, active, onToggle }) {
  if (!hasAbility(attackerFullState, 'intimidate')) return null;
  const desc = intimDesc(defenderFullState);
  return (
    <div className="constraint-row">
      <span className="constraint-row-label" style={{ color: ATK_COLOR }}>INTIMIDATE</span>
      <button
        className={`constraint-pill ${active ? 'active' : ''}`}
        style={active ? { borderColor: ATK_COLOR, color: ATK_COLOR } : {}}
        onClick={onToggle}
      >
        Apply Intimidate <span style={{ color: '#666', fontWeight: 400, marginLeft: 4 }}>({desc})</span>
      </button>
    </div>
  );
}

// Manual Defiant/Competitive boost toggle (e.g. enemy used Icy Wind, triggering Defiant)
function DefiantRow({ pokemonFullState, active, onToggle }) {
  const ab = getAbilityId(pokemonFullState);
  if (ab !== 'defiant' && ab !== 'competitive') return null;
  const isDefiant = ab === 'defiant';
  const label = isDefiant ? 'Defiant triggered (+2 ATK)' : 'Competitive triggered (+2 SPA)';
  const color = isDefiant ? ATK_COLOR : '#C8E8A0';
  return (
    <div className="constraint-row">
      <span className="constraint-row-label" style={{ color }}>{isDefiant ? 'DEFIANT' : 'COMPETITIVE'}</span>
      <button
        className={`constraint-pill ${active ? 'active' : ''}`}
        style={active ? { borderColor: color, color } : {}}
        onClick={onToggle}
        title={label}
      >
        {label}
      </button>
    </div>
  );
}

function InlineSelect({ value, options, onChange, placeholder, disabled = false }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [open]);

  const selected = options.find(opt => opt.value === value);

  return (
    <span className={`constraint-inline-select ${disabled ? 'disabled' : ''} ${open ? 'open' : ''}`} ref={rootRef}>
      <button
        type="button"
        className="constraint-inline-trigger"
        onClick={() => !disabled && setOpen(prev => !prev)}
        disabled={disabled}
      >
        <span className="constraint-inline-trigger-label">
          {selected?.triggerLabel ?? selected?.label ?? placeholder}
        </span>
        <span className="constraint-inline-caret" aria-hidden="true" />
      </button>
      {open && (
        <div className="constraint-inline-menu">
          {options.map((opt) => (
            <button
              type="button"
              key={opt.key ?? opt.value}
              className={`constraint-inline-option ${opt.value === value ? 'active' : ''}`}
              onClick={() => {
                setOpen(false);
                if (opt.onSelect) opt.onSelect();
                else onChange?.(opt.value);
              }}
            >
              <span className="constraint-inline-option-label">{opt.label}</span>
              {opt.note ? <span className="constraint-inline-option-note">{opt.note}</span> : null}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

function InlineValue({ children }) {
  return <span className="constraint-inline-value">{children}</span>;
}

function InlineToggle({ active, onClick, children }) {
  return (
    <button type="button" className={`constraint-inline-toggle ${active ? 'active' : ''}`} onClick={onClick}>
      {children}
    </button>
  );
}

function FieldTags({ tags }) {
  if (!tags.length) return null;
  return (
    <span className="constraint-field-tags">
      {tags.map(tag => <span key={tag} className="constraint-field-tag">{tag}</span>)}
    </span>
  );
}

function ConstraintCard({
  c, userPokemon, enemyPokemon, userFullState, enemyFullState,
  fieldConditions, savedThreats = [], onUpdate, onDelete, onOpenModal
}) {
  const meta = TYPE_META[c.type];
  const upd = (patch) => onUpdate({ ...c, ...patch });

  const effectiveFieldConditions =
    c.opponentSource === 'custom' ? (c.customThreat?.fieldConditions ?? fieldConditions) : fieldConditions;
  const threatFullState = c.opponentSource === 'custom' ? c.customThreat?.fullState : enemyFullState;
  const threatMoves = getMoves(threatFullState);
  const userMoves = getMoves(userFullState);
  const threatDamageMoves = threatMoves.filter(m => m.name && m.category !== 'Status');
  const userDamageMoves = userMoves.filter(m => m.name && m.category !== 'Status');
  const userBaseSpe = userFullState?.stages?.spe ?? 0;
  const enemyBaseSpe = threatFullState?.stages?.spe ?? 0;
  const fieldTags = getFieldTags(effectiveFieldConditions);
  const speedFieldTags = fieldTags.filter(tag => tag !== 'Your Tailwind' && tag !== 'Their Tailwind');
  const selectedThreatValue = c.opponentSource === 'custom' && c.customThreat ? 'custom' : 'existing';
  const yourStageTotal = clamp(userBaseSpe + c.yourExtraStage + (c.yourIcyWind ? -1 : 0));
  const theirStageTotal = clamp(enemyBaseSpe + c.theirExtraStage + (c.theirIcyWind ? -1 : 0));
  const threatOptions = [
    {
      value: 'existing',
      label: getThreatOptionLabel(enemyPokemon),
      triggerLabel: enemyPokemon?.name ?? 'Enemy Pokemon',
    },
    ...(c.customThreat ? [{
      value: 'custom',
      label: getThreatOptionLabel(c.customThreat.pokemon, 'Custom threat'),
      triggerLabel: c.customThreat.pokemon?.name ?? 'Custom threat',
    }] : []),
    ...savedThreats
      .filter((savedThreat) => savedThreat.id !== c.customThreat?.id)
      .map((savedThreat) => ({
        value: `saved:${savedThreat.id}`,
        label: getThreatOptionLabel(savedThreat.pokemon, 'Saved threat'),
        triggerLabel: savedThreat.pokemon?.name ?? 'Saved threat',
        onSelect: () => upd({
          opponentSource: 'custom',
          customThreat: {
            id: savedThreat.id,
            pokemon: savedThreat.pokemon,
            fullState: savedThreat.fullState,
            fieldConditions: savedThreat.fieldConditions,
          },
        }),
      })),
    {
      value: 'customize',
      label: 'Different threat...',
      triggerLabel: 'Different threat...',
      onSelect: onOpenModal,
    },
  ];
  const myStateTags = getStateTags(userFullState, effectiveFieldConditions);
  const theirStateTags = getStateTags(threatFullState, effectiveFieldConditions);
  const mySpeedStateTags = getStateTags(userFullState, effectiveFieldConditions, { speedOnly: true, omitItem: c.yourScarf, omitSpeedStage: true });
  const theirSpeedStateTags = getStateTags(threatFullState, effectiveFieldConditions, { speedOnly: true, omitItem: c.theirScarf, omitSpeedStage: true });

  useEffect(() => {
    const auto = autoValues(userFullState, threatFullState, effectiveFieldConditions);
    onUpdate({ ...c, ...auto });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c.opponentSource, c.customThreat]);

  useEffect(() => {
    const nextYourScarf = hasItem(userFullState, 'Choice Scarf');
    const nextTheirScarf = hasItem(threatFullState, 'Choice Scarf');
    if (c.yourScarf === nextYourScarf && c.theirScarf === nextTheirScarf) return;
    onUpdate({ ...c, yourScarf: nextYourScarf, theirScarf: nextTheirScarf });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userFullState?.item?.name, threatFullState?.item?.name]);

  useEffect(() => {
    const patch = {};
    if (threatDamageMoves.length > 0 && !threatDamageMoves.some(m => m.index === c.enemyMoveIndex)) {
      patch.enemyMoveIndex = threatDamageMoves[0].index;
    }
    if (userDamageMoves.length > 0 && !userDamageMoves.some(m => m.index === c.userMoveIndex)) {
      patch.userMoveIndex = userDamageMoves[0].index;
    }
    if (Object.keys(patch).length > 0) onUpdate({ ...c, ...patch });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    c.enemyMoveIndex,
    c.userMoveIndex,
    threatDamageMoves.map(m => m.index).join(','),
    userDamageMoves.map(m => m.index).join(','),
  ]);

  return (
    <div className="constraint-card" style={{ '--c-color': meta.color, '--c-accent': meta.accent }}>
      <div className="constraint-card-inner">
        <div className="constraint-card-header">
          <div className="constraint-card-title" style={{ '--btn-color': meta.color }}>
            <img src={meta.img} alt={meta.label} className="constraint-type-img" />
            <span className="constraint-type-label">{meta.label}</span>
          </div>
          <button type="button" className="constraint-delete-btn" onClick={onDelete} title="Remove">X</button>
        </div>

        <div className="constraint-divider" />

        {c.type === 'shield' && (
          <div className="constraint-sentence-block">
            <p className="constraint-sentence">
              {c.survive === '4hko' ? (
                <>
                  I want my <InlineValue>{userPokemon?.name ?? 'Pokemon'}</InlineValue> to avoid a guaranteed 4HKO from{' '}
                  {threatDamageMoves.length > 0 ? (
                    <InlineSelect
                      value={c.enemyMoveIndex}
                      options={threatDamageMoves.map(m => ({ value: m.index, label: m.name }))}
                      onChange={value => upd({ enemyMoveIndex: value })}
                      placeholder="enemy move"
                    />
                  ) : (
                    <InlineValue>an enemy move from Step 4</InlineValue>
                  )}{' '}
                  by{' '}
                  <InlineSelect
                    value={selectedThreatValue}
                    options={threatOptions}
                    onChange={(value) => {
                      if (value === 'existing') upd({ opponentSource: 'existing', customThreat: null });
                      if (value === 'custom' && c.customThreat) upd({ opponentSource: 'custom' });
                    }}
                    placeholder="enemy Pokemon"
                  />
                  .
                </>
              ) : (
                <>
                  I want my <InlineValue>{userPokemon?.name ?? 'Pokemon'}</InlineValue> to survive{' '}
                  {c.survive !== '1hko' && (
                    <>
                      <InlineSelect
                        value={c.survive}
                        options={SURVIVE_OPTIONS.filter(opt => opt.value !== '4hko')}
                        onChange={value => upd({ survive: value })}
                        placeholder="hits"
                      />{' '}
                      of{' '}
                    </>
                  )}
                  {threatDamageMoves.length > 0 ? (
                    <InlineSelect
                      value={c.enemyMoveIndex}
                      options={threatDamageMoves.map(m => ({ value: m.index, label: m.name }))}
                      onChange={value => upd({ enemyMoveIndex: value })}
                      placeholder="enemy move"
                    />
                  ) : (
                    <InlineValue>an enemy move from Step 4</InlineValue>
                  )}{' '}
                  from{' '}
                  <InlineSelect
                    value={selectedThreatValue}
                    options={threatOptions}
                    onChange={(value) => {
                      if (value === 'existing') upd({ opponentSource: 'existing', customThreat: null });
                      if (value === 'custom' && c.customThreat) upd({ opponentSource: 'custom' });
                    }}
                    placeholder="enemy Pokemon"
                  />
                  .
                </>
              )}
            </p>

            <div className="constraint-assumptions">
              <AssumptionRow label="Goal detail">
                <InlineSelect
                  value={c.survive}
                  options={[
                    { value: '1hko', label: '1 hit' },
                    { value: '2hko', label: '2 hits' },
                    { value: '3hko', label: '3 hits' },
                    { value: '4hko', label: 'Avoid guaranteed 4HKO' },
                  ]}
                  onChange={value => upd({ survive: value })}
                  placeholder="hits"
                />
              </AssumptionRow>
              {fieldTags.length > 0 && (
                <AssumptionRow label="Current field">
                  <FieldTags tags={fieldTags} />
                </AssumptionRow>
              )}
              {myStateTags.length > 0 && (
                <AssumptionRow label="My state">
                  <FieldTags tags={myStateTags} />
                </AssumptionRow>
              )}
              {theirStateTags.length > 0 && (
                <AssumptionRow label="Their state">
                  <FieldTags tags={theirStateTags} />
                </AssumptionRow>
              )}
            </div>
          </div>
        )}

        {c.type === 'sword' && (
          <div className="constraint-sentence-block">
            <p className="constraint-sentence">
              I want my <InlineValue>{userPokemon?.name ?? 'Pokemon'}</InlineValue> to KO{' '}
              <InlineSelect
                value={selectedThreatValue}
                options={threatOptions}
                onChange={(value) => {
                  if (value === 'existing') upd({ opponentSource: 'existing', customThreat: null });
                  if (value === 'custom' && c.customThreat) upd({ opponentSource: 'custom' });
                }}
                placeholder="enemy Pokemon"
              />{' '}
              with{' '}
              {userDamageMoves.length > 0 ? (
                <InlineSelect
                  value={c.userMoveIndex}
                  options={userDamageMoves.map(m => ({ value: m.index, label: m.name }))}
                  onChange={value => upd({ userMoveIndex: value })}
                  placeholder="your move"
                />
              ) : (
                <InlineValue>a damaging move from Step 4</InlineValue>
              )}{' '}
              in{' '}
              <InlineSelect
                value={c.achieve}
                options={KO_OPTIONS}
                onChange={value => upd({ achieve: value })}
                placeholder="KO goal"
              />
              .
            </p>

            <div className="constraint-assumptions">
              {fieldTags.length > 0 && (
                <AssumptionRow label="Current field">
                  <FieldTags tags={fieldTags} />
                </AssumptionRow>
              )}
              {myStateTags.length > 0 && (
                <AssumptionRow label="My state">
                  <FieldTags tags={myStateTags} />
                </AssumptionRow>
              )}
              {theirStateTags.length > 0 && (
                <AssumptionRow label="Their state">
                  <FieldTags tags={theirStateTags} />
                </AssumptionRow>
              )}
            </div>
          </div>
        )}

        {c.type === 'scarf' && (
          <div className="constraint-sentence-block">
            <p className="constraint-sentence">
              I want my <InlineValue>{userPokemon?.name ?? 'Pokemon'}</InlineValue> to outspeed{' '}
              <InlineSelect
                value={selectedThreatValue}
                options={threatOptions}
                onChange={(value) => {
                  if (value === 'existing') upd({ opponentSource: 'existing', customThreat: null });
                  if (value === 'custom' && c.customThreat) upd({ opponentSource: 'custom' });
                }}
                    placeholder="enemy Pokemon"
                  />{' '}
              .
            </p>

            <div className="constraint-assumptions">
              <AssumptionRow label="My speed assumptions">
                <InlineSelect
                  value={yourStageTotal}
                  options={STAGE_OPTIONS}
                  onChange={value => upd({ yourExtraStage: totalStageToExtra(Number(value), userBaseSpe, c.yourIcyWind) })}
                  placeholder="my Speed"
                />
                <InlineToggle active={c.yourTailwind} onClick={() => upd({ yourTailwind: !c.yourTailwind })}>Tailwind</InlineToggle>
                <InlineToggle active={c.yourScarf} onClick={() => upd({ yourScarf: !c.yourScarf })}>Choice Scarf</InlineToggle>
                <InlineToggle active={c.yourIcyWind} onClick={() => upd({ yourIcyWind: !c.yourIcyWind })}>Icy Wind</InlineToggle>
                {mySpeedStateTags.length > 0 && <FieldTags tags={mySpeedStateTags} />}
              </AssumptionRow>
              <AssumptionRow label="Their speed assumptions">
                <InlineSelect
                  value={theirStageTotal}
                  options={STAGE_OPTIONS}
                  onChange={value => upd({ theirExtraStage: totalStageToExtra(Number(value), enemyBaseSpe, c.theirIcyWind) })}
                  placeholder="their Speed"
                />
                <InlineToggle active={c.theirTailwind} onClick={() => upd({ theirTailwind: !c.theirTailwind })}>Tailwind</InlineToggle>
                <InlineToggle active={c.theirScarf} onClick={() => upd({ theirScarf: !c.theirScarf })}>Choice Scarf</InlineToggle>
                <InlineToggle active={c.theirIcyWind} onClick={() => upd({ theirIcyWind: !c.theirIcyWind })}>Icy Wind</InlineToggle>
                {theirSpeedStateTags.length > 0 && <FieldTags tags={theirSpeedStateTags} />}
              </AssumptionRow>
              {speedFieldTags.length > 0 && (
                <AssumptionRow label="Current field">
                  <FieldTags tags={speedFieldTags} />
                </AssumptionRow>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="constraint-card" style={{ '--c-color': meta.color, '--c-accent': meta.accent }}>
      <div className="constraint-card-inner">
        <div className="constraint-card-header">
          <div className="constraint-card-title" style={{ '--btn-color': meta.color }}>
            <img src={meta.img} alt={meta.label} className="constraint-type-img" />
            <span className="constraint-type-label">{meta.label}</span>
          </div>
        </div>

      {/* Type buttons + delete */}
      <div className="constraint-type-row">
        {Object.entries(TYPE_META).map(([type, m]) => (
          <button key={type}
            className={`constraint-type-btn ${c.type === type ? 'active' : ''}`}
            onClick={() => upd({ type })}
            style={c.type === type ? { '--btn-color': m.color } : {}}
          >
            <img src={m.img} alt={m.label} className="constraint-type-img" />
            <span className="constraint-type-label">{m.label}</span>
          </button>
        ))}
        <button className="constraint-delete-btn" onClick={onDelete} title="Remove">✕</button>
      </div>

      <div className="constraint-divider" />

      {/* Threat source */}
      <div className="constraint-row">
        <span className="constraint-row-label">{c.type === 'scarf' ? 'VS' : 'THREAT'}</span>
        <div className="constraint-threat-pills">
          <PokemonPill pokemon={enemyPokemon} active={c.opponentSource === 'existing'}
            onClick={() => upd({ opponentSource: 'existing', customThreat: null })} />
          {c.opponentSource === 'custom' && c.customThreat &&
            <PokemonPill pokemon={c.customThreat.pokemon} active={true} onClick={() => {}} />}
          <button className="constraint-threat-pill add" onClick={onOpenModal}>+ New Threat</button>
        </div>
      </div>

      {/* SHIELD */}
      {c.type === 'shield' && <>
        <div className="constraint-row">
          <span className="constraint-row-label">MOVE</span>
          <div className="constraint-move-pills">
            {threatMoves.filter(m => m.name).length > 0
              ? threatMoves.filter(m => m.name).map(m => (
                  <button key={m.index}
                    className={`constraint-move-pill ${c.enemyMoveIndex === m.index ? 'active' : ''}`}
                    onClick={() => upd({ enemyMoveIndex: m.index })}>
                    {m.name}
                  </button>
                ))
              : <span className="constraint-no-moves">No moves set in Step 4</span>
            }
          </div>
        </div>
        <div className="constraint-row">
          <span className="constraint-row-label">SURVIVE</span>
          <button className={`constraint-pill ${c.survive === '1hko' ? 'active' : ''}`}
            onClick={() => upd({ survive: '1hko' })}>Survive 1 Hit</button>
          <button className={`constraint-pill ${c.survive === '2hko' ? 'active' : ''}`}
            onClick={() => upd({ survive: '2hko' })}>Survive 2 Hits</button>
        </div>
        <IntimidateRow
          attackerFullState={threatFullState} defenderFullState={userFullState}
          active={c.intimidateOn} onToggle={() => upd({ intimidateOn: !c.intimidateOn })} />
        <DefiantRow
          pokemonFullState={userFullState}
          active={c.defiantOn} onToggle={() => upd({ defiantOn: !c.defiantOn })} />
      </>}

      {/* SWORD */}
      {c.type === 'sword' && <>
        <div className="constraint-row">
          <span className="constraint-row-label">MOVE</span>
          <div className="constraint-move-pills">
            {userMoves.filter(m => m.name).length > 0
              ? userMoves.filter(m => m.name).map(m => (
                  <button key={m.index}
                    className={`constraint-move-pill ${c.userMoveIndex === m.index ? 'active' : ''}`}
                    onClick={() => upd({ userMoveIndex: m.index })}>
                    {m.name}
                  </button>
                ))
              : <span className="constraint-no-moves">No moves set in Step 4</span>
            }
          </div>
        </div>
        <div className="constraint-row">
          <span className="constraint-row-label">ACHIEVE</span>
          <button className={`constraint-pill ${c.achieve === '1hko' ? 'active' : ''}`}
            onClick={() => upd({ achieve: '1hko' })}>OHKO</button>
          <button className={`constraint-pill ${c.achieve === '2hko' ? 'active' : ''}`}
            onClick={() => upd({ achieve: '2hko' })}>2HKO</button>
        </div>
        <IntimidateRow
          attackerFullState={threatFullState} defenderFullState={userFullState}
          active={c.intimidateEnemy} onToggle={() => upd({ intimidateEnemy: !c.intimidateEnemy })} />
        <DefiantRow
          pokemonFullState={userFullState}
          active={c.defiantSword} onToggle={() => upd({ defiantSword: !c.defiantSword })} />
      </>}

      {/* SCARF / OUTSPEED */}
      {c.type === 'scarf' && <>
        <SpeedRow
          label="YOUR SPE"
          baseStage={userBaseSpe}
          extraStage={c.yourExtraStage}
          onExtra={v => upd({ yourExtraStage: v })}
          icyWind={c.yourIcyWind}
          onIcyWind={() => upd({ yourIcyWind: !c.yourIcyWind })}
          tailwind={c.yourTailwind}
          onTailwind={() => upd({ yourTailwind: !c.yourTailwind })}
          scarf={c.yourScarf}
          onScarf={() => upd({ yourScarf: !c.yourScarf })}
        />
        <SpeedRow
          label="THEIR SPE"
          baseStage={enemyBaseSpe}
          extraStage={c.theirExtraStage}
          onExtra={v => upd({ theirExtraStage: v })}
          icyWind={c.theirIcyWind}
          onIcyWind={() => upd({ theirIcyWind: !c.theirIcyWind })}
          tailwind={c.theirTailwind}
          onTailwind={() => upd({ theirTailwind: !c.theirTailwind })}
          scarf={c.theirScarf}
          onScarf={() => upd({ theirScarf: !c.theirScarf })}
        />
      </>}
      </div>
    </div>
  );
}

export default function Constraints({
  constraints, onChange,
  savedThreats = [], onSavedThreatsChange,
  userPokemon, enemyPokemon,
  userFullState, enemyFullState,
  fieldConditions,
}) {
  const [modalConstraintId, setModalConstraintId] = useState(null);
  const addCooldownRef = useRef({});
  const activeModalConstraint = constraints.find(c => c.id === modalConstraintId) ?? null;
  const typeCounts = constraints.reduce((acc, constraint) => {
    acc[constraint.type] = (acc[constraint.type] ?? 0) + 1;
    return acc;
  }, {});

  const toggleConstraintType = (type) => {
    if ((typeCounts[type] ?? 0) > 0) {
      onChange(constraints.filter((constraint) => constraint.type !== type));
      return;
    }
    const auto = autoValues(userFullState, enemyFullState, fieldConditions);
    onChange([...constraints, {
      ...newConstraint(userFullState, enemyFullState, fieldConditions),
      ...auto,
      type,
    }]);
  };

  const addConstraintOfType = (type) => {
    const now = Date.now();
    if (now - (addCooldownRef.current[type] ?? 0) < 300) return;
    addCooldownRef.current[type] = now;
    if ((typeCounts[type] ?? 0) >= 3) return;
    const auto = autoValues(userFullState, enemyFullState, fieldConditions);
    onChange([...constraints, {
      ...newConstraint(userFullState, enemyFullState, fieldConditions),
      ...auto,
      type,
    }]);
  };

  const updateConstraint = (updated) => onChange(constraints.map(c => c.id === updated.id ? updated : c));
  const removeConstraint = (id) => onChange(constraints.filter(c => c.id !== id));

  const handleModalConfirm = ({ pokemon, fullState, fieldConditions: threatFieldConditions }) => {
    const id = modalConstraintId;
    setModalConstraintId(null);
    const savedThreat = createSavedThreatEntry(pokemon, fullState, threatFieldConditions);
    onSavedThreatsChange?.((current = []) => {
      const duplicate = current.some((entry) =>
        entry.pokemon?.name === pokemon?.name &&
        JSON.stringify(entry.fullState ?? null) === JSON.stringify(fullState ?? null) &&
        JSON.stringify(entry.fieldConditions ?? null) === JSON.stringify(threatFieldConditions ?? null)
      );
      return duplicate ? current : [...current, savedThreat];
    });
    onChange(constraints.map(c =>
      c.id === id ? {
        ...c,
        opponentSource: 'custom',
        customThreat: { id: savedThreat.id, pokemon, fullState, fieldConditions: threatFieldConditions },
      } : c
    ));
  };

  return (
    <div className="constraints">
      <div className="constraints-entry-card">
        <div className="constraints-entry-surface">
          <div className="constraints-entry-row">
            {Object.entries(TYPE_META).map(([type, m]) => (
              <div
                key={type}
                className={`constraints-entry-type ${typeCounts[type] > 0 ? 'active' : ''}`}
                style={typeCounts[type] > 0 ? { '--btn-color': m.color, '--add-color': m.color } : { '--add-color': m.color }}
              >
                <button
                  type="button"
                  className={`constraint-type-btn constraints-entry-btn ${typeCounts[type] > 0 ? 'active' : ''}`}
                  onClick={() => toggleConstraintType(type)}
                >
                  <img src={m.img} alt={m.label} className="constraint-type-img" />
                  <span className="constraint-type-label">
                    {m.label}{(typeCounts[type] ?? 0) > 1 ? ` x${typeCounts[type]}` : ''}
                  </span>
                </button>
                <button
                  type="button"
                  className={`constraints-entry-add ${((typeCounts[type] ?? 0) > 0 && (typeCounts[type] ?? 0) < 3) ? 'enabled' : 'disabled'}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    addConstraintOfType(type);
                  }}
                  title={`Add another ${m.label} constraint`}
                  aria-label={`Add another ${m.label} constraint`}
                  disabled={!((typeCounts[type] ?? 0) > 0 && (typeCounts[type] ?? 0) < 3)}
                >
                  +
                </button>
              </div>
            ))}
          </div>
          <p className="constraints-entry-help">
            Click a type to toggle it on or off. Use the plus button to add more of an active type, up to three instances.
          </p>
        </div>
      </div>
      {modalConstraintId !== null && (
        <ThreatModal
          onConfirm={handleModalConfirm}
          onClose={() => setModalConstraintId(null)}
          opponentInfo={userFullState}
          userPokemon={userPokemon}
          userFullState={userFullState}
          fieldConditions={fieldConditions}
          initialThreat={activeModalConstraint?.customThreat ?? null}
        />
      )}
      {constraints.length === 0 && (
        <div className="constraints-empty">
          <p>Add constraints to define what your EV spread should achieve.<br />
          Stack multiple — the brute force will satisfy all of them simultaneously.</p>
        </div>
      )}

      <div className="constraints-list">
        {constraints.map(c => (
          <ConstraintCard key={c.id} c={c}
            userPokemon={userPokemon} enemyPokemon={enemyPokemon}
            userFullState={userFullState} enemyFullState={enemyFullState}
            fieldConditions={fieldConditions}
            savedThreats={savedThreats}
            onUpdate={updateConstraint}
            onDelete={() => removeConstraint(c.id)}
            onOpenModal={() => setModalConstraintId(c.id)}
          />
        ))}
      </div>
    </div>
  );
}
