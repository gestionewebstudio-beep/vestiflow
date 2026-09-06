#!/usr/bin/env node
/**
 * ⛔ **UNA REGOLA CHE DICE UNA MISURA SBAGLIATA FA SCRIVERE CODICE SBAGLIATO.**
 *
 * `regole-stile-ui` si dichiara «fonte di verità visiva», e chi la legge si
 * fida: se la tabella dice che `--table-head-h` vale 32px e il token ne vale 28,
 * una tabella nuova nasce più alta delle altre — e la differenza si vede solo
 * mettendo due elenchi a confronto.
 *
 * Misurato il 01/09/2026 con un audit: **nove** divergenze di questo tipo, tutte
 * nate allo stesso modo — il valore è stato cambiato nel codice con la sua
 * ragione, e la tabella della regola è rimasta indietro.
 *
 * ```text
 * --control-h-button   regola 38px (tabella) e 40px (nota)   token 32px
 * --control-h-field    regola 29 / 44                        token 32 / 38
 * --table-head-h       regola 32px, in due punti             token 28px
 * --topbar-height      regola 52–56px                        token 60px
 * --text-grand-total   regola 22–24px                        token 17px
 * ```
 *
 * ## Che cosa controlla, e che cosa no
 *
 * Solo le **righe di tabella** (`| … |`) che nominano un token e una misura in
 * px: quelle sono mappe nome→valore, ed è lì che l'errore si paga. Il testo
 * discorsivo racconta anche la storia — «era 32, sceso a 28» — e leggerlo come
 * una dichiarazione produrrebbe accuse false su ogni decisione documentata.
 *
 * ⚠️ **Le celle che raccontano un cambiamento si saltano**: se una cella
 * contiene «era», «da N a N» o una freccia, sta narrando, non prescrivendo.
 *
 * ⚠️ **Un intervallo («31–34px») è soddisfatto se il valore ci sta dentro**: la
 * regola a volte descrive una fascia, e quella è una prescrizione onesta.
 */
import { readFileSync, globSync } from 'node:fs';

const TOKENS = 'src/styles/_design-tokens.scss';
const REGOLE = globSync('.claude/rules/*.md');

/**
 * Nome token → valore in px, **la prima dichiarazione del file**.
 *
 * ⚠️ **La prima, non l'ultima**: il valore base sta in cima e le varianti per
 * schermo stretto (`media-down('md')`) vengono dopo, ridichiarando gli stessi
 * nomi. Leggendo l'ultima, `--control-h-button` risulterebbe 32px anche su
 * scrivania, dove vale 28 — e la guardia accuserebbe la tabella che ha ragione.
 */
function valoriDeiToken() {
  const testo = readFileSync(TOKENS, 'utf8');
  const grezzi = new Map();
  for (const m of testo.matchAll(/^\s*(--[\w-]+):\s*([^;]+);/gm)) {
    if (!grezzi.has(m[1])) grezzi.set(m[1], m[2].trim());
  }
  return risolvi(grezzi);
}

/**
 * ⭐ **I valori per schermo stretto**, cioè la colonna «Mobile» della tabella
 * delle altezze.
 *
 * ⛔ Senza, la guardia legge solo il valore da scrivania e dichiara soddisfatta
 * una riga come «`--control-h-button` | 28px | 38px»: 28 è giusto, e il 38 —
 * che il token smentisce con 32 — passerebbe inosservato. È esattamente una
 * delle divergenze che questa guardia esiste per prendere.
 */
function valoriMobile() {
  const testo = readFileSync(TOKENS, 'utf8');
  const inizio = testo.indexOf("media-down('md')");
  if (inizio < 0) return new Map();

  let profondita = 0;
  let fine = testo.length;
  for (let i = testo.indexOf('{', inizio); i < testo.length; i += 1) {
    if (testo[i] === '{') profondita += 1;
    else if (testo[i] === '}') {
      profondita -= 1;
      if (profondita === 0) {
        fine = i;
        break;
      }
    }
  }

  const grezzi = new Map();
  for (const m of testo.slice(inizio, fine).matchAll(/^\s*(--[\w-]+):\s*([^;]+);/gm)) {
    if (!grezzi.has(m[1])) grezzi.set(m[1], m[2].trim());
  }
  /*
    ⚠️ **Il ripiego sulle dichiarazioni da scrivania non è un dettaglio**: sul
    telefono un token si ridichiara solo se CAMBIA, e `--control-h-tap` — a cui
    due alias rimandano — è dichiarato una volta sola, fuori da questo blocco.
  */
  return risolvi(grezzi, valoriGrezziGlobali(testo));
}

