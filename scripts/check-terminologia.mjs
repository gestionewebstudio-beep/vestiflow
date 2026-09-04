/**
 * Guardia sulle **denominazioni ritirate**: nomi che l'applicazione non usa più
 * e che non devono tornare da un copia-incolla.
 *
 * ⚠️ Si chiamava `check-terminologia-banco.mjs` e copriva un caso solo. Dal
 * 25/08/2026 ne copre due, e il nome del file segue lo script npm che lo
 * invoca da sempre (`check:terminologia`).
 *
 * ## 1 · Vendita al banco (`docs/11` A6)
 *
 * **Deciso il 18/08/2026, completato il 20/08/2026.** «Vendita al banco» è
 * l'unica denominazione funzionale corrente: «Vendita negozio», «Vendita in
 * negozio», «Reso vendita negozio» e «cassa negozio» sono state censite e
 * rimosse, non lasciate convivere.
 *
 * Perché serve una guardia. Il censimento di A6 era già stato dichiarato
 * chiuso il 18/08, e il 20/08 se ne sono trovate **59 occorrenze residue** in
 * 35 file — fra cui tre stringhe che l'operatore legge davvero: il titolo di
 * stampa `store_sale` (che è anche l'origine nel Registro Corrispettivi),
 * l'etichetta della famiglia di permessi «Vendite e resi negozio» e due
 * messaggi di rifiuto dell'API. Nessuna di queste rompeva niente: un nome
 * vecchio compila, passa i test e continua a insegnare all'operatore una
 * parola che il resto dell'applicazione non usa più.
 *
 * ⛔ Qui si controllano ANCHE i commenti, al contrario di
 * `check-registro-legacy.mjs`: A6 dice che il censimento copre «interfaccia,
 * menu, titoli, rotte, etichette, messaggi, causali dei movimenti, stampe ed
 * export, documentazione, test, e nomi tecnici». Un commento che porta il nome
 * vecchio è la sorgente da cui il nome vecchio torna nel codice, al primo
 * copia-incolla.
 *
 * ⚠️ Restano leciti, e NON sono in questa lista:
 *   · i prefissi di numerazione `VN` / `RN` — identificatori contrattuali, e i
 *     numeri già emessi li portano (A6, livello «tecnico stabile»);
 *   · l'enum `DocumentType.store_sale` / `store_return` e le colonne
 *     `store_sale_payments` — stessa ragione;
 *   · «negozio» da solo: è l'entità Store, e resta la parola giusta;
 *   · «cassa esterna» e «cassa fiscale»: A10 parla proprio di quelle, che sono
 *     un'altra cosa dal nostro documento.
 *
 * ## 3 · «Scarico manuale» _(26/08/2026)_
 *
 * ⛔ **Il nome sbagliato aveva gia' prodotto un difetto**, ed e' la ragione per
 * cui questa voce merita una guardia piu' delle altre due: chi legge «Scarico
 * manuale magazzino» conclude ragionevolmente «non e' vendita», e infatti il
 * Listino era stato SPENTO su quel documento con quel commento esatto.
 *
 * Il documento e' una **Vendita manuale**: una vendita inserita a mano che
 * riduce la giacenza senza generare movimenti. Che non produca `StockMovement`
 * e' la sua eccezione tecnica, non la sua identita'.
 *
 * ⚠️ Gli identificatori restano: `manual_unload`, `isManualUnload`, la rotta
 * `manual-unload`. Il proprietario ha deciso «prima la semantica, poi i nomi
 * tecnici», come per `invoice_draft`.
 *
 * ## 2 · «Bozza fattura» _(25/08/2026)_
 *
 * ⛔ Il documento si chiama **Fattura**: è così in `documentTypeLabel`,
 * nell'elenco, nella stampa e nei permessi. «Bozza fattura» era rimasto in UN
 * punto che l'operatore legge davvero — la voce «Genera documento» del DDT
 * vendita — più il suo suggerimento e due commenti.
 *
 * ⚠️ **Il nome veniva dall'enum**, che allora si chiamava `invoice_draft`.
 * Qui c'era scritto «e l'enum non si tocca» — il giorno dopo si è toccato: il
 * 26/08/2026 il valore è stato rinominato in `invoice`, con una migration che
 * costa una riga di catalogo e nessun UPDATE sui dati.
 *
 * ⭐ Questa guardia resta comunque, e con una ragione sua: impedisce che le
 * parole ITALIANE «Bozza fattura» tornino a essere lette dall'operatore. Si
 * vieta la forma a parole, non l'identificatore — che oggi non nomina più
 * nessuna bozza.
 *
 * Se una voce va davvero reintrodotta, si toglie da qui **con la decisione
 * scritta accanto** — non si aggiunge un'eccezione al file che sta controllando.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const AREE = ['src/app', 'api/src', 'e2e'];
const ESTENSIONI = new Set(['.ts', '.html', '.scss']);

/** Separatore di percorso Windows: `relative()` lo usa, e va normalizzato. */
const SEP_WIN = String.fromCharCode(92);

