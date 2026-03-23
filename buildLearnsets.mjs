/**
 * Run once from project root:  node buildLearnsets.mjs
 * Writes public/learnsets-gen9.json
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const buildDir  = resolve(__dirname, 'node_modules/@pkmn/dex/build');

// Find learnsets file (stable name first, then hashed fallback)
const files  = readdirSync(buildDir);
const lsFile = files.find(f => f === 'learnsets.min.js')
            ?? files.find(f => f.startsWith('learnsets') && f.endsWith('.js') && !f.endsWith('.map'));
if (!lsFile) { console.error('No learnsets*.js found in', buildDir); process.exit(1); }

console.log('Reading:', lsFile);
const text = readFileSync(resolve(buildDir, lsFile), 'utf8');
console.log('File size:', (text.length / 1e6).toFixed(1), 'MB');

// ── Parse: find every  pokemonid:{learnset:{  block ──────────────────────────
// In minified JS the structure is exactly:  someId:{learnset:{moveId:["9M",...
// The marker ":{learnset:{" lets us walk backwards to find the pokemon id.
const result = {};
const MARKER = ':{learnset:{';
let pos = 0, found = 0;

while (true) {
  const idx = text.indexOf(MARKER, pos);
  if (idx === -1) break;

  // Walk backwards from idx to collect the pokemon id
  let idEnd = idx;           // exclusive end (char before ':')
  let idStart = idEnd - 1;
  while (idStart >= 0 && /[a-z0-9]/.test(text[idStart])) idStart--;
  idStart++;                 // move past the non-alphanumeric char

  const pokemonId = text.slice(idStart, idEnd);
  if (!pokemonId || pokemonId.length < 2) { pos = idx + MARKER.length; continue; }

  // Collect the learnset content using brace counting
  const contentStart = idx + MARKER.length;
  let depth = 1, i = contentStart;
  while (i < text.length && depth > 0) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') depth--;
    i++;
  }
  const content = text.slice(contentStart, i - 1);

  // Find every move whose sources contain a Gen 9 entry ("9M", "9L12", "9E", etc.)
  const moves = [];
  const rx = /([a-z0-9]+):\[([^\]]+)\]/g;
  let m;
  while ((m = rx.exec(content)) !== null) {
    if (m[2].includes('"9') || m[2].includes("'9")) moves.push(m[1]);
  }

  if (moves.length > 0) { result[pokemonId] = moves; found++; }
  pos = i;
}

console.log(`Parsed ${found} pokemon with Gen9 moves.`);
if (found === 0) { console.error('❌ 0 entries — check the file format'); process.exit(1); }

// ── Write JSON ────────────────────────────────────────────────────────────────
mkdirSync(resolve(__dirname, 'public'), { recursive: true });
writeFileSync(resolve(__dirname, 'public/learnsets-gen9.json'), JSON.stringify(result));

const sample = result['bulbasaur'] ?? result['typhlosion'] ?? result[Object.keys(result)[0]];
const sKey   = result['bulbasaur'] ? 'bulbasaur' : result['typhlosion'] ? 'typhlosion' : Object.keys(result)[0];
console.log(`✓ Written → public/learnsets-gen9.json`);
console.log(`  [${sKey}]: ${sample.slice(0, 6).join(', ')}...`);
