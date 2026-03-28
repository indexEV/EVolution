/**
 * PokemonForm Component
 * Handles pokemon selection, ability selection, and item selection
 */

import React, { useRef, useEffect } from 'react';
import { Dex } from '@pkmn/dex';
import { normalizeAbilityName } from '../utils/display';
import { NATURES } from '../utils/pokemonConstants';

export function PokemonForm({
  searchTerm,
  setSearchTerm,
  searchOpen,
  setSearchOpen,
  allPokemon,
  selectedPokemon,
  onSelectPokemon,
  selectedAbility,
  setSelectedAbility,
  allAbilities,
  setAllAbilities,
  selectedItem,
  setSelectedItem,
  allItems,
  setAllItems,
  isShiny,
  setIsShiny,
}) {
  const searchInputRef = useRef(null);

  // Load abilities when pokemon changes
  useEffect(() => {
    if (!selectedPokemon) {
      setAllAbilities([]);
      return;
    }

    try {
      const species = Dex.species.get(selectedPokemon.id);
      if (species?.abilities) {
        const abilities = Object.values(species.abilities)
          .filter(Boolean)
          .map(name => ({ name, id: name.toLowerCase().replace(/[^a-z]/g, '') }));
        setAllAbilities(abilities);
        
        // Set first ability as default if none selected
        if (!selectedAbility && abilities.length > 0) {
          setSelectedAbility(abilities[0].name);
        }
      }
    } catch (err) {
      console.error('Error loading abilities:', err);
      setAllAbilities([]);
    }
  }, [selectedPokemon, setAllAbilities, setSelectedAbility, selectedAbility]);

  // Load items on mount
  useEffect(() => {
    try {
      const items = Array.from(Dex.items)
        .filter(([_, item]) => item.gen <= 9)
        .map(([_, item]) => ({ name: item.name, id: item.id }))
        .sort((a, b) => a.name.localeCompare(b.name));
      setAllItems(items);
    } catch (err) {
      console.error('Error loading items:', err);
    }
  }, [setAllItems]);

  const filteredPokemon = searchTerm
    ? allPokemon.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()))
    : allPokemon;

  return (
    <div style={{ padding: '12px', borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.05)' }}>
      {/* Pokemon Search */}
      <div style={{ marginBottom: 12 }}>
        <label style={{ display: 'block', fontSize: 12, marginBottom: 4, fontWeight: 600 }}>
          Pokémon
        </label>
        <div style={{ position: 'relative' }}>
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search Pokémon..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onFocus={() => setSearchOpen(true)}
            style={{
              width: '100%',
              padding: '8px 12px',
              borderRadius: 6,
              border: '1px solid rgba(255,255,255,0.2)',
              backgroundColor: 'rgba(0,0,0,0.3)',
              color: '#fff',
              fontSize: 13,
            }}
          />
          {searchOpen && (
            <div style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              maxHeight: 200,
              overflowY: 'auto',
              backgroundColor: 'rgba(0,0,0,0.7)',
              borderRadius: 6,
              border: '1px solid rgba(255,255,255,0.2)',
              marginTop: 4,
              zIndex: 1000,
            }}>
              {filteredPokemon.map(poke => (
                <div
                  key={poke.id}
                  onClick={() => {
                    onSelectPokemon(poke);
                    setSearchTerm('');
                    setSearchOpen(false);
                  }}
                  style={{
                    padding: '8px 12px',
                    cursor: 'pointer',
                    hoverBackground: 'rgba(255,255,255,0.1)',
                    borderBottom: '1px solid rgba(255,255,255,0.1)',
                  }}
                >
                  {poke.name}
                </div>
              ))}
            </div>
          )}
        </div>
        {selectedPokemon && (
          <div style={{ marginTop: 8, fontSize: 13, color: '#aaa' }}>
            Selected: <strong>{selectedPokemon.name}</strong>
          </div>
        )}
      </div>

      {/* Ability Selection */}
      {allAbilities.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', fontSize: 12, marginBottom: 4, fontWeight: 600 }}>
            Ability
          </label>
          <select
            value={selectedAbility || ''}
            onChange={(e) => setSelectedAbility(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px',
              borderRadius: 6,
              border: '1px solid rgba(255,255,255,0.2)',
              backgroundColor: 'rgba(0,0,0,0.3)',
              color: '#fff',
              fontSize: 13,
            }}
          >
            <option value="">-- Select Ability --</option>
            {allAbilities.map(ab => (
              <option key={ab.id} value={ab.name}>
                {ab.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Item Selection */}
      {allItems.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', fontSize: 12, marginBottom: 4, fontWeight: 600 }}>
            Item
          </label>
          <select
            value={selectedItem?.id || ''}
            onChange={(e) => {
              const item = allItems.find(i => i.id === e.target.value);
              setSelectedItem(item || null);
            }}
            style={{
              width: '100%',
              padding: '8px 12px',
              borderRadius: 6,
              border: '1px solid rgba(255,255,255,0.2)',
              backgroundColor: 'rgba(0,0,0,0.3)',
              color: '#fff',
              fontSize: 13,
            }}
          >
            <option value="">-- No Item --</option>
            {allItems.map(item => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Shiny Toggle */}
      <div>
        <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: 13 }}>
          <input
            type="checkbox"
            checked={isShiny}
            onChange={(e) => setIsShiny(e.target.checked)}
            style={{ marginRight: 8 }}
          />
          Shiny
        </label>
      </div>
    </div>
  );
}

export default PokemonForm;
