#!/usr/bin/env node
/**
 * Controlli sui design token. Falliscono la build, non avvisano soltanto.
 *
 * 1. PARITÀ FRA I TEMI. Un token dichiarato in `theme-light` e non in
 *    `theme-dark` non ha un valore quando il tema è scuro: la dichiarazione
 *    che lo usa diventa invalida e il browser la scarta in silenzio. Nessun
 *    errore, nessun test rosso — solo un colore che sparisce per metà degli
 *    utenti. È già successo: tredici token aggiunti al solo tema chiaro.
 *
 * 2. TOKEN FANTASMA. Un `var(--x)` senza fallback su un token che non esiste
 *    fa la stessa fine, e capita ogni volta che si rinomina.
 *
 * Non controlla i valori: quelli sono una scelta di design, e la fonte di
 * verità è `.claude/rules/regole-stile-ui.md`.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';

const TOKENS_FILE = 'src/styles/_design-tokens.scss';

/** Corpo di un `@mixin nome { ... }`, graffe bilanciate. */
function mixinBody(src, name) {
  const at = src.indexOf(`@mixin ${name}`);
  if (at === -1) throw new Error(`mixin ${name} non trovato in ${TOKENS_FILE}`);
  const open = src.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(open, i);
  }
  throw new Error(`mixin ${name} non chiuso`);
}

/** Toglie commenti di riga e di blocco: un `var(--x)` spiegato non e' un uso. */
const stripComments = (text) =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(/\r?\n/)
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n');

const declaredIn = (body) => new Set([...body.matchAll(/^\s*(--[\w-]+):/gm)].map((m) => m[1]));

const src = readFileSync(TOKENS_FILE, 'utf8');
const light = declaredIn(mixinBody(src, 'theme-light'));
const dark = declaredIn(mixinBody(src, 'theme-dark'));
// Un token puo' essere dichiarato anche fuori dal file dei token: i punti di
// regolazione dei componenti condivisi, le misure locali di una schermata, le
// variabili sul blocco .doc-form. Quelle sono legittime — il fantasma e' il
// nome che NESSUNO dichiara.
const all = new Set(declaredIn(src));

const problems = [];

for (const t of [...light].sort()) {
  if (!dark.has(t)) problems.push(`${t} — dichiarato nel tema chiaro, assente da quello scuro`);
}
for (const t of [...dark].sort()) {
  if (!light.has(t)) problems.push(`${t} — dichiarato nel tema scuro, assente da quello chiaro`);
}

// ── Token usati e mai dichiarati ───────────────────────────────────────────
const files = [];
(function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p);
    else if (entry.endsWith('.scss')) files.push(p.split(sep).join('/'));
  }
})('src');

// I token dichiarati fuori dal file dei token contano: sono i punti di
// regolazione dei componenti condivisi e le misure locali di una schermata.
for (const file of files) {
  for (const t of declaredIn(readFileSync(file, 'utf8'))) all.add(t);
}

const ghosts = new Map();
for (const file of files) {
  // Via i commenti: `var(--token)` in una spiegazione non e' un riferimento.
  const text = stripComments(readFileSync(file, 'utf8'));
  for (const m of text.matchAll(/var\(\s*(--[\w-]+)\s*(,)?/g)) {
    const [, name, hasFallback] = m;
    if (hasFallback || all.has(name)) continue;
    // Punti di regolazione e variabili locali: dichiarati dove servono.
    if (new RegExp(`^\\s*${name}\\s*:`, 'm').test(text)) continue;
    if (!ghosts.has(name)) ghosts.set(name, new Set());
    ghosts.get(name).add(file.replace('src/app/', ''));
  }
}
for (const [name, where] of [...ghosts].sort()) {
  problems.push(`${name} — usato senza fallback e mai dichiarato (${[...where].join(', ')})`);
}

if (problems.length > 0) {
  console.error(`\n✖ ${problems.length} problemi sui design token:\n`);
  for (const p of problems) console.error(`  ${p}`);
  console.error('');
  process.exit(1);
}

console.log(`✓ design token: ${light.size} per tema, parità fra chiaro e scuro, nessun fantasma.`);