/** Le dichiarazioni di tutto il file, per risolvere gli alias verso l'esterno. */
function valoriGrezziGlobali(testo) {
  const grezzi = new Map();
  for (const m of testo.matchAll(/^\s*(--[\w-]+):\s*([^;]+);/gm)) {
    if (!grezzi.has(m[1])) grezzi.set(m[1], m[2].trim());
  }
  return grezzi;
}

/**
 * ⭐ **GLI ALIAS SI SEGUONO** — corretto il 01/09/2026.
 *
 * ⛔ **Un valore scritto `var(--altro)` non è un numero, e la guardia lo
 * scartava**: il token spariva dalla mappa, il confronto posizionale
 * desktop|mobile non trovava il valore mobile e **si degradava in silenzio** al
 * criterio debole «una qualsiasi delle misure citate va bene».
 *
 * ⚠️ **Non era teorico.** Sul telefono `--btn-min-height` e `--field-height`
 * sono entrambi `var(--control-h-tap)`, e la tabella delle altezze di
 * `regole-stile-ui` §5 dichiara 44px per la loro colonna «Mobile»: quella cifra
 * non veniva verificata da nessuno. Cambiare `--control-h-tap` avrebbe lasciato
 * la regola a dire 44 senza che niente arrossisse.
 */
function risolvi(grezzi, esterni = new Map()) {
  const valori = new Map();
  const leggi = (nome, profondita) => {
    if (profondita > 8) return null; // un anello fra alias non deve girare all'infinito
    const grezzo = grezzi.get(nome) ?? esterni.get(nome);
    if (grezzo === undefined) return null;
    const px = inPixel(grezzo);
    if (px !== null) return px;
    const alias = /^var\(\s*(--[\w-]+)\s*[,)]/.exec(grezzo);
    return alias ? leggi(alias[1], profondita + 1) : null;
  };
  for (const nome of grezzi.keys()) {
    const px = leggi(nome, 0);
    if (px !== null) valori.set(nome, px);
  }
  return valori;
}

function inPixel(valore) {
  const rem = /^(-?[\d.]+)rem$/.exec(valore);
  if (rem) return Number(rem[1]) * 16;
  const px = /^(-?[\d.]+)px$/.exec(valore);
  if (px) return Number(px[1]);
  return null;
}

/**
 * ⭐ **I COLORI della palette §2**, che è lo stesso difetto su un'altra colonna.
 *
 * ⛔ Misurato il 01/09/2026: §2 dichiarava `--color-bg: #eef0f2` e
 * `--color-table-header-fg: #3f4c51`, mentre il codice porta `#f2f4f5` e
 * `#2f3d43` — schiarito il primo, **scurito il secondo per accessibilità**
 * (contrasto da 7,5:1 a 9,5:1). Riallineare il token alla tabella disferebbe una
 * decisione presa apposta per chi legge male.
 *
 * ⚠️ **Solo il tema chiaro**: §2 dichiara di descrivere quello, e il tema scuro
 * ridichiara gli stessi nomi.
 */
