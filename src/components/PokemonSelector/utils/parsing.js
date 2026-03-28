/**
 * Showdown Set Parser Module
 * Parses and formats Pokémon sets in Showdown's text format.
 */

const SD_STAT_MAP = { 
  HP: 'hp', 
  Atk: 'atk', 
  Def: 'def', 
  SpA: 'spa', 
  SpD: 'spd', 
  Spe: 'spe' 
};

const STAT_NAMES = {
  hp: 'HP',
  atk: 'Atk',
  def: 'Def',
  spa: 'SpA',
  spd: 'SpD',
  spe: 'Spe',
};

/**
 * Parse a Pokémon set from Showdown format text
 * 
 * Format:
 * [Nickname] (Species) @ Item
 * Ability: Ability Name
 * Nature: Nature Name
 * EVs: X HP / Y Atk / Z Def / ...
 * IVs: X HP / Y Atk / Z Def / ...
 * Shiny: Yes
 * - Move 1
 * - Move 2
 * etc.
 * 
 * @param {string} text - Raw Showdown format text
 * @returns {Object|null} Parsed set object or null if invalid
 */
export function parseShowdownSet(text) {
  const lines = text.trim().split('\n').map(l => l.trim()).filter(Boolean);
  if (!lines.length) return null;

  // Line 1: "[Nickname] (Species) @ Item"  OR  "Species @ Item"  OR just "Species"
  let line1 = lines[0];
  let itemName = null;
  if (line1.includes(' @ ')) {
    const atIdx = line1.lastIndexOf(' @ ');
    itemName = line1.slice(atIdx + 3).trim();
    line1 = line1.slice(0, atIdx).trim();
  }

  // Strip gender marker (M) or (F)
  line1 = line1.replace(/\s*\([MF]\)\s*$/, '').trim();

  // If there's a (Species) in parens it's a nickname — extract species
  const nicknameMatch = line1.match(/^.+\((.+)\)\s*$/);
  let pokeName = nicknameMatch ? nicknameMatch[1].trim() : line1.trim();

  let ability = null, nature = null, shiny = false;
  const evs = { hp:0, atk:0, def:0, spa:0, spd:0, spe:0 };
  const ivs = { hp:31, atk:31, def:31, spa:31, spd:31, spe:31 };
  const moves = [];

  for (let i = 1; i < lines.length; i++) {
    const l = lines[i];
    if (l.startsWith('Ability: '))       { ability = l.slice(9).trim(); }
    else if (l === 'Shiny: Yes')          { shiny = true; }
    else if (l.match(/^\w+ Nature$/))     { nature = l.split(' ')[0]; }
    else if (l.startsWith('EVs: '))       {
      l.slice(5).split('/').forEach(p => {
        const parts = p.trim().split(' ');
        const n = parseInt(parts[0]);
        const s = parts[1];
        if (SD_STAT_MAP[s] && !isNaN(n)) evs[SD_STAT_MAP[s]] = n;
      });
    }
    else if (l.startsWith('IVs: '))       {
      l.slice(5).split('/').forEach(p => {
        const parts = p.trim().split(' ');
        const n = parseInt(parts[0]);
        const s = parts[1];
        if (SD_STAT_MAP[s] && !isNaN(n)) ivs[SD_STAT_MAP[s]] = n;
      });
    }
    else if (l.startsWith('- '))          { moves.push(l.slice(2).replace(/\s*\[.*?\]/, '').trim()); }
  }
  
  return { pokeName, itemName, ability, nature, shiny, evs, ivs, moves };
}

/**
 * Validate a parsed set object
 * @param {Object} set - Parsed set object
 * @returns {Object} Validation result with { valid: boolean, errors: string[] }
 */
export function validateSet(set) {
  const errors = [];

  if (!set.pokeName) errors.push('Pokemon name is required');
  
  const validStats = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
  for (const stat of validStats) {
    if (set.evs[stat] < 0 || set.evs[stat] > 252) {
      errors.push(`${stat.toUpperCase()} EV must be 0-252`);
    }
    if (set.ivs[stat] < 0 || set.ivs[stat] > 31) {
      errors.push(`${stat.toUpperCase()} IV must be 0-31`);
    }
  }

  const totalEVs = Object.values(set.evs).reduce((a, b) => a + b, 0);
  if (totalEVs > 510) {
    errors.push(`Total EVs (${totalEVs}) cannot exceed 510`);
  }

  if (set.moves.length > 4) {
    errors.push(`Pokemon can have at most 4 moves (${set.moves.length} provided)`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Format stats for display in Showdown format
 * @param {Object} stats - Stats object with hp, atk, def, spa, spd, spe keys
 * @param {string} type - 'EVs' or 'IVs'
 * @returns {string} Formatted stat string
 */
export function formatStats(stats, type = 'EVs') {
  const nonZero = [];
  const statOrder = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
  
  for (const stat of statOrder) {
    if (stats[stat] > 0) {
      nonZero.push(`${stats[stat]} ${STAT_NAMES[stat]}`);
    }
  }
  
  return nonZero.length > 0 ? `${type}: ${nonZero.join(' / ')}` : '';
}

/**
 * Build complete Showdown format set string
 * @param {Object} pokemonData - Pokemon info (name, etc.)
 * @param {Object} set - Set data (ability, nature, evs, ivs, moves, etc.)
 * @param {number} level - Pokemon level
 * @returns {string} Complete Showdown format set
 */
export function buildShowdownSet(pokemonData, set, level = 100) {
  let result = pokemonData.name;
  if (set.itemName) result += ` @ ${set.itemName}`;
  result += '\n';

  if (set.ability) result += `Ability: ${set.ability}\n`;
  if (set.shiny) result += 'Shiny: Yes\n';
  if (set.nature) result += `${set.nature} Nature\n`;
  
  const evsStr = formatStats(set.evs, 'EVs');
  if (evsStr) result += evsStr + '\n';
  
  const ivsStr = formatStats(set.ivs, 'IVs');
  if (ivsStr) result += ivsStr + '\n';

  for (const move of (set.moves || [])) {
    if (move) result += `- ${move}\n`;
  }

  return result;
}
