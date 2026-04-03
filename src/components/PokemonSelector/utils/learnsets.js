/**
 * Learnset Resolution Module
 * Handles move legality checking using @pkmn/dex at runtime.
 * A move is legal in SV VGC if the pokemon has ANY historical learnset entry for it
 * (any gen) AND the move exists in gen9 (allMoves already filters this).
 */

import { Dex } from '@pkmn/dex';

// Cache for learnsets to avoid repeated async lookups
const _lsCache = {};

/**
 * Get all learnable move IDs for a pokemon through its entire evolution chain.
 * Full prevo chain traversal - same approach as smogon damage calc.
 * A move is legal if ANY pokemon in the prevo chain can learn it in ANY gen
 * AND the move exists in gen9 (allMoves already filters this).
 * 
 * @param {string} speciesId - The species ID to check
 * @returns {Promise<Set>} Set of move IDs that can be learned
 */
export async function getAllLearnableIds(speciesId) {
  if (speciesId in _lsCache) return _lsCache[speciesId];

  const ids = new Set();
  let currentId = speciesId;
  const visited = new Set();

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    try {
      const lsData = await Dex.learnsets.get(currentId);
      Object.keys(lsData?.learnset ?? {}).forEach(id => ids.add(id));
    } catch (e) { /* skip */ }
    try {
      const species = Dex.species.get(currentId);
      const prevo = species?.prevo;
      currentId = prevo ? prevo.toLowerCase().replace(/[^a-z0-9]/g, '') : null;
    } catch (e) { currentId = null; }
  }

  // Always return the Set — never null — so callers can safely call .add() on it.
  // The cache key uses `in` check so an empty Set is a valid cached result.
  _lsCache[speciesId] = ids;
  return ids;
}

/**
 * Clear the learnset cache (useful for testing or manual refresh)
 */
export function clearLearnsetCache() {
  Object.keys(_lsCache).forEach(key => delete _lsCache[key]);
}

/**
 * Get the current cache size
 * @returns {number} Number of cached learnsets
 */
export function getCacheSizeInfo() {
  return {
    count: Object.keys(_lsCache).length,
    entries: Object.keys(_lsCache),
  };
}
