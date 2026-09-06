#!/usr/bin/env node
/**
 * check:location-scope — una guardia di sede che l'identità non raggiunge non è una guardia.
 *
 * ⛔ **Il difetto che questa guardia impedisce, trovato QUATTRO volte nell'agosto
 * 2026 in quattro domini diversi.** La forma è sempre la stessa:
 *
 * ```text
 * servizio     user?: UserProfileDto   +   assertLocation…(user, …)
 * controller   non riceve @CurrentUser(), oppure non lo propaga
 * esito        guardia presente nel codice, ASSENTE nell'esecuzione
 * ```
 *
 * ⚠️ **E ogni volta i test del servizio erano verdi.** In due casi su quattro
 * esisteva perfino un test che codificava il buco come contratto — «senza utente
 * le chiamate interne passano» — dove chiamanti interni non ce n'erano. Cercare
 * `assertLocation…` dentro i servizi non avrebbe trovato niente: c'era, in tutti
 * e quattro. Il difetto sta al CONFINE controller → servizio.
 *
 * ⭐ **Quindi la guardia guarda il confine, non il servizio.** Due regole:
 *
 *   R1 · un metodo di servizio RAGGIUNTO DA UN CONTROLLER che applica uno scope
 *        di sede non può dichiarare l'utente come opzionale (`user?:`) né
 *        annullabile (`| undefined`). Un parametro saltabile è come non averlo:
 *        `assertLocationReadableInUserScope(undefined, …)` passa sempre.
 *
 *   R2 · la rotta che lo chiama deve DICHIARARE `@CurrentUser()` e PASSARLO in
 *        quella chiamata. Riceverlo per il solo `displayName` non protegge.
 *
 * ⚠️ **Non è una ricerca della stringa `user?`.** I metodi interni possono
 * legittimamente non avere un utente, e costringerli a riceverne uno finto
 * sarebbe peggio del difetto. La guardia distingue perché parte dai CONTROLLER e
 * segue le chiamate: un metodo che nessuna rotta raggiunge non la riguarda.
 *
 * ⭐ **I casi di sistema veri si dichiarano, non si rappresentano con
 * `undefined`.** Un metodo che deve girare senza identità porta il marcatore
 * `@scope-location system` nel proprio commento, e allora la guardia lo lascia
 * stare — ma la deroga è scritta e si vede in revisione.
 */
import fs from 'node:fs';
import path from 'node:path';

const PREDICATI = [
  'assertLocationReadableInUserScope',
  'assertLocationInUserScope',
  'assertUserCanAccessLocation',
];
const DEROGA = '@scope-location system';

/**
 * ⭐ **Vuota, ed è la notizia.** Il 28/08/2026 questa lista aveva 14 metodi:
 * raggiunti da una rotta, applicavano uno scope di sede e dichiaravano
 * l'utente opzionale. Non erano vulnerabilità — le rotte l'utente lo
 * passavano — ma erano la CONDIZIONE che aveva reso possibili quattro difetti.
 *
 * Cercati i chiamanti di ognuna: **nessuna aveva un chiamante di sistema senza
 * utente**. I pochi interni erano auto-chiamate che l'utente lo inoltrano.
 * Quindi sono state strette tutte, e la lista si è svuotata da sé.
 *
 * ⛔ **Resti vuota.** Un metodo nuovo che ci finirebbe dentro fallisce, e va
 * corretto — non aggiunto qui. Se un giorno servisse davvero una chiamata di
 * sistema senza identità, ha una strada sua: `@scope-location system`, che si
 * dichiara sul metodo e si vede in revisione.
 */
const BASELINE_UTENTE_OPZIONALE = new Set([]);

function percorri(dir, out = []) {
  for (const voce of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, voce.name);
    if (voce.isDirectory()) {
      if (voce.name !== 'node_modules' && voce.name !== 'dist') percorri(p, out);
    } else if (voce.name.endsWith('.ts') && !voce.name.endsWith('.spec.ts')) {
      out.push(p);
    }
  }
  return out;
}

/** Il corpo di un metodo, dalla firma alla graffa che la chiude. */
function corpoDelMetodo(righe, inizio) {
  let livello = 0;
  let aperto = false;
  const corpo = [];
  for (let i = inizio; i < righe.length && i < inizio + 400; i++) {
    corpo.push(righe[i]);
    for (const c of righe[i]) {
      if (c === '{') {
        livello++;
        aperto = true;
      }
      if (c === '}') livello--;
    }
    if (aperto && livello <= 0) break;
  }
  return corpo;
}

// ── 1 · i metodi di servizio che applicano uno scope di sede ────────────────
const scopati = new Map(); // "Classe.metodo" → { file, riga, utente, deroga }

