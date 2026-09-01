#!/usr/bin/env node
/**
 * ⛔ **IL SUBTOTALE DI GRUPPO E LA RIGA TOTALI SOMMANO LE STESSE COLONNE.**
 *
 * Un elenco ha due somme: il **subtotale di giornata**, quando «Raggruppa per
 * giorno» è acceso, e la **riga totali** in fondo. Sommano insiemi diversi — il
 * gruppo la sua giornata, la riga totali il risultato filtrato o la selezione —
 * ma **le colonne devono essere le stesse**: sotto la colonna IVA o la riga di
 * giornata porta un numero, o non lo porta la riga in fondo. Una delle due vuota
 * e l'altra piena è uno scarto che chi guarda non può spiegarsi.
 *
 * ⛔ **Trovato DUE VOLTE nella stessa giornata**, il 01/09/2026, e in due
 * direzioni opposte:
 *
 * ```text
 * supplier-order-list   gruppo: imponibile + IVA        totali: (mancavano)
 * document-table        gruppo: imponibile + totale     totali: + IVA + «Ancora da saldare»
 * ```
 *
 * La causa è la stessa: l'elenco delle colonne sommabili scritto **a mano in due
 * punti**. Copiato una volta, i due si aggiornano separatamente — e nessuno dei
 * due è sbagliato abbastanza da rompere qualcosa.
 *
 * ⚠️ **Non falliva niente.** Build, lint e tutta la suite restano verdi: sono due
 * oggetti letterali validi, con chiavi diverse. Il difetto si vede solo accendendo
 * il raggruppamento e guardando due righe della stessa tabella.
 *
 * ## Che cosa controlla
 *
 * Nei file che chiamano **entrambe** le funzioni: le chiavi dell'argomento
 * `campi:` devono coincidere. Se `campi:` è una chiamata a una funzione nominata
 * — la forma preferibile, che rende la divergenza impossibile — si confronta il
 * testo della chiamata.
 *
 * ⚠️ **La riga totali non sta sempre nello stesso file.** L'elenco documenti la
 * fa passare da un util, perché la fascia vive nella pagina e non nella tabella.
 * In quel caso si esige che le due somme condividano il **costruttore**: è
 * l'unica forma in cui la divergenza non può nascere. Un elenco di colonne
 * scritto inline nel raggruppamento, con i totali altrove, non è verificabile —
 * e viene segnalato.
 *
 * ⚠️ **Un elenco che NON si raggruppa non si controlla**: la sua riga totali non
 * ha un gemello da cui divergere (Clienti, Fornitori, Prodotti).
 */
import { readFileSync, globSync } from 'node:fs';

const SEZIONI = 'sezioniDiElenco(';
const TOTALI = 'totaliDiElenco(';

/**
 * Il testo dell'argomento `campi:` di una chiamata, a partire dalla sua
 * posizione: un oggetto letterale con le graffe bilanciate, oppure
 * l'espressione fino alla virgola di livello zero.
 */
function argomentoCampi(sorgente, da) {
  const i = sorgente.indexOf('campi:', da);
  if (i < 0) return null;
  let j = i + 'campi:'.length;
  while (j < sorgente.length && /\s/.test(sorgente[j])) j += 1;

  if (sorgente[j] === '{') {
    let livello = 0;
    for (let k = j; k < sorgente.length; k += 1) {
      if (sorgente[k] === '{') livello += 1;
      else if (sorgente[k] === '}') {
        livello -= 1;
        if (livello === 0) return { testo: sorgente.slice(j, k + 1), inline: true };
      }
    }
    return null;
  }

  // Espressione: si chiude alla prima virgola o graffa di livello zero.
  let tonde = 0;
  for (let k = j; k < sorgente.length; k += 1) {
    const c = sorgente[k];
    if (c === '(') tonde += 1;
    else if (c === ')') {
      if (tonde === 0) return { testo: sorgente.slice(j, k).trim(), inline: false };
      tonde -= 1;
    } else if ((c === ',' || c === '}') && tonde === 0) {
      return { testo: sorgente.slice(j, k).trim(), inline: false };
    }
  }
  return null;
}

/**
 * Le chiavi di primo livello di un oggetto letterale.
 *
 * ⚠️ **I commenti si tolgono prima**: questi oggetti sono pieni di blocchi che
 * spiegano perché una colonna si somma col verso economico, e dentro ce n'è più
 * d'uno che somiglia a una chiave.
 */
function chiaviDi(letterale) {
  const pulito = letterale.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
  const chiavi = new Set();
  let livello = 0;
  for (const m of pulito.matchAll(/[{}]|([A-Za-z_$][\w$]*)\s*:/g)) {
    if (m[0] === '{') livello += 1;
    else if (m[0] === '}') livello -= 1;
    else if (livello === 1 && m[1]) chiavi.add(m[1]);
  }
  return [...chiavi].sort();
}

