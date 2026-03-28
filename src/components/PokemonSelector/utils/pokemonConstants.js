/**
 * Constants and Data for Pokemon Selector
 * Includes natures, stat colors, status conditions, and special move/ability configurations
 */

export const NATURES = {
  Hardy:   { boost: null, drop: null },
  Lonely:  { boost: 'atk', drop: 'def' },
  Brave:   { boost: 'atk', drop: 'spe' },
  Adamant: { boost: 'atk', drop: 'spa' },
  Naughty: { boost: 'atk', drop: 'spd' },
  Bold:    { boost: 'def', drop: 'atk' },
  Docile:  { boost: null, drop: null },
  Relaxed: { boost: 'def', drop: 'spe' },
  Impish:  { boost: 'def', drop: 'spa' },
  Lax:     { boost: 'def', drop: 'spd' },
  Timid:   { boost: 'spe', drop: 'atk' },
  Hasty:   { boost: 'spe', drop: 'def' },
  Serious: { boost: null, drop: null },
  Jolly:   { boost: 'spe', drop: 'spa' },
  Naive:   { boost: 'spe', drop: 'spd' },
  Modest:  { boost: 'spa', drop: 'atk' },
  Mild:    { boost: 'spa', drop: 'def' },
  Quiet:   { boost: 'spa', drop: 'spe' },
  Bashful: { boost: null, drop: null },
  Rash:    { boost: 'spa', drop: 'spd' },
  Calm:    { boost: 'spd', drop: 'atk' },
  Gentle:  { boost: 'spd', drop: 'def' },
  Sassy:   { boost: 'spd', drop: 'spe' },
  Careful: { boost: 'spd', drop: 'spa' },
  Quirky:  { boost: null, drop: null },
};

export const STAT_COLORS = {
  hp: '#FF5252',
  atk: '#B8D8FF',
  def: '#98D8B8',
  spa: '#C8E8A0',
  spd: '#F0F080',
  spe: '#F8B860',
};

export const STATUS_CONDITIONS = [
  { id: 'brn',  label: 'BRN',  name: 'Burned',       color: '#FF7034', bg: 'rgba(255,112,52,0.15)'  },
  { id: 'par',  label: 'PAR',  name: 'Paralyzed',    color: '#F8D030', bg: 'rgba(248,208,48,0.15)'  },
  { id: 'psn',  label: 'PSN',  name: 'Poisoned',     color: '#B97FC9', bg: 'rgba(185,127,201,0.15)' },
  { id: 'tox',  label: 'TOX',  name: 'Badly Psn.',   color: '#7B3F8C', bg: 'rgba(123,63,140,0.15)'  },
  { id: 'frz',  label: 'FRZ',  name: 'Frozen',       color: '#60C8F8', bg: 'rgba(96,200,248,0.15)'  },
  { id: 'slp',  label: 'SLP',  name: 'Asleep',       color: '#A8A8A8', bg: 'rgba(168,168,168,0.15)' },
];

/**
 * Pokemon that must have specific moves locked to specific slots (no X button).
 * Keys match pokemon.id exactly as returned by @pkmn/data.
 */
export const FORCED_MOVES = {
  // Keldeo-Resolute must know Secret Sword (form requirement)
  'keldeo-resolute':   [{ slot: 0, moveName: 'Secret Sword' }],
  // Zacian-Crowned: Iron Head → Behemoth Blade in battle
  'zacian-crowned':    [{ slot: 0, moveName: 'Behemoth Blade' }],
  // Zamazenta-Crowned: Iron Head → Behemoth Bash in battle
  'zamazenta-crowned': [{ slot: 0, moveName: 'Behemoth Bash' }],
};

export const BOOST_STAT_PRIORITY = ['atk','def','spa','spd','spe'];

/**
 * Stack-based abilities — each activation = +1 stat stage on the listed stat.
 * beast boost / as one: highest stat (resolved at render time).
 */
export const STACK_STAT = {
  speedboost:   'spe',
  moxie:        'atk',
  grimneigh:    'spa',
  chillingneigh:'atk',
  beastboost:   null,  // highest stat resolved dynamically
  asone:        null,  // composite — same as beast boost half
  asonegrimm:   null,
  stamina:      'def',
  berserk:      'spa',
  strengthsap:  'atk', // negative on target — apply as -1 per use
};
