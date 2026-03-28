/**
 * PokemonSelector Component (Refactored)
 * Main component that manages all pokemon-related state and renders sub-components
 */

import React, { forwardRef, useImperativeHandle } from 'react';
import { Dex } from '@pkmn/dex';
import { usePokemonState } from './PokemonSelector/hooks/usePokemonState';
import { useMoveFiltering } from './PokemonSelector/hooks/useMoveFiltering';
import PokemonForm from './PokemonSelector/components/PokemonForm';
import StatsForm from './PokemonSelector/components/StatsForm';
import MoveSelector from './PokemonSelector/components/MoveSelector';
import { normalizeAbilityName } from '../utils/display';
import { getModifierPills, applyModifiers, computeEffectiveStages } from '../utils/modifiers';
import '../styles/PokemonSelector.css';

const PokemonSelector = forwardRef(({
  title = 'Pokémon',
  onSelect,
  selectedPokemon: initialPokemon = null,
  collapsed = false,
  step = 1,
  onAbilityError,
  opponentInfo,
  opponentFullState,
  opponentPokemon,
  onStateChange,
  level = 100,
  onLevelChange = null,
  fieldConditions = null,
}, ref) => {
  // Main state hook
  const state = usePokemonState(initialPokemon, onStateChange);

  // Move filtering hook
  const moveState = useMoveFiltering(initialPokemon, state.selectedAbility);

  // Expose state to parent via ref
  useImperativeHandle(ref, () => ({
    getState: () => ({
      pokemon: initialPokemon,
      ability: state.selectedAbility,
      evs: state.userEvs,
      ivs: state.userIvs,
      nature: state.selectedNature,
      level: parseInt(state.levelRaw) || 100,
      item: state.selectedItem,
      moves: moveState.selectedMoves,
      status: state.status,
      isShiny: state.isShiny,
      statStages: state.statStages,
      activeModifiers: state.activeModifiers,
      stackCounts: state.stackCounts,
    }),
    setPokemon: (poke) => {
      // Handle pokemon selection
    },
    resetState: state.resetState,
  }), [initialPokemon, state, moveState]);

  // Handle pokemon selection
  const handleSelectPokemon = (pokemon) => {
    // Update selected pokemon logic here
    if (onSelect) onSelect(pokemon);
  };

  // Calculate stats based on inputs
  const calculateStats = React.useCallback(() => {
    if (!initialPokemon) return null;

    try {
      const species = Dex.species.get(initialPokemon.id);
      if (!species) return null;

      const baseStats = {
        hp: species.baseStats.hp,
        atk: species.baseStats.atk,
        def: species.baseStats.def,
        spa: species.baseStats.spa,
        spd: species.baseStats.spd,
        spe: species.baseStats.spe,
      };

      const level = parseInt(state.levelRaw) || 100;
      const calculated = {};

      // Stat calculation formula
      for (const stat of ['hp', 'atk', 'def', 'spa', 'spd', 'spe']) {
        let base = baseStats[stat];
        const iv = state.userIvs[stat] ?? 31;
        const ev = state.userEvs[stat] ?? 0;

        if (stat === 'hp') {
          calculated[stat] = Math.floor((2 * base + iv + ev / 4) * level / 100 + level + 5);
        } else {
          let val = Math.floor((2 * base + iv + ev / 4) * level / 100 + 5);
          
          // Apply nature boost/drop
          const nature = state.selectedNature;
          const natureData = NATURES[nature];
          if (natureData?.boost === stat) val = Math.floor(val * 1.1);
          if (natureData?.drop === stat) val = Math.floor(val * 0.9);

          calculated[stat] = val;
        }
      }

      return calculated;
    } catch (err) {
      console.error('Stat calculation error:', err);
      return null;
    }
  }, [initialPokemon, state.levelRaw, state.userIvs, state.userEvs, state.selectedNature]);

  React.useEffect(() => {
    const stats = calculateStats();
    state.setCalculatedStats(stats);
  }, [calculateStats, state]);

  // Handle outside clicks to close dropdowns
  React.useEffect(() => {
    const handleClick = (e) => {
      if (!e.target.closest('.pokemon-selector-root')) {
        state.setSearchOpen(false);
        state.setNatureOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [state]);

  return (
    <div className="pokemon-selector-root" style={{ padding: 16, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.4)' }}>
      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>
        {title}
      </div>

      {/* Main Content */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <PokemonForm
          searchTerm={state.searchTerm}
          setSearchTerm={state.setSearchTerm}
          searchOpen={state.searchOpen}
          setSearchOpen={state.setSearchOpen}
          allPokemon={state.allPokemon}
          selectedPokemon={initialPokemon}
          onSelectPokemon={handleSelectPokemon}
          selectedAbility={state.selectedAbility}
          setSelectedAbility={state.setSelectedAbility}
          allAbilities={state.allAbilities}
          setAllAbilities={state.setAllAbilities}
          selectedItem={state.selectedItem}
          setSelectedItem={state.setSelectedItem}
          allItems={state.allItems}
          setAllItems={state.setAllItems}
          isShiny={state.isShiny}
          setIsShiny={state.setIsShiny}
        />

        <MoveSelector
          selectedPokemon={initialPokemon}
          selectedAbility={state.selectedAbility}
          selectedMoves={moveState.selectedMoves}
          onMovesChange={moveState.setSelectedMoves}
        />

        <StatsForm
          userEvs={state.userEvs}
          setUserEvs={state.setUserEvs}
          evRaw={state.evRaw}
          setEvRaw={state.setEvRaw}
          userIvs={state.userIvs}
          setUserIvs={state.setUserIvs}
          selectedNature={state.selectedNature}
          setSelectedNature={state.setSelectedNature}
          levelRaw={state.levelRaw}
          setLevelRaw={state.setLevelRaw}
          calculatedStats={state.calculatedStats}
        />
      </div>
    </div>
  );
});

PokemonSelector.displayName = 'PokemonSelector';

export default PokemonSelector;