/** Confronto in minuscolo: il termine ricompare in ogni forma di maiuscole. */
const VIETATI = [
  { termine: 'vendita in negozio', perche: 'si dice «Vendita al banco» (A6).' },
  { termine: 'vendite in negozio', perche: 'si dice «Vendite al banco» (A6).' },
  { termine: 'reso in negozio', perche: 'si dice «Reso al banco» (A6).' },
  { termine: 'resi in negozio', perche: 'si dice «Resi al banco» (A6).' },
  { termine: 'vendita negozio', perche: 'si dice «Vendita al banco» (A6).' },
  { termine: 'vendite negozio', perche: 'si dice «Vendite al banco» (A6).' },
  { termine: 'reso negozio', perche: 'si dice «Reso al banco» (A6).' },
  { termine: 'resi negozio', perche: 'si dice «Resi al banco» (A6).' },
  {
    termine: 'cassa negozio',
    perche:
      'la nostra schermata NON è «la cassa»: è il documento di Vendita al banco (A6). «Cassa esterna» resta legittima, ed è un altro oggetto.',
  },
  {
    termine: 'bozza fattura',
    perche:
      'il documento si chiama «Fattura», come in documentTypeLabel. «Bozza» viene ' +
      "dall'enum invoice_draft, che resta lecito come identificatore ma non deve " +
      "arrivare all'operatore.",
  },
  {
    termine: 'bozze fattura',
    perche: 'si dice «Fatture»: la schermata «Bozze fattura» non esiste più.',
  },
  {
    termine: 'scarico manuale',
    perche:
      "si dice «Vendita manuale»: e' una vendita che riduce la giacenza senza generare " +
      "movimenti di magazzino. Il nome vecchio spingeva verso Trasferimenti e Rettifiche, e " +
      "aveva gia' fatto SPEGNERE il Listino su quel documento — un difetto vero, nato da un nome.",
  },
  {
    termine: 'scarichi manuali',
    perche: 'si dice «Vendite manuali».',
  },
  // ## 4 · L’evasione parziale dell’Ordine cliente — 29/08/2026
  //
  // ⛔ **VestiFlow non gestisce l’evasione parziale** (`18` §2.3): niente stato
  // «Parzialmente concluso», niente residuo evadibile, niente `forceConclude`.
  // Il primo documento conclusivo porta l’Ordine a Concluso, e il server lo fa
  // da sé nella transazione del salvataggio.
  //
  // ⚠️ **`partially_fulfilled` NON è in questa lista, ed è deliberato**: è lo
  // stato di evasione del CANALE (Shopify), che esiste e resta. Bandirlo
  // spegnerebbe la sincronizzazione degli ordini online.
  {
    termine: 'partially_concluded',
    perche: 'l’evasione parziale non esiste (`18` §2.3).',
  },
  {
    termine: 'partiallyconcluded',
    perche: 'l’evasione parziale non esiste (`18` §2.3).',
  },
  {
    termine: 'forceconclude',
    perche: 'rimosso: il documento conclusivo conclude l’Ordine da sé (`18` §2.3).',
  },
  {
    termine: 'force-conclude',
    perche: 'rimosso: il documento conclusivo conclude l’Ordine da sé (`18` §2.3).',
  },
];

