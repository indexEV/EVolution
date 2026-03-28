/**
 * MoveSelector Component
 * Handles move selection, filtering, and display for all 4 move slots
 */

import React, { useRef, useState } from 'react';
import { useMoveFiltering } from '../hooks/useMoveFiltering';

const MOVE_TYPES = {
  normal: '#A8A8A8',
  fire: '#F08030',
  water: '#6890F0',
  electric: '#F8D030',
  grass: '#78C850',
  ice: '#98D8D8',
  fighting: '#C03028',
  poison: '#A040A0',
  ground: '#E0C068',
  flying: '#A890F0',
  psychic: '#F85888',
  bug: '#A8B820',
  rock: '#B8A038',
  ghost: '#705898',
  dragon: '#7038F8',
  dark: '#705848',
  steel: '#B8B8D0',
  fairy: '#EE99AC',
};

export function MoveSelector({
  selectedPokemon,
  selectedAbility,
  selectedMoves = [null, null, null, null],
  onMovesChange,
}) {
  const {
    getFilteredMoves,
    getAvailableMoves,
    setMoveInSlot,
    removeMoveFromSlot,
  } = useMoveFiltering(selectedPokemon, selectedAbility);

  const [activeSlot, setActiveSlot] = useState(null);
  const [moveSearch, setMoveSearch] = useState('');
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });
  const moveWrapperRefs = useRef([null, null, null, null]);

  const handleMoveSelect = (slot, move) => {
    setMoveInSlot(slot, move);
    onMovesChange([...selectedMoves.slice(0, slot), move, ...selectedMoves.slice(slot + 1)]);
    setActiveSlot(null);
    setMoveSearch('');
  };

  const handleRemoveMove = (slot) => {
    removeMoveFromSlot(slot);
    onMovesChange([...selectedMoves.slice(0, slot), null, ...selectedMoves.slice(slot + 1)]);
  };

  const handleSlotClick = (slot, ref) => {
    if (activeSlot === slot) {
      setActiveSlot(null);
    } else {
      setActiveSlot(slot);
      if (ref?.current) {
        const rect = ref.current.getBoundingClientRect();
        setDropdownPos({ top: rect.bottom + window.scrollY, left: rect.left + window.scrollX });
      }
    }
    setMoveSearch('');
  };

  const filteredMoves = moveSearch
    ? getFilteredMoves().filter(m => m.name.toLowerCase().includes(moveSearch.toLowerCase()))
    : getFilteredMoves();

  return (
    <div style={{ padding: '12px', borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.05)' }}>
      <div style={{ fontWeight: 600, marginBottom: 12, fontSize: 14 }}>Moves</div>

      {/* Move Slots */}
      {[0, 1, 2, 3].map(slot => (
        <div
          key={slot}
          ref={el => moveWrapperRefs.current[slot] = el}
          style={{
            marginBottom: 8,
            padding: '8px 12px',
            borderRadius: 6,
            border: '1px solid rgba(255,255,255,0.2)',
            backgroundColor: 'rgba(0,0,0,0.3)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
          onClick={() => handleSlotClick(slot, moveWrapperRefs.current[slot])}
        >
          <div style={{ flex: 1 }}>
            {selectedMoves[slot] ? (
              <div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{selectedMoves[slot].name}</div>
                {selectedMoves[slot].basePower && (
                  <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>
                    BP: {selectedMoves[slot].basePower} | Type: {selectedMoves[slot].type}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ fontSize: 13, color: '#888' }}>-- Select Move --</div>
            )}
          </div>
          {selectedMoves[slot] && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleRemoveMove(slot);
              }}
              style={{
                marginLeft: 8,
                padding: '4px 8px',
                borderRadius: 4,
                border: '1px solid rgba(255,0,0,0.5)',
                backgroundColor: 'rgba(255,0,0,0.1)',
                color: '#ff6666',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              ✕
            </button>
          )}
        </div>
      ))}

      {/* Move Dropdown */}
      {activeSlot !== null && (
        <div style={{
          position: 'fixed',
          top: dropdownPos.top,
          left: dropdownPos.left,
          maxWidth: 300,
          maxHeight: 300,
          overflowY: 'auto',
          backgroundColor: 'rgba(0,0,0,0.9)',
          border: '1px solid rgba(255,255,255,0.2)',
          borderRadius: 6,
          zIndex: 1001,
          padding: 8,
        }}>
          <input
            type="text"
            placeholder="Search moves..."
            value={moveSearch}
            onChange={(e) => setMoveSearch(e.target.value)}
            style={{
              width: '100%',
              padding: '6px 8px',
              marginBottom: 8,
              borderRadius: 4,
              border: '1px solid rgba(255,255,255,0.2)',
              backgroundColor: 'rgba(255,255,255,0.05)',
              color: '#fff',
              fontSize: 12,
            }}
          />
          {filteredMoves.map(move => (
            <div
              key={move.id}
              onClick={() => handleMoveSelect(activeSlot, move)}
              style={{
                padding: '8px',
                marginBottom: 4,
                borderRadius: 4,
                backgroundColor: 'rgba(255,255,255,0.05)',
                cursor: 'pointer',
                fontSize: 12,
                borderLeft: `3px solid ${MOVE_TYPES[move.type] || '#fff'}`,
              }}
            >
              <div style={{ fontWeight: 500 }}>{move.name}</div>
              {move.basePower && (
                <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>
                  BP: {move.basePower}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default MoveSelector;
