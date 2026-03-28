/**
 * useMoveFiltering Hook
 * Manages move filtering, legality checking, and move-related state
 */

import { useState, useRef, useEffect } from 'react';
import { Dex } from '@pkmn/dex';
import { getAllLearnableIds } from '../utils/learnsets';

export function useMoveFiltering(selectedPokemon, selectedAbility) {
  const [allMoves, setAllMoves] = useState([]);
  const [legalMoveIds, setLegalMoveIds] = useState(new Set());
  const [selectedMoves, setSelectedMoves] = useState([null, null, null, null]);
  const [moveSearch, setMoveSearch] = useState('');
  const [moveSearchOpen, setMoveSearchOpen] = useState(false);
  const [activeMoveSlot, setActiveMoveSlot] = useState(null);
  const [moveDropdownPos, setMoveDropdownPos] = useState({ top: 0, left: 0 });
  const moveSearchInputRef = useRef(null);

  // Load all moves on mount (Gen 9)
  useEffect(() => {
    const moves = Array.from(Dex.moves)
      .filter(([_, m]) => m.gen <= 9)
      .map(([_, m]) => ({ name: m.name, id: m.id, basePower: m.basePower, type: m.type }))
      .sort((a, b) => a.name.localeCompare(b.name));
    setAllMoves(moves);
  }, []);

  // Update legal moves when pokemon changes
  useEffect(() => {
    if (!selectedPokemon) {
      setLegalMoveIds(new Set());
      return;
    }

    const fetchLegalMoves = async () => {
      try {
        const legalIds = await getAllLearnableIds(selectedPokemon.id);
        setLegalMoveIds(legalIds);
      } catch (err) {
        console.error('Failed to load legal moves:', err);
        setLegalMoveIds(new Set());
      }
    };

    fetchLegalMoves();
  }, [selectedPokemon]);

  // Filter moves based on search term
  const getFilteredMoves = () => {
    const term = moveSearch.toLowerCase();
    return allMoves.filter(m => {
      const isLegal = legalMoveIds.has(m.id);
      const matchesSearch = m.name.toLowerCase().includes(term);
      return isLegal && matchesSearch;
    });
  };

  // Get available moves (not already selected in other slots)
  const getAvailableMoves = () => {
    const filtered = getFilteredMoves();
    const selectedIds = new Set(
      selectedMoves.map(m => m?.id).filter(Boolean)
    );
    return filtered.filter(m => !selectedIds.has(m.id));
  };

  // Add/update move in slot
  const setMoveInSlot = (slot, move) => {
    const newMoves = [...selectedMoves];
    newMoves[slot] = move;
    setSelectedMoves(newMoves);
  };

  // Remove move from slot
  const removeMoveFromSlot = (slot) => {
    const newMoves = [...selectedMoves];
    newMoves[slot] = null;
    setSelectedMoves(newMoves);
  };

  // Clear all moves
  const clearAllMoves = () => {
    setSelectedMoves([null, null, null, null]);
  };

  // Reset on pokemon change (optional)
  const resetMoves = () => {
    setSelectedMoves([null, null, null, null]);
    setMoveSearch('');
    setMoveSearchOpen(false);
    setActiveMoveSlot(null);
  };

  return {
    allMoves,
    legalMoveIds,
    selectedMoves, setSelectedMoves,
    moveSearch, setMoveSearch,
    moveSearchOpen, setMoveSearchOpen,
    activeMoveSlot, setActiveMoveSlot,
    moveDropdownPos, setMoveDropdownPos,
    moveSearchInputRef,

    // Helpers
    getFilteredMoves,
    getAvailableMoves,
    setMoveInSlot,
    removeMoveFromSlot,
    clearAllMoves,
    resetMoves,
  };
}