for (const file of percorri('api/src')) {
  if (!/\.(service|util|facade)\.ts$/.test(file)) continue;
  const righe = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  let classe = path.basename(file);
  for (let i = 0; i < righe.length; i++) {
    const cl = righe[i].match(/^export class (\w+)/);
    if (cl) classe = cl[1];
    const m = righe[i].match(/^\s{2}(?:public\s+|private\s+|protected\s+)?(?:async\s+)?(\w+)\s*\(/);
    if (!m) continue;
    const corpo = corpoDelMetodo(righe, i).join('\n');
    if (!PREDICATI.some((p) => corpo.includes(`${p}(`))) continue;

    const contesto = righe.slice(Math.max(0, i - 30), i + 1).join('\n');
    const utente = corpo.match(/\buser\??\s*:\s*([^,\n]+)/);
    scopati.set(`${classe}.${m[1]}`, {
      file,
      riga: i + 1,
      metodo: m[1],
      opzionale: /\buser\?\s*:/.test(corpo) || /\buser\s*:\s*[^,\n]*\|\s*undefined/.test(corpo),
      tipo: utente ? utente[1].trim() : '(nessun parametro user)',
      deroga: contesto.includes(DEROGA),
    });
  }
}

// ── 2 · le rotte che li raggiungono ─────────────────────────────────────────
const violazioniR1 = [];
const violazioniR2 = [];
let rotteViste = 0;
const baselineIncontrata = new Set();

for (const file of percorri('api/src')) {
  if (!file.endsWith('.controller.ts')) continue;
  const righe = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  // mappa proprietà → classe di servizio, dal costruttore
  const servizi = new Map();
  for (const riga of righe) {
    const d = riga.match(/private\s+readonly\s+(\w+)\s*:\s*(\w+)/);
    if (d) servizi.set(d[1], d[2]);
  }

  for (let i = 0; i < righe.length; i++) {
    if (!/@(Get|Post|Patch|Put|Delete)\(/.test(righe[i])) continue;
    rotteViste++;
    const corpo = corpoDelMetodo(righe, i + 1);
    const testo = corpo.join('\n');
    const dichiaraUtente = /@CurrentUser\(\)/.test(testo);

    for (const [prop, classe] of servizi) {
      const chiamate = [
        ...testo.matchAll(new RegExp(`this\\.${prop}\\.(\\w+)\\s*\\(([^;]*)`, 'gs')),
      ];
      for (const ch of chiamate) {
        const chiave = `${classe}.${ch[1]}`;
        const scopato = scopati.get(chiave);
        if (!scopato || scopato.deroga) continue;

        if (scopato.opzionale && !BASELINE_UTENTE_OPZIONALE.has(chiave)) {
          violazioniR1.push({ chiave, ...scopato, rotta: `${file}:${i + 1}` });
        }
        if (scopato.opzionale) baselineIncontrata.add(chiave);
        const argomenti = ch[2];
        if (!dichiaraUtente || !/\buser\b/.test(argomenti)) {
          violazioniR2.push({
            chiave,
            rotta: file,
            riga: i + 1,
            motivo: dichiaraUtente ? 'lo dichiara ma non lo passa' : 'non dichiara @CurrentUser()',
          });
        }
      }
    }
  }
}

const tutte = violazioniR1.length + violazioniR2.length;
if (tutte > 0) {
  console.error('\n⛔ check:location-scope — una guardia di sede che l’identità non raggiunge.\n');
  for (const v of violazioniR1) {
    console.error(`   ${v.file}:${v.riga}  ${v.chiave}`);
    console.error(`     l’utente è OPZIONALE (${v.tipo}) su un metodo raggiunto da una rotta.`);
    console.error(`     Chiamato da ${v.rotta}.`);
    console.error(`     Un parametro saltabile è come non averlo: il predicato passa con`);
    console.error(`     \`undefined\`. Dichiaralo \`user: UserProfileDto\`.`);
    console.error(`     Se è davvero un metodo di sistema, scrivilo: \`${DEROGA}\`.\n`);
  }
  for (const v of violazioniR2) {
    console.error(`   ${v.rotta}:${v.riga}  → ${v.chiave}`);
    console.error(`     la rotta ${v.motivo}, ma il servizio applica uno scope di sede.`);
    console.error(`     La guardia esiste nel codice e non si esegue.\n`);
  }
  process.exit(1);
}

const risolte = [...BASELINE_UTENTE_OPZIONALE].filter((c) => !baselineIncontrata.has(c));
if (risolte.length > 0) {
  console.error('\n⛔ check:location-scope — la baseline è invecchiata.\n');
  for (const c of risolte) {
    console.error(`   ${c} non è più in violazione: toglilo da BASELINE_UTENTE_OPZIONALE.`);
  }
  console.error('\nUna baseline che non si accorcia comincia a coprire difetti veri.\n');
  process.exit(1);
}

const derogati = [...scopati.values()].filter((s) => s.deroga).length;
console.log(
  `✅ check:location-scope — ${scopati.size} metodi applicano uno scope di sede` +
    (derogati ? ` (${derogati} di sistema, dichiarati)` : '') +
    `; ${rotteViste} rotte controllate, tutte propagano l’identità` +
    ` (${BASELINE_UTENTE_OPZIONALE.size} firme ancora opzionali, a cricchetto).`,
);
