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
import { parseShowdownSet } from './PokemonSelector/utils/parsing';
import { normalizeAbilityName } from './PokemonSelector/utils/display';
import { getModifierPills, applyModifiers, computeEffectiveStages } from './PokemonSelector/utils/modifiers';
import { NATURES } from './PokemonSelector/utils/pokemonConstants';
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

  const hasTransformMove = React.useMemo(
    () => (moveState.selectedMoves ?? []).some(m => (m?.id ?? '').toLowerCase() === 'transform' || (m?.name ?? '').toLowerCase() === 'transform'),
    [moveState.selectedMoves]
  );

  const isTransformActive = !!initialPokemon && !!opponentPokemon &&
    (normalizeAbilityName(state.selectedAbility) === 'imposter' || hasTransformMove);

  const effectivePokemon = isTransformActive ? opponentPokemon : initialPokemon;
  const effectiveAbility = React.useMemo(() => {
    if (!isTransformActive) return state.selectedAbility;
    return opponentFullState?.ability ?? opponentInfo?.ability ?? state.selectedAbility;
  }, [isTransformActive, opponentFullState?.ability, opponentInfo?.ability, state.selectedAbility]);

  const modifierPills = React.useMemo(
    () => getModifierPills(state.selectedAbility, state.status, state.entryPillDefsRef.current, effectiveAbility, effectivePokemon?.id ?? initialPokemon?.id),
    [state.selectedAbility, state.status, state.entryPillDefsRef, effectiveAbility, effectivePokemon?.id, initialPokemon?.id]
  );

  const effectiveStages = React.useMemo(
    () => computeEffectiveStages(state.statStages, opponentInfo, modifierPills, state.activeModifiers, state.stackCounts, state.calculatedStats, effectiveAbility),
    [state.statStages, opponentInfo, modifierPills, state.activeModifiers, state.stackCounts, state.calculatedStats, effectiveAbility]
  );

  React.useEffect(() => {
    setTimeout(() => {
      if (!onStateChange) return;
      onStateChange({
        ability: effectiveAbility,
        intimidateActive: normalizeAbilityName(effectiveAbility) === 'intimidate',
        transformed: isTransformActive,
        pokemon: effectivePokemon,
      });
    }, 0);
  }, [onStateChange, effectiveAbility, isTransformActive, effectivePokemon]);

  React.useEffect(() => {
    const autoEnabled = new Set(modifierPills.filter(p => p.autoEnable).map(p => p.id));
    state.setActiveModifiers(prev => {
      const next = new Set(autoEnabled);
      for (const id of prev) {
        if (modifierPills.some(p => p.id === id)) next.add(id);
      }
      return next;
    });
  }, [modifierPills, state.setActiveModifiers]);

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
    getFullState: () => {
      const normalizedStages = effectiveStages;
      const stats = state.calculatedStats ?? {};
      const finalStats = { ...stats };
      for (const stat of ['atk', 'def', 'spa', 'spd', 'spe']) {
        const stage = normalizedStages[stat] ?? 0;
        const stagedVal = Math.max(1, Math.floor((stats[stat] ?? 0) * (stage >= 0 ? (2 + stage) / 2 : 2 / (2 - stage))));
        finalStats[stat] = applyModifiers(stat, stagedVal, finalStats, state.selectedAbility, state.activeModifiers, state.stackCounts, effectiveAbility);
      }

      const shownBaseStats = effectivePokemon?.baseStats
        ? { ...effectivePokemon.baseStats, hp: initialPokemon?.baseStats?.hp ?? effectivePokemon.baseStats.hp }
        : null;

      return {
        pokemon: effectivePokemon,
        originalPokemon: initialPokemon,
        transformed: isTransformActive,
        ability: effectiveAbility,
        item: state.selectedItem ? Dex.items.get(state.selectedItem.id ?? state.selectedItem) : null,
        moves: moveState.selectedMoves,
        stages: normalizedStages,
        stats: finalStats,
        baseStats: shownBaseStats,
      };
    },
    setPokemon: (poke) => {
      if (!poke) {
        state.resetState();
        if (onSelect) onSelect(null);
        return;
      }

      state.setSearchTerm(poke.name ?? '');
      if (onSelect) onSelect(poke);
    },
    setFullState: (fullState) => {
      if (!fullState) return;
      if (onSelect && fullState.originalPokemon) onSelect(fullState.originalPokemon);
      state.setSelectedAbility(fullState.ability ?? null);
      state.setSelectedItem(fullState.item ?? null);
      state.setStatStages(fullState.stages ?? { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 });
      if (Array.isArray(fullState.moves)) moveState.setSelectedMoves(fullState.moves);
    },
    validateAbility: () => true,
    applyEntryEffects: (effects = []) => {
      state.entryPillDefsRef.current = (effects ?? []).map((e, i) => ({
        id: `entry-${i}-${(e.label ?? 'effect').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        label: e.label ?? 'Effect',
        role: e.role,
        reaction: e.reaction,
        autoEnable: !!e.autoEnable,
      }));
      const autoEnabled = new Set(state.entryPillDefsRef.current.filter(e => e.autoEnable).map(e => e.id));
      state.setActiveModifiers(prev => new Set([...prev, ...autoEnabled]));
    },
    loadShowdownSet: (text) => {
      const parsed = parseShowdownSet(text ?? '');
      if (!parsed?.pokeName) return { success: false, error: 'Could not parse set.' };
      const species = Dex.species.get(parsed.pokeName);
      if (!species?.exists) return { success: false, error: `Unknown Pokémon: ${parsed.pokeName}` };
      onSelect?.({ name: species.name, id: species.id, num: species.num, baseStats: species.baseStats });
      state.setSelectedAbility(parsed.ability ?? null);
      state.setSelectedNature(parsed.nature ?? 'Hardy');
      state.setIsShiny(!!parsed.shiny);
      state.setUserEvs(parsed.evs);
      state.setEvRaw(Object.fromEntries(Object.entries(parsed.evs).map(([k, v]) => [k, String(v)])));
      state.setUserIvs(parsed.ivs);
      if (parsed.itemName) state.setSelectedItem(parsed.itemName);
      const parsedMoves = (parsed.moves ?? []).slice(0, 4).map(name => {
        const m = Dex.moves.get(name);
        return m?.exists ? { name: m.name, id: m.id, basePower: m.basePower, type: m.type } : null;
      });
      moveState.setSelectedMoves([parsedMoves[0] ?? null, parsedMoves[1] ?? null, parsedMoves[2] ?? null, parsedMoves[3] ?? null]);
      return { success: true };
    },
    resetState: state.resetState,
  }), [initialPokemon, moveState, onSelect, state, effectiveStages, effectivePokemon, isTransformActive, effectiveAbility]);

  // Handle pokemon selection
  const handleSelectPokemon = (pokemon) => {
    // Update selected pokemon logic here
    if (onSelect) onSelect(pokemon);
  };

  // Calculate stats based on inputs
  const calculateStats = React.useCallback(() => {
    if (!effectivePokemon) return null;

    try {
      const species = Dex.species.get(effectivePokemon.id);
      const originalSpecies = initialPokemon ? Dex.species.get(initialPokemon.id) : null;
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
          const hpBase = isTransformActive && originalSpecies?.baseStats?.hp ? originalSpecies.baseStats.hp : base;
          calculated[stat] = Math.floor((2 * hpBase + iv + ev / 4) * level / 100 + level + 10);
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
  }, [effectivePokemon, initialPokemon, isTransformActive, state.levelRaw, state.userIvs, state.userEvs, state.selectedNature]);

  React.useEffect(() => {
    const stats = calculateStats();
    state.setCalculatedStats(stats);
  }, [calculateStats, state.setCalculatedStats]);

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
  }, [state.setNatureOpen, state.setSearchOpen]);

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
