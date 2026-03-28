/**
 * Display Utilities Module
 * Handles move base power calculation and display formatting
 */

/**
 * Compute display base power for a move considering variable BP mechanics
 * Handles moves that scale with HP, weight, speed, or opponent status
 * 
 * @param {Object} move - Move object with id and basePower
 * @param {Object} attacker - Attacker stats { weight, spe, currentHp, maxHp }
 * @param {Object} defender - Defender stats { weight, spe, currentHp, maxHp }
 * @returns {number|null} Display base power or null if move is non-damaging
 */
export const computeDisplayBP = (move, attacker, defender) => {
  if (!move) return null;
  const id = move.id;
  const base = move.basePower;

  // attacker = { weight, spe, currentHp, maxHp }
  // defender = { weight, spe, currentHp, maxHp }
  const aHp  = attacker?.currentHp ?? attacker?.maxHp ?? 1;
  const aMax = attacker?.maxHp ?? 1;
  const dHp  = defender?.currentHp ?? defender?.maxHp ?? 1;
  const dMax = defender?.maxHp ?? 1;
  const aW   = attacker?.weight || 1;
  const dW   = defender?.weight || 1;
  const aSpe = attacker?.spe || 1;
  const dSpe = defender?.spe || 1;

  // HP-based (stronger at full HP) — user
  if (['eruption','waterspout','dragonenergy'].includes(id)) {
    return Math.max(1, Math.floor(150 * aHp / aMax));
  }
  // HP-based (stronger at low HP) — user
  if (['flail','reversal','mightycleaverflail'].includes(id)) {
    const pct = aHp / aMax * 100;
    if (pct <= 4.17)  return 200;
    if (pct <= 10.42) return 150;
    if (pct <= 20.83) return 100;
    if (pct <= 35.42) return 80;
    if (pct <= 68.75) return 40;
    return 20;
  }
  // HP-based (target HP)
  if (['crushgrip','wringout'].includes(id)) {
    return Math.max(1, Math.floor(120 * dHp / dMax));
  }
  if (id === 'hardpress') {
    return Math.max(1, Math.floor(100 * dHp / dMax));
  }
  // Weight-based (target weight)
  if (['grassknot','lowkick'].includes(id)) {
    if (dW < 10)  return 20;
    if (dW < 25)  return 40;
    if (dW < 50)  return 60;
    if (dW < 100) return 80;
    if (dW < 200) return 100;
    return 120;
  }
  // Weight-based (attacker vs target)
  if (['heavyslam','heatcrash'].includes(id)) {
    const ratio = aW / dW;
    if (ratio >= 5) return 120;
    if (ratio >= 4) return 100;
    if (ratio >= 3) return 80;
    if (ratio >= 2) return 60;
    return 40;
  }
  // Speed-based (gyro ball: slower user = more power)
  if (id === 'gyroball') {
    return Math.min(150, Math.floor(25 * dSpe / aSpe));
  }
  // Speed-based (electro ball: faster user = more power)
  if (id === 'electroball') {
    const r = Math.floor(aSpe / dSpe);
    if (r >= 4) return 150;
    if (r >= 3) return 120;
    if (r >= 2) return 80;
    if (r >= 1) return 60;
    return 40;
  }
  return base > 0 ? base : null;
};

/**
 * Normalize ability name for comparison (lowercase, no special chars)
 * @param {string} name - Ability name
 * @returns {string} Normalized ability name
 */
export const normalizeAbilityName = (s) => (s ?? '').toLowerCase().replace(/[^a-z]/g, '');

/**
 * Format a number with appropriate decimals
 * @param {number} value - Value to format
 * @param {number} decimals - Number of decimal places
 * @returns {string} Formatted number
 */
export const formatNumber = (value, decimals = 0) => {
  return value.toFixed(decimals);
};

/**
 * Get color for a stat based on standard Pokemon stat colors
 * @param {string} stat - Stat abbreviation (atk, def, spa, spd, spe, hp)
 * @returns {string} Hex color code
 */
export const getStatColor = (stat) => {
  const STAT_COLORS = {
    hp: '#FF5252',
    atk: '#B8D8FF',
    def: '#98D8B8',
    spa: '#C8E8A0',
    spd: '#F0F080',
    spe: '#F8B860',
  };
  return STAT_COLORS[stat] || '#FFFFFF';
};

/**
 * Format stat display string for UI
 * @param {Object} stats - Stats object { hp, atk, def, spa, spd, spe }
 * @param {Array<string>} order - Order of stats to display
 * @returns {string} Formatted stats string
 */
export const formatStatsDisplay = (stats, order = ['hp', 'atk', 'def', 'spa', 'spd', 'spe']) => {
  return order.map(stat => `${stat.toUpperCase()}: ${stats[stat] ?? 0}`).join(' / ');
};
