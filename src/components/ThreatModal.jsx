<<<<<<< HEAD
import { useState, useRef } from 'react';
import PokemonSelector from './PokemonSelector';
import '../styles/ThreatModal.css';

const STEP_TITLES = ['Select Threat', 'EVs & IVs', 'Items & Status', 'Move Selection'];

export default function ThreatModal({ onConfirm, onClose, opponentInfo }) {
  const [selectedPokemon, setSelectedPokemon] = useState(null);
  const [modalStep, setModalStep] = useState(1);
  const [abilityError, setAbilityError] = useState(null);
  const [pasteText, setPasteText] = useState('');
  const [pasteError, setPasteError] = useState(null);
  const selectorRef = useRef(null);

  const canContinue = modalStep === 1 ? !!selectedPokemon : true;

  const handleContinue = () => {
    if (modalStep === 1) {
      if (!selectedPokemon) return;
      const valid = selectorRef.current?.validateAbility();
      if (!valid) return;
      setModalStep(2);
    } else if (modalStep < 4) {
      setModalStep(s => s + 1);
    } else {
      const fullState = selectorRef.current?.getFullState();
      onConfirm({ pokemon: selectedPokemon, fullState });
    }
  };

  const handlePaste = (text) => {
    setPasteText(text);
    setPasteError(null);
    if (!text.trim()) return;
    const result = selectorRef.current?.loadShowdownSet(text);
    if (!result) return;
    if (!result.success) { setPasteError(result.error || 'Could not parse set'); return; }
    // Paste succeeded — jump straight to confirm
    setTimeout(() => {
      const fullState = selectorRef.current?.getFullState();
      const pokemon = result.pokemon ?? selectedPokemon;
      if (pokemon) onConfirm({ pokemon, fullState });
    }, 80);
  };

  return (
    <div className="threat-modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="threat-modal">

        <div className="threat-modal-header">
          <div className="threat-modal-step-info">
            <span className="threat-modal-step-num">Step {modalStep}/4</span>
            <span className="threat-modal-step-title">{STEP_TITLES[modalStep - 1]}</span>
          </div>
          <button className="threat-modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="threat-modal-body">
          <PokemonSelector
            ref={selectorRef}
            title="Threat Pokemon"
            selectedPokemon={selectedPokemon}
            onSelect={setSelectedPokemon}
            collapsed={modalStep >= 2}
            step={modalStep}
            onAbilityError={setAbilityError}
            opponentInfo={opponentInfo}
            onStateChange={() => {}}
          />
          {abilityError && <div className="threat-modal-error">{abilityError}</div>}

          {/* Paste shortcut — only shown in step 1 when no pokemon selected yet */}
          {modalStep === 1 && !selectedPokemon && (
            <div className="threat-modal-paste">
              <div className="threat-modal-paste-label">OR paste a Showdown set to skip all steps</div>
              <textarea
                className={`paste-input ${pasteError ? 'error' : ''}`}
                placeholder="Paste Showdown set here..."
                value={pasteText}
                onChange={e => handlePaste(e.target.value)}
                rows={8}
                spellCheck={false}
              />
              {pasteError && <div className="paste-error">{pasteError}</div>}
            </div>
          )}
        </div>

        <div className="threat-modal-footer">
          {modalStep > 1 && (
            <button className="back-btn" onClick={() => setModalStep(s => s - 1)}>← Back</button>
          )}
          <button
            className={`continue-btn ${!canContinue ? 'disabled' : ''}`}
            onClick={handleContinue}
            disabled={!canContinue}
          >
            {modalStep === 4 ? '✓ Confirm Threat' : 'Continue →'}
          </button>
        </div>

      </div>
    </div>
  );
=======
import { useState, useRef } from 'react';
import PokemonSelector from './PokemonSelector';
import '../styles/ThreatModal.css';

const STEP_TITLES = ['Select Threat', 'EVs & IVs', 'Items & Status', 'Move Selection'];

export default function ThreatModal({ onConfirm, onClose, opponentInfo }) {
  const [selectedPokemon, setSelectedPokemon] = useState(null);
  const [modalStep, setModalStep] = useState(1);
  const [abilityError, setAbilityError] = useState(null);
  const [pasteText, setPasteText] = useState('');
  const [pasteError, setPasteError] = useState(null);
  const selectorRef = useRef(null);

  const canContinue = modalStep === 1 ? !!selectedPokemon : true;

  const handleContinue = () => {
    if (modalStep === 1) {
      if (!selectedPokemon) return;
      const valid = selectorRef.current?.validateAbility();
      if (!valid) return;
      setModalStep(2);
    } else if (modalStep < 4) {
      setModalStep(s => s + 1);
    } else {
      const fullState = selectorRef.current?.getFullState();
      onConfirm({ pokemon: selectedPokemon, fullState });
    }
  };

  const handlePaste = (text) => {
    setPasteText(text);
    setPasteError(null);
    if (!text.trim()) return;
    const result = selectorRef.current?.loadShowdownSet(text);
    if (!result) return;
    if (!result.success) { setPasteError(result.error || 'Could not parse set'); return; }
    // Paste succeeded — jump straight to confirm
    setTimeout(() => {
      const fullState = selectorRef.current?.getFullState();
      const pokemon = result.pokemon ?? selectedPokemon;
      if (pokemon) onConfirm({ pokemon, fullState });
    }, 80);
  };

  return (
    <div className="threat-modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="threat-modal">

        <div className="threat-modal-header">
          <div className="threat-modal-step-info">
            <span className="threat-modal-step-num">Step {modalStep}/4</span>
            <span className="threat-modal-step-title">{STEP_TITLES[modalStep - 1]}</span>
          </div>
          <button className="threat-modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="threat-modal-body">
          <PokemonSelector
            ref={selectorRef}
            title="Threat Pokemon"
            selectedPokemon={selectedPokemon}
            onSelect={setSelectedPokemon}
            collapsed={modalStep >= 2}
            step={modalStep}
            onAbilityError={setAbilityError}
            opponentInfo={opponentInfo}
            onStateChange={() => {}}
          />
          {abilityError && <div className="threat-modal-error">{abilityError}</div>}

          {/* Paste shortcut — only shown in step 1 when no pokemon selected yet */}
          {modalStep === 1 && !selectedPokemon && (
            <div className="threat-modal-paste">
              <div className="threat-modal-paste-label">OR paste a Showdown set to skip all steps</div>
              <textarea
                className={`paste-input ${pasteError ? 'error' : ''}`}
                placeholder="Paste Showdown set here..."
                value={pasteText}
                onChange={e => handlePaste(e.target.value)}
                rows={8}
                spellCheck={false}
              />
              {pasteError && <div className="paste-error">{pasteError}</div>}
            </div>
          )}
        </div>

        <div className="threat-modal-footer">
          {modalStep > 1 && (
            <button className="back-btn" onClick={() => setModalStep(s => s - 1)}>← Back</button>
          )}
          <button
            className={`continue-btn ${!canContinue ? 'disabled' : ''}`}
            onClick={handleContinue}
            disabled={!canContinue}
          >
            {modalStep === 4 ? '✓ Confirm Threat' : 'Continue →'}
          </button>
        </div>

      </div>
    </div>
  );
>>>>>>> c8f72e86189094634083d6ae60238dbc986c0414
}