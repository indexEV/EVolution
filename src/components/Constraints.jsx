import { useState, useEffect } from 'react';
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
  return fullState.moves.map((m, i) => ({ index: i, name: m?.name ?? null }));
}

function getAbilityId(fullState) {
  return normId(fullState?.ability ?? '');
}

function hasAbility(fullState, name) { return getAbilityId(fullState) === normId(name); }

function hasItem(fullState, name) {
  return normId(fullState?.item?.name ?? '') === normId(name);
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

function ConstraintCard({
  c, userPokemon, enemyPokemon, userFullState, enemyFullState,
  fieldConditions, onUpdate, onDelete, onOpenModal
}) {
  const meta = TYPE_META[c.type];
  const upd = (patch) => onUpdate({ ...c, ...patch });

  const threatPokemon   = c.opponentSource === 'custom' ? c.customThreat?.pokemon   : enemyPokemon;
  const threatFullState = c.opponentSource === 'custom' ? c.customThreat?.fullState  : enemyFullState;

  const threatMoves = getMoves(threatFullState);
  const userMoves   = getMoves(userFullState);
  const userBaseSpe  = userFullState?.stages?.spe  ?? 0;
  const enemyBaseSpe = threatFullState?.stages?.spe ?? 0;

  // Re-sync scarf/tailwind when threat source changes
  useEffect(() => {
    const auto = autoValues(userFullState, threatFullState, fieldConditions);
    onUpdate({ ...c, ...auto });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c.opponentSource, c.customThreat]);

  return (
    <div className="constraint-card" style={{ '--c-color': meta.color, '--c-accent': meta.accent }}>

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
  );
}

export default function Constraints({
  constraints, onChange,
  userPokemon, enemyPokemon,
  userFullState, enemyFullState,
  fieldConditions,
}) {
  const [modalConstraintId, setModalConstraintId] = useState(null);

  const addConstraint = () => {
    const auto = autoValues(userFullState, enemyFullState, fieldConditions);
    onChange([...constraints, { ...newConstraint(userFullState, enemyFullState, fieldConditions), ...auto }]);
  };

  const updateConstraint = (updated) => onChange(constraints.map(c => c.id === updated.id ? updated : c));
  const removeConstraint = (id) => onChange(constraints.filter(c => c.id !== id));

  const handleModalConfirm = ({ pokemon, fullState }) => {
    const id = modalConstraintId;
    setModalConstraintId(null);
    onChange(constraints.map(c =>
      c.id === id ? { ...c, opponentSource: 'custom', customThreat: { pokemon, fullState } } : c
    ));
  };

  return (
    <div className="constraints">
      {constraints.length === 0 && (
        <div className="constraints-empty">
          <div className="constraints-empty-icons">
            {Object.entries(TYPE_META).map(([type, m]) => (
              <div key={type} className="constraints-empty-icon">
                <img src={m.img} alt={m.label} />
                <span style={{ color: m.color }}>{m.label}</span>
              </div>
            ))}
          </div>
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
            onUpdate={updateConstraint}
            onDelete={() => removeConstraint(c.id)}
            onOpenModal={() => setModalConstraintId(c.id)}
          />
        ))}
      </div>

      <button className="constraints-add-btn" onClick={addConstraint}>+ Add Constraint</button>

      {modalConstraintId !== null && (
        <ThreatModal
          onConfirm={handleModalConfirm}
          onClose={() => setModalConstraintId(null)}
          opponentInfo={null}
        />
      )}
    </div>
  );
}