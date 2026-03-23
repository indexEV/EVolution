import { Generations } from '@smogon/calc';

export function getAllPokemonData() {
  const gen = Generations.get(9);
  
  // Get a specific Pokemon
  const ogerpon = gen.species.get('ogerpon');
  const incineroar = gen.species.get('incineroar');
  
  console.log('Ogerpon:', ogerpon);
  console.log('Incineroar:', incineroar);
  
  return gen;
}