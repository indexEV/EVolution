import { useEffect, useState, useRef } from 'react';
import FieldConditions from './FieldConditions';
import PokemonSelector from './PokemonSelector';
import '../styles/ThreatModal.css';

const STEP_TITLES = ['Select Threat', 'EVs & IVs', 'Items & Status', 'Move Selection', 'Local Conditions'];

const DEFAULT_SIDE = {
  stealthRock: false,
  spikes: 0,
  toxicSpikes: 0,
  reflect: false,
  lightScreen: false,
  auroraVeil: false,
  protect: false,
  leechSeed: false,
  saltCure: false,
  foresight: false,
  helpingHand: false,
  tailwind: false,
  flowerGift: false,
  powerTrick: false,
  steelySpirit: false,
  friendGuard: false,
  battery: false,
  powerSpot: false,
  switchingOut: false,
  justSwitchedIn: false,
};

function cloneFieldConditions(value) {
  if (!value) return null;
  return {
    field: { ...(value.field ?? {}) },
    userSide: { ...(value.userSide ?? {}) },
    enemySide: { ...(value.enemySide ?? {}) },
  };
}

function createThreatLocalFieldConditions(value, initialThreat) {
  if (initialThreat?.fieldConditions) return cloneFieldConditions(initialThreat.fieldConditions);
  if (!value) return null;
  return {
    field: { ...(value.field ?? {}) },
    userSide: { ...(value.userSide ?? {}) },
    enemySide: { ...DEFAULT_SIDE },
  };
}

export default function ThreatModal({
  onConfirm,
  onClose,
  opponentInfo,
  userPokemon = null,
  userFullState = null,
  fieldConditions = null,
  initialThreat = null,
}) {
  const [selectedPokemon, setSelectedPokemon] = useState(initialThreat?.pokemon ?? null);
  const [modalStep, setModalStep] = useState(1);
  const [abilityError, setAbilityError] = useState(null);
  const [pasteText, setPasteText] = useState('');
  const [pasteError, setPasteError] = useState(null);
  const [threatFullState, setThreatFullState] = useState(initialThreat?.fullState ?? null);
  const [localFieldConditions, setLocalFieldConditions] = useState(() => createThreatLocalFieldConditions(fieldConditions, initialThreat));
  const selectorRef = useRef(null);
  const hydratedRef = useRef(false);

  const canContinue = modalStep === 1 ? !!selectedPokemon : true;

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    if (!initialThreat?.fullState || !selectedPokemon || hydratedRef.current || !selectorRef.current) return;
    selectorRef.current.setFullState(initialThreat.fullState);
    setThreatFullState(initialThreat.fullState);
    hydratedRef.current = true;
  }, [initialThreat, selectedPokemon]);

  const handleContinue = () => {
    if (modalStep === 1) {
      if (!selectedPokemon) return;
      const valid = selectorRef.current?.validateAbility();
      if (!valid) return;
      setModalStep(2);
    } else if (modalStep < STEP_TITLES.length) {
      setModalStep((s) => s + 1);
    } else {
      const fullState = selectorRef.current?.getFullState();
      onConfirm({ pokemon: selectedPokemon, fullState, fieldConditions: cloneFieldConditions(localFieldConditions) });
    }
  };

  const handlePaste = (text) => {
    setPasteText(text);
    setPasteError(null);
    if (!text.trim()) return;
    const result = selectorRef.current?.loadShowdownSet(text);
    if (!result) return;
    if (!result.success) {
      setPasteError(result.error || 'Could not parse set');
      return;
    }
    setTimeout(() => {
      const fullState = selectorRef.current?.getFullState();
      const pokemon = result.pokemon ?? selectedPokemon;
      if (!pokemon) return;
      setThreatFullState(fullState);
      setSelectedPokemon(pokemon);
      setModalStep(STEP_TITLES.length);
    }, 80);
  };

  return (
    <>
      <div className="threat-modal-overlay" onClick={onClose} />
      <div className="threat-editor-inline-shell">
        <div className="threat-modal">
          <div className="threat-modal-header">
            <div className="threat-modal-heading">
              <span className="threat-modal-kicker">Custom Threat</span>
              <div className="threat-modal-step-info">
                <span className="threat-modal-step-title">{STEP_TITLES[modalStep - 1]}</span>
                <span className="threat-modal-step-subtitle">Edit the threat directly here in Step 6.</span>
              </div>
            </div>
            <button className="threat-modal-close" onClick={onClose}>X</button>
          </div>

          <div className="threat-modal-content-shell">
            <div className="threat-modal-body">
              <PokemonSelector
                ref={selectorRef}
                title="Threat Pokemon"
                selectedPokemon={selectedPokemon}
                onSelect={setSelectedPokemon}
                collapsed={modalStep >= 2}
                step={modalStep}
                onAbilityError={setAbilityError}
                opponentInfo={opponentInfo ?? userFullState}
                opponentFullState={userFullState}
                opponentPokemon={userPokemon}
                onStateChange={setThreatFullState}
                fieldConditions={localFieldConditions}
              />
              {abilityError && <div className="threat-modal-error">{abilityError}</div>}

              {modalStep === 1 && !selectedPokemon && (
                <div className="threat-modal-paste">
                  <div className="threat-modal-paste-label">OR paste a Showdown set to skip setup</div>
                  <div className={`paste-input-shell ${pasteError ? 'error' : ''}`}>
                    <textarea
                      className="paste-input"
                      placeholder="Paste Showdown set here..."
                      value={pasteText}
                      onChange={(e) => handlePaste(e.target.value)}
                      rows={8}
                      spellCheck={false}
                    />
                  </div>
                  {pasteError && <div className="paste-error">{pasteError}</div>}
                </div>
              )}

              {modalStep === STEP_TITLES.length && (
                <div style={{ marginTop: 18 }}>
                  <FieldConditions
                    value={localFieldConditions}
                    onChange={setLocalFieldConditions}
                    userFullState={userFullState}
                    enemyFullState={threatFullState}
                  />
                </div>
              )}
            </div>
          </div>

          <div className="threat-modal-footer">
            {modalStep > 1 ? (
              <button className="threat-modal-action secondary" onClick={() => setModalStep((s) => s - 1)}>Back</button>
            ) : (
              <span className="threat-modal-footer-spacer" />
            )}
            <button
              className={`threat-modal-action primary ${!canContinue ? 'disabled' : ''}`}
              onClick={handleContinue}
              disabled={!canContinue}
            >
              {modalStep === STEP_TITLES.length ? 'Confirm Threat' : 'Continue'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