/** Righe che RACCONTANO il ritiro: sono la memoria del perché, e restano. */
const MARCATORI_DI_RITIRO = [
  'ritirat',
  'legacy',
  "qui c'era",
  'qui c’era',
  'non si dice',
  // ⭐ Un commento che spiega PERCHE' un nome e' stato ritirato deve poterlo
  // nominare: senza questo marcatore la reazione naturale sarebbe cancellarlo,
  // cioe' togliere proprio la spiegazione che serve a chi arriva dopo.
  'nome vecchio',
];

/** Questo file nomina i termini per mestiere: si esclude da sé. */
const ESENTI = new Set([relative(root, fileURLToPath(import.meta.url)).split(SEP_WIN).join('/')]);

function* filesIn(dir) {
  let voci;
  try {
    voci = readdirSync(dir);
  } catch {
    return;
  }
  for (const voce of voci) {
    const pieno = join(dir, voce);
    if (statSync(pieno).isDirectory()) {
      yield* filesIn(pieno);
    } else if (ESTENSIONI.has(extname(voce))) {
      yield pieno;
    }
  }
}

/**
 * ⛔ **Il controllo NON è riga per riga, ed è il motivo per cui esiste così.**
 *
 * Un commento che va a capo spezza il termine — «(Fatture, Vendita/Reso» su una
 * riga e «negozio): preimpostato…» sulla successiva — e un controllo riga per
 * riga non lo vede. Non è un'ipotesi: il 20/08/2026 la rinomina di massa ne ha
 * mancate **due** proprio così, e questo script, nella sua prima stesura, le
 * lasciava passare entrambe.
 *
 * Quindi ogni riga si confronta anche unita alla successiva, togliendo il segno
 * di commento di apertura (`//`, `*`, `<!--`) che altrimenti finirebbe in mezzo
 * alle due parole.
 */
function coppieDiRighe(righe) {
  return righe.map((riga, i) => {
    const successiva = righe[i + 1] ?? '';
    const continuazione = successiva.trim().replace(/^(\/\/|\*|<!--)\s*/, '');
    return `${riga.trimEnd()} ${continuazione}`.toLowerCase();
  });
}

const trovati = [];
for (const area of AREE) {
  for (const file of filesIn(join(root, area))) {
    const rel = relative(root, file).split(SEP_WIN).join('/');
    if (ESENTI.has(rel)) continue;
    const righe = readFileSync(file, 'utf8').split(/\r?\n/);
    const unite = coppieDiRighe(righe);
    righe.forEach((riga, i) => {
      // Il marcatore di ritiro vale per la riga E per la sua continuazione: un
      // «qui c'era …, ritirato» va a capo come tutto il resto.
      if (MARCATORI_DI_RITIRO.some((m) => unite[i].includes(m))) return;
      for (const { termine, perche } of VIETATI) {
        if (unite[i].includes(termine)) {
          trovati.push({ file: rel, riga: i + 1, termine, perche, testo: riga.trim().slice(0, 90) });
        }
      }
    });
  }
}

if (trovati.length > 0) {
  console.error('\n✖ Denominazioni ritirate rientrate nel codice:\n');
  for (const t of trovati) {
    console.error(`  ${t.file}:${t.riga}  «${t.termine}»`);
    console.error(`    ${t.testo}`);
    console.error(`    → ${t.perche}\n`);
  }
  console.error(
    `${trovati.length} occorrenze. Se una va davvero reintrodotta, toglila da\n` +
      'scripts/check-terminologia.mjs insieme alla decisione che lo giustifica.\n',
  );
  process.exit(1);
}

console.log(
  `✅ check:terminologia — nessuna delle ${VIETATI.length} denominazioni ritirate è rientrata in ${AREE.join(', ')}.`,
);