function coloriDelTemaChiaro() {
  const testo = readFileSync(TOKENS, 'utf8');
  const inizio = testo.indexOf('@mixin theme-light');
  if (inizio < 0) return new Map();
  const apertura = testo.indexOf('{', inizio);
  let profondita = 0;
  let fine = testo.length;
  for (let i = apertura; i < testo.length; i += 1) {
    if (testo[i] === '{') profondita += 1;
    else if (testo[i] === '}') {
      profondita -= 1;
      if (profondita === 0) {
        fine = i;
        break;
      }
    }
  }
  const valori = new Map();
  for (const m of testo.slice(apertura, fine).matchAll(/^\s*(--[\w-]+):\s*(#[0-9a-fA-F]{3,8});/gm)) {
    if (!valori.has(m[1])) valori.set(m[1], m[2].toLowerCase());
  }
  return valori;
}

/** La cella sta raccontando un cambiamento invece di prescrivere un valore? */
function racconta(riga) {
  return /\bera\b|\bErano\b|\berano\b|→|sceso|scesi|salito|prima\b|\bda\s+\d+\s+a\s+\d+/.test(riga);
}

const valori = valoriDeiToken();
const mobile = valoriMobile();
const colori = coloriDelTemaChiaro();
if (valori.size === 0) {
  console.error('⛔ nessun token letto: la guardia sarebbe cieca.');
  process.exit(1);
}

const problemi = [];
let verificate = 0;

for (const percorso of REGOLE) {
  const righe = readFileSync(percorso, 'utf8').split(/\r?\n/);
  righe.forEach((riga, i) => {
    if (!riga.trimStart().startsWith('|') || racconta(riga)) return;

    const token = /`(--[\w-]+)`/.exec(riga);
    if (!token) return;

    // ── Il colore citato accanto al token ────────────────────────────────
    const tinta = colori.get(token[1]);
    if (tinta) {
      const citato = /`(#[0-9a-fA-F]{3,8})`|\b(#[0-9a-fA-F]{6})\b/.exec(riga);
      if (citato) {
        verificate += 1;
        const scritto = (citato[1] ?? citato[2]).toLowerCase();
        if (scritto !== tinta) {
          problemi.push(
            `⛔ ${percorso}:${i + 1} · ${token[1]} vale ${tinta}, la regola dice ${scritto}.\n` +
              `   ${riga.trim().slice(0, 150)}\n` +
              `   Riportare il token al valore della regola disfarebbe la decisione che l'ha cambiato.`,
          );
        }
      }
    }

    if (!valori.has(token[1])) return;

    // Tutte le misure in px citate nella riga: «28px», «31–34px», «22–24px».
    const misure = [...riga.matchAll(/(\d+(?:[.,]\d+)?)\s*(?:–|-)?\s*(\d+(?:[.,]\d+)?)?\s*px/g)];
    if (misure.length === 0) return;

    verificate += 1;
    const vero = valori.get(token[1]);
    const suStretto = mobile.get(token[1]);
    const dentro = (misura, atteso) => {
      const min = Number(String(misura[1]).replace(',', '.'));
      const max = misura[2] === undefined ? min : Number(String(misura[2]).replace(',', '.'));
      return atteso >= Math.min(min, max) && atteso <= Math.max(min, max);
    };
    const citate = misure.map(([tutto]) => tutto.trim()).join(', ');

    /*
      ⭐ **Due misure e un valore mobile: si confrontano IN POSIZIONE.** È la
      tabella «Altezze dei controlli», dove le colonne sono Desktop | Mobile.
      Fuori da quel caso vale «una qualsiasi delle misure citate», perché la
      regola a volte descrive una fascia («31–34px») o cita due valori in prosa.
    */
    if (misure.length === 2 && suStretto !== undefined) {
      if (!dentro(misure[0], vero)) {
        problemi.push(
          `⛔ ${percorso}:${i + 1} · ${token[1]} vale ${vero}px da scrivania, la regola dice ${misure[0][0].trim()}.\n` +
            `   ${riga.trim().slice(0, 150)}`,
        );
      }
      if (!dentro(misure[1], suStretto)) {
        problemi.push(
          `⛔ ${percorso}:${i + 1} · ${token[1]} vale ${suStretto}px sotto \`md\`, la regola dice ${misure[1][0].trim()}.\n` +
            `   ${riga.trim().slice(0, 150)}`,
        );
      }
      return;
    }

    if (!misure.some((m) => dentro(m, vero))) {
      problemi.push(
        `⛔ ${percorso}:${i + 1} · ${token[1]} vale ${vero}px, la regola dice ${citate}.\n` +
          `   ${riga.trim().slice(0, 150)}\n` +
          `   Chi segue la regola riporta il codice al valore vecchio, disfacendo la decisione che l'ha cambiato.`,
      );
    }
  });
}

if (verificate === 0) {
  console.error('⛔ nessuna misura verificata: la guardia non guarderebbe niente.');
  process.exit(1);
}

if (problemi.length > 0) {
  console.error(problemi.join('\n\n'));
  console.error(`\n${problemi.length} misure divergenti su ${verificate} verificate.`);
  process.exit(1);
}

console.log(`✅ regole e token: ${verificate} misure citate, tutte allineate al codice.`);
