/**
 * usePokemonState Hook
 * Manages all Pokemon-related state (selection, abilities, moves, stats, etc.)
 */

import { useState, useRef, useEffect } from 'react';
import { Dex } from '@pkmn/dex';
import { normalizeAbilityName } from '../utils/display';

export function usePokemonState(initialPokemon = null, onStateChange = null) {
  // Search and selection
  const [searchTerm, setSearchTerm] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef(null);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 });
  const [allPokemon, setAllPokemon] = useState([]);

  // EV/IV management
  const [userEvs, setUserEvs] = useState({ hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 });
  const [evRaw, setEvRaw] = useState({ hp: '', atk: '', def: '', spa: '', spd: '', spe: '' });
  const [userIvs, setUserIvs] = useState({ hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 });
  const [evError, setEvError] = useState(null);

  // Stage and modifier management
  const [statStages, setStatStages] = useState({ atk: 0, def: 0, spa: 0, spd: 0, spe: 0 });
  const [activeModifiers, setActiveModifiers] = useState(new Set());
  const entryPillDefsRef = useRef([]);

  // Stack abilities
  const [stackCounts, setStackCounts] = useState({
    speedboost: 0, moxie: 0, grimneigh: 0, chillingneigh: 0, beastboost: 0,
    asone: 0, stamina: 0, berserk: 0, strengthsap: 0, justified: 0, rattled: 0,
    thermalexchange: 0, sapsipper: 0, motordrive: 0, lightningrod: 0,
    stormdrain: 0, steamengine: 0, watercompaction: 0, weakarmor: 0, angershell: 0
  });
  const [stackDropdownOpen, setStackDropdownOpen] = useState(null);
  const [stackDropdownRect, setStackDropdownRect] = useState(null);

  // Ability management
  const [selectedAbility, setSelectedAbility] = useState(null);
  const [tracedAbility, setTracedAbility] = useState(null);
  const [poaPickedAbility, setPoaPickedAbility] = useState(null);
  const [poaSearch, setPoaSearch] = useState('');
  const [poaOpen, setPoaOpen] = useState(false);
  const [poaDropdownPos, setPoaDropdownPos] = useState({ top: 0, left: 0, bottom: null });
  const [shakeAbility, setShakeAbility] = useState(false);

  // Status and item
  const [status, setStatus] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [isShiny, setIsShiny] = useState(false);

  // Nature
  const [selectedNature, setSelectedNature] = useState('Hardy');
  const [natureOpen, setNatureOpen] = useState(false);
  const natureTriggerRef = useRef(null);

  // Level
  const [levelRaw, setLevelRaw] = useState('100');

  // Calculated stats
  const [calculatedStats, setCalculatedStats] = useState(null);

  // Image URLs
  const [resolvedImageUrl, setResolvedImageUrl] = useState(null);
  const imageCache = useRef({});

  // Items
  const [allItems, setAllItems] = useState([]);
  const [allAbilities, setAllAbilities] = useState([]);
  const [itemSearch, setItemSearch] = useState('');
  const [itemSearchOpen, setItemSearchOpen] = useState(false);
  const itemWrapperRef = useRef(null);
  const itemSpriteCache = useRef({});

  // Moves
  const moveWrapperRefs = useRef([null, null, null, null]);
  const [moveSlotRects, setMoveSlotRects] = useState([null, null, null, null]);

  // Dropdown states
  const [openStageDropdown, setOpenStageDropdown] = useState(null);
  const [dropdownDir, setDropdownDir] = useState('down');
  const [stageDropdownRect, setStageDropdownRect] = useState(null);

  // Helper: normalize ability name
  const normalizeAb = normalizeAbilityName;

  // Reset function
  const resetState = () => {
    setSearchTerm('');
    setUserEvs({ hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 });
    setEvRaw({ hp: '', atk: '', def: '', spa: '', spd: '', spe: '' });
    setUserIvs({ hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 });
    setStatStages({ atk: 0, def: 0, spa: 0, spd: 0, spe: 0 });
    setActiveModifiers(new Set());
    setStackCounts({
      speedboost: 0, moxie: 0, grimneigh: 0, chillingneigh: 0, beastboost: 0,
      asone: 0, stamina: 0, berserk: 0, strengthsap: 0, justified: 0, rattled: 0,
      thermalexchange: 0, sapsipper: 0, motordrive: 0, lightningrod: 0,
      stormdrain: 0, steamengine: 0, watercompaction: 0, weakarmor: 0, angershell: 0
    });
    setSelectedAbility(null);
    setTracedAbility(null);
    setStatus(null);
    setSelectedItem(null);
    setIsShiny(false);
    setSelectedNature('Hardy');
    setLevelRaw('100');
    setResolvedImageUrl(null);
  };

  // Load all pokemon on mount
  useEffect(() => {
    const pokes = Array.from(Dex.species)
      .filter(([_, p]) => p.gen <= 9 && !p.isNonstandard)
      .map(([_, p]) => ({ name: p.name, id: p.id }))
      .sort((a, b) => a.name.localeCompare(b.name));
    setAllPokemon(pokes);
  }, []);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (e.target.closest('.nature-dropdown-list') ||
          e.target.closest('.stat-stage-menu') ||
          e.target.closest('.search-results') ||
          e.target.closest('.nature-dropdown-wrap') ||
          e.target.closest('.stat-stage-dropdown') ||
          e.target.closest('.poa-dropdown-list') ||
          e.target.closest('.pokemon-search')) return;
      setNatureOpen(false);
      setOpenStageDropdown(null);
      setSearchOpen(false);
      setPoaOpen(false);
      setStackDropdownOpen(null);
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  return {
    // Search
    searchTerm, setSearchTerm, searchOpen, setSearchOpen, searchInputRef,
    dropdownPos, setDropdownPos, allPokemon, setAllPokemon,

    // EV/IV
    userEvs, setUserEvs, evRaw, setEvRaw, userIvs, setUserIvs, evError, setEvError,

    // Stages & modifiers
    statStages, setStatStages, activeModifiers, setActiveModifiers,
    entryPillDefsRef, stackCounts, setStackCounts,
    stackDropdownOpen, setStackDropdownOpen, stackDropdownRect, setStackDropdownRect,

    // Ability
    selectedAbility, setSelectedAbility, tracedAbility, setTracedAbility,
    poaPickedAbility, setPoaPickedAbility, poaSearch, setPoaSearch,
    poaOpen, setPoaOpen, poaDropdownPos, setPoaDropdownPos, shakeAbility, setShakeAbility,

    // Status & item
    status, setStatus, selectedItem, setSelectedItem, isShiny, setIsShiny,

    // Nature & level
    selectedNature, setSelectedNature, natureOpen, setNatureOpen, natureTriggerRef,
    levelRaw, setLevelRaw,

    // Calculated
    calculatedStats, setCalculatedStats, resolvedImageUrl, setResolvedImageUrl, imageCache,

    // Items
    allItems, setAllItems, allAbilities, setAllAbilities, itemSearch, setItemSearch,
    itemSearchOpen, setItemSearchOpen, itemWrapperRef, itemSpriteCache,

    // Moves
    moveWrapperRefs, moveSlotRects, setMoveSlotRects,

    // Dropdowns
    openStageDropdown, setOpenStageDropdown, dropdownDir, setDropdownDir,
    stageDropdownRect, setStageDropdownRect,

    // Helpers
    normalizeAb, resetState,
  };
}
