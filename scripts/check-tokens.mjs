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
 * 3. TOKEN LETTI DAL TYPESCRIPT. Un `getPropertyValue('--x')` su un nome che
 *    nessuno dichiara restituisce stringa vuota: nessun errore, nessun test
 *    rosso, e il codice prosegue con un valore che non c'è. È il caso di
 *    `--viewport-compact-max`, da cui dipende quale delle due viste di riga
 *    documento è viva nel DOM — rinominarlo senza accorgersene lascerebbe
 *    l'app sempre sulla vista desktop, anche su un telefono.
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
const tsFiles = [];
(function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p);
    else if (entry.endsWith('.scss')) files.push(p.split(sep).join('/'));
    else if (entry.endsWith('.ts') && !entry.endsWith('.spec.ts'))
      tsFiles.push(p.split(sep).join('/'));
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

// ── 4. FANTASMI CON FALLBACK — il buco da cui rientrano i difetti muti ─────
//
// ⛔ **Il fallback è l'unico posto dove un nome sbagliato non si vede.** Questo
// controllo si fermava alla virgola, e sotto ci sono passati difetti veri,
// misurati il 01/09/2026:
//
//   --color-warning-text → var(--color-text)     l'avviso di stampa color testo normale
//   --color-error-text   → var(--color-text)     l'errore degli allegati, idem
//   --color-surface-subtle → var(--color-surface)  cinque pannelli «tenui» bianchi
//   --motion-fast        → 120ms                 una durata fuori dal design system
//
// Il fallback non è una degradazione elegante: **annulla il segnale**. Un errore
// reso color testo normale è indistinguibile dal testo intorno, ed era l'unica
// cosa che lo distingueva.
//
// ## Come si distingue un knob da un refuso
//
// ⭐ **Un punto di regolazione è tale se QUALCUNO lo imposta, o se la regola lo
// elenca.** `--button-h` lo impostano i contenitori; `--span` lo impostano gli
// HTML dell'anagrafica; `--badge-h` sta nella tabella di `regole-stile-ui` §5.
// Un nome che nessuno imposta e che nessuna regola nomina non è un canale di
// configurazione: è un nome che chi l'ha scritto credeva esistesse.
//
// ⚠️ **Documentarlo è una via d'uscita legittima, e voluta**: un knob nuovo si
// dichiara nella tabella §5, che è il posto dove chi configura va a cercarlo.
const htmlFiles = [];
(function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p);
    else if (entry.endsWith('.html')) htmlFiles.push(p.split(sep).join('/'));
  }
})('src');

// Chi IMPOSTA un token: una dichiarazione SCSS, o uno `style` inline nel markup.
const impostati = new Set(all);
for (const file of [...htmlFiles, ...tsFiles]) {
  for (const m of readFileSync(file, 'utf8').matchAll(/(--[\w-]+)\s*:/g)) impostati.add(m[1]);
}

// I knob che la regola elenca, forme abbreviate (`--field-*`) comprese.
const documentati = new Set();
const famiglie = [];
{
  const regola = readFileSync('.claude/rules/regole-stile-ui.md', 'utf8');
  for (const m of regola.matchAll(/`(--[\w-]+)`/g)) documentati.add(m[1]);
  for (const m of regola.matchAll(/`(--[\w-]+)-\*`/g)) famiglie.push(`${m[1]}-`);
}
const dichiarato = (name) =>
  impostati.has(name) || documentati.has(name) || famiglie.some((f) => name.startsWith(f));

/** `var(--x, …)` con le parentesi bilanciate: il fallback può contenere altri `var()`. */
function letture(text) {
  const out = [];
  for (let i = text.indexOf('var('); i >= 0; i = text.indexOf('var(', i + 1)) {
    let depth = 0;
    let end = -1;
    for (let j = i + 3; j < text.length; j++) {
      if (text[j] === '(') depth++;
      else if (text[j] === ')' && --depth === 0) {
        end = j;
        break;
      }
    }
    if (end < 0) continue;
    const inside = text.slice(i + 4, end);
    const comma = inside.indexOf(',');
    const name = (comma < 0 ? inside : inside.slice(0, comma)).trim();
    if (name.startsWith('--') && comma >= 0) {
      out.push({ name, fallback: inside.slice(comma + 1).trim() });
    }
  }
  return out;
}

const conFallback = new Map();
for (const file of files) {
  for (const { name, fallback } of letture(stripComments(readFileSync(file, 'utf8')))) {
    if (dichiarato(name)) continue;
    if (!conFallback.has(name)) conFallback.set(name, new Set());
    conFallback.get(name).add(`${file.replace('src/app/', '')} → ${fallback.slice(0, 40)}`);
  }
}
for (const [name, where] of [...conFallback].sort()) {
  problems.push(
    `${name} — letto con un fallback, ma nessuno lo dichiara e la regola non lo elenca ` +
      `(${[...where].join('; ')}). O è il nome sbagliato, o è un punto di regolazione da ` +
      `documentare nella tabella di regole-stile-ui §5.`,
  );
}

// ── Token letti a runtime dal TypeScript ───────────────────────────────────
//
// Leggere un token inesistente torna stringa vuota, e il codice prosegue con un
// valore che non c'è: nessun errore, nessun test rosso. Succede al segnale della
// vista compatta e al tema dei grafici.
//
// Si cerca il NOME come stringa, non la chiamata: chi legge lo fa in modi
// diversi — `getPropertyValue(NOME)` con una costante, `readCssToken('--x',
// fallback)` — e agganciarsi alla forma della chiamata lascia fuori proprio i
// casi scritti bene. In `src/**/*.ts` una stringa che comincia per `--` è una
// custom property e nient'altro: verificato, non ce ne sono di altro tipo.
const TOKEN_IN_TS = /['"`](--[a-z][\w-]*)['"`]/g;
for (const file of tsFiles) {
  const text = stripComments(readFileSync(file, 'utf8'));
  for (const m of text.matchAll(TOKEN_IN_TS)) {
    const name = m[1];
    if (all.has(name)) continue;
    problems.push(`${name} — letto da ${file.replace('src/app/', '')} e mai dichiarato`);
  }
}

if (problems.length > 0) {
  console.error(`\n✖ ${problems.length} problemi sui design token:\n`);
  for (const p of problems) console.error(`  ${p}`);
  console.error('');
  process.exit(1);
}

console.log(`✓ design token: ${light.size} per tema, parità fra chiaro e scuro, nessun fantasma.`);