/**
 * La FUNZIONE chiamata, senza i suoi argomenti.
 *
 * ⚠️ **Gli argomenti legittimamente differiscono**: le due somme leggono la
 * valuta da insiemi diversi — le righe filtrate e quelle di pagina — e scrivono
 * quindi due espressioni diverse per la stessa cosa. A dover coincidere è chi
 * dichiara le colonne, non da dove arriva il simbolo dell'euro.
 */
function chiamata(espressione) {
  const i = espressione.indexOf('(');
  return (i < 0 ? espressione : espressione.slice(0, i)).trim();
}

const problemi = [];
let controllati = 0;

/**
 * ⚠️ **UN COMMENTO NON È CODICE.** `list-grouping.util` documenta la propria
 * firma con un esempio che contiene `campi: { total: … }`: letto come codice, la
 * guardia accusava il file che DEFINISCE la funzione di sommare colonne diverse
 * da sé stesso — e impediva di documentare la cosa che controlla.
 */
function senzaCommenti(sorgente) {
  return sorgente.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
}

const sorgenti = globSync('src/app/**/*.ts')
  .filter((f) => !f.includes('.spec.'))
  .map((f) => ({ file: f, testo: senzaCommenti(readFileSync(f, 'utf8')) }));

/**
 * ⭐ **I costruttori che alimentano una RIGA TOTALI, ovunque nel progetto.**
 *
 * ⚠️ **La riga totali non sta sempre nello stesso file del subtotale.** L'elenco
 * documenti la fa passare da `totaliDocumenti` in un util, perché la fascia vive
 * nella pagina e non nella tabella: cercandola solo dentro il file del
 * raggruppamento, quell'elenco non verrebbe controllato affatto — ed è
 * esattamente quello in cui il difetto è stato trovato.
 */
const costruttoriDeiTotali = new Set();
for (const { testo } of sorgenti) {
  let da = testo.indexOf(TOTALI);
  while (da >= 0) {
    const arg = argomentoCampi(testo, da);
    if (arg && !arg.inline) costruttoriDeiTotali.add(chiamata(arg.testo));
    da = testo.indexOf(TOTALI, da + 1);
  }
}

for (const { file, testo: sorgente } of sorgenti) {
  const iSez = sorgente.indexOf(SEZIONI);
  if (iSez < 0) continue;
  const sez = argomentoCampi(sorgente, iSez);
  if (!sez) continue;

  const iTot = sorgente.indexOf(TOTALI);
  const tot = iTot >= 0 ? argomentoCampi(sorgente, iTot) : null;

  controllati += 1;

  // Caso 1 — le due somme stanno nello stesso file: si confrontano fra loro.
  if (tot) {
    const uguali = sez.inline
      ? tot.inline && chiaviDi(sez.testo).join(',') === chiaviDi(tot.testo).join(',')
      : !tot.inline && chiamata(sez.testo) === chiamata(tot.testo);
    if (!uguali) {
      const a = sez.inline ? chiaviDi(sez.testo).join(' · ') || '(nessuna)' : sez.testo;
      const b = tot.inline ? chiaviDi(tot.testo).join(' · ') || '(nessuna)' : tot.testo;
      problemi.push(
        `${file}\n     subtotale di gruppo: ${a}\n     riga totali:         ${b}`,
      );
    }
    continue;
  }

  /*
    Caso 2 — la riga totali sta altrove. L'unico modo di garantire che sommino le
    stesse colonne è che condividano il COSTRUTTORE: un elenco inline qui non ha
    nessun gemello con cui confrontarsi, e diverge appena l'altro cambia.
  */
  if (sez.inline) {
    problemi.push(
      `${file}\n     il subtotale di gruppo dichiara le colonne INLINE ` +
        `(${chiaviDi(sez.testo).join(' · ') || 'nessuna'}), e la riga totali sta in un altro file:\n` +
        '     non c\'è modo di verificare che sommino le stesse colonne.',
    );
    continue;
  }
  if (!costruttoriDeiTotali.has(chiamata(sez.testo))) {
    problemi.push(
      `${file}\n     il subtotale di gruppo usa «${chiamata(sez.testo)}», ` +
        'che nessuna riga totali usa.',
    );
  }
}

if (problemi.length > 0) {
  console.error(
    `⛔ ${problemi.length} elenco/i sommano colonne diverse nel gruppo e nella riga totali:\n`,
  );
  for (const p of problemi) console.error(`   ${p}\n`);
  console.error(
    '   Si dichiarano UNA volta, in una funzione nominata, e la si passa a entrambe.\n',
  );
  process.exit(1);
}

console.log(
  `check:somme-elenco — ${controllati} elenchi con due somme, e ognuno le fa sulle stesse colonne.`,
);
