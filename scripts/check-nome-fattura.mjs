/**
 * Il tipo documento della Fattura si chiama **`invoice`**, non `invoice_draft`.
 *
 * Rinominato nel database il **26/08/2026** con una migration di catalogo
 * (`ALTER TYPE "DocumentType" RENAME VALUE`): nessuna riscrittura di tabelle,
 * nessun UPDATE sui dati, indice unico salvo. Il nome vecchio non significava
 * più «bozza» da tempo — lo schema stesso lo commentava «Fattura (fiscale, da
 * trasmettere al commercialista)» — ma restava, e chi scrive codice lo leggeva
 * ogni giorno.
 *
 * ## ⛔ Perché serve una guardia, e qual è lo scenario che ferma
 *
 * Non è il codice applicativo il pericolo: lì il compilatore trova tutto, ed è
 * quello che ha fatto (58 errori, tutti sul simbolo).
 *
 * ⚠️ **Il pericolo sono le MIGRATION FUTURE.** Le migration qui si scrivono a
 * mano, per regola, e l'indice unico `documents_number_unique` porta il valore
 * dentro la propria espressione — è già stato ricostruito **due volte**:
 *
 * ```sql
 * CASE WHEN d.type IN (...) THEN '<nome vecchio>'::"DocumentType" ...
 * ```
 *
 * Chi copia quel blocco fra sei mesi scrive il nome vecchio. Postgres risponde
 * `22P02 invalid input value for enum`, la migration muore a metà e **resta
 * registrata come FALLITA**. Da quel momento `prisma migrate deploy` si rifiuta
 * di applicare qualunque cosa — e il boot di Railway è
 * `migrate deploy && node dist/main.js`: **l'API di produzione non parte più.**
 *
 * Un errore da dieci righe di SQL ferma la pipeline di tutti. È l'unico
 * scenario, in tutta questa rinomina, che trasforma un fastidio in un blocco.
 *
 * ## Che cosa controlla
 *
 * 1. il nome vecchio non compare in `src/`, `api/src/`, `e2e/`;
 * 2. non compare in **nessuna migration con timestamp successivo** a quella
 *    della rinomina. Le sette precedenti restano lecite: sono la storia, e
 *    modificarle cambierebbe il checksum in `_prisma_migrations` bloccando
 *    `prisma migrate deploy` a tutti.
 *
 * ## ⛔ Che cosa NON è l'enum, e non va toccato
 *
 * `invoice_draft_documents_list` è un **id di vista tabella**, scritto a mano e
 * persistito nella colonna testo `user_table_view_preferences.view_id` sotto
 * vincolo unico. Rinominarlo orfanerebbe la disposizione colonne di **ogni
 * operatore**, e il frontend ingoia il 400 con un `catchError`: il guasto
 * sarebbe muto. La riga accanto — `purchase_invoice_documents_list`, che porta
 * il nome della FAMIGLIA e non del tipo `supplier_invoice` — dimostra che
 * quegli id già non seguono l'enum.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/** Il nome ritirato, composto per non comparire intero in questo file. */
const AGO = ['invoice', 'draft'].join('_');

/** ⛔ NON è l'enum: è un id di vista persistito. Vedi il blocco sopra. */
const ID_DI_VISTA = `${AGO}_documents_list`;

/** La migration che ha fatto la rinomina: da qui in poi il nome vecchio è un errore. */
const RINOMINA = '20260826003840_rinomina_invoice_draft_in_invoice';

const AREE = ['src', 'api/src', 'e2e'];
const MIGRATIONS = 'api/prisma/migrations';
const ESTENSIONI = new Set(['.ts', '.html', '.scss', '.mjs']);

/**
 * Righe che RACCONTANO il ritiro: sono la memoria del perché, e restano.
 *
 * ⚠️ È lo stesso meccanismo di `check-terminologia`. Senza, un commento che
 * spiega la rinomina verrebbe segnalato come residuo — e la reazione naturale
 * sarebbe cancellarlo, cioè togliere proprio la spiegazione che serve a chi
 * arriva dopo.
 */
const MARCATORI_DI_RITIRO = ['qui c', 'rinominat', 'si chiamava', '26/08/2026'];

function* fileIn(dir, estensioni) {
  let voci;
  try {
    voci = readdirSync(dir);
  } catch {
    return;
  }
  for (const voce of voci) {
    const pieno = join(dir, voce);
    if (statSync(pieno).isDirectory()) {
      yield* fileIn(pieno, estensioni);
    } else if (!estensioni || estensioni.has(voce.slice(voce.lastIndexOf('.')))) {
      yield pieno;
    }
  }
}

/** Toglie l'id di vista e le righe che narrano il ritiro: quelle sono lecite. */
function occorrenzeVere(testo) {
  const vive = testo
    .split(/\r?\n/)
    .filter((riga) => {
      const minuscola = riga.toLowerCase();
      return !MARCATORI_DI_RITIRO.some((marcatore) => minuscola.includes(marcatore));
    })
    .join('\n');
  return vive.split(ID_DI_VISTA).join('').split(AGO).length - 1;
}

const violazioni = [];

for (const area of AREE) {
  for (const percorso of fileIn(area, ESTENSIONI)) {
    const rel = relative(process.cwd(), percorso).split('\\').join('/');
    const testo = readFileSync(percorso, 'utf8');
    const quante = occorrenzeVere(testo);
    if (quante > 0) {
      violazioni.push({
        file: rel,
        problema: `${quante} occorrenza/e del nome ritirato`,
        rimedio: "il tipo si chiama `invoice`. Se è l'id di vista, lasciarlo com'è.",
      });
    }
  }
}

// ⚠️ La metà che conta davvero: una migration NUOVA col nome vecchio.
let cartelle = [];
try {
  cartelle = readdirSync(MIGRATIONS).filter(
    // ⚠️ Solo le CARTELLE: `migration_lock.toml` ordina dopo la rinomina e
    // verrebbe contato come una migration, facendo mentire il numero.
    (nome) => nome > RINOMINA && statSync(join(MIGRATIONS, nome)).isDirectory(),
  );
} catch {
  cartelle = [];
}
for (const cartella of cartelle) {
  const sql = join(MIGRATIONS, cartella, 'migration.sql');
  let testo;
  try {
    testo = readFileSync(sql, 'utf8');
  } catch {
    continue;
  }
  if (occorrenzeVere(testo) > 0) {
    violazioni.push({
      file: `${MIGRATIONS}/${cartella}/migration.sql`,
      problema: 'una migration NUOVA nomina il valore di enum vecchio',
      rimedio:
        "Postgres risponde 22P02, la migration resta registrata come FALLITA, e da li' " +
        "`migrate deploy` non applica piu' niente — ne' a te, ne' al boot di Railway.",
    });
  }
}

if (violazioni.length === 0) {
  console.log(
    '✅ check:nome-fattura — il tipo documento si chiama `invoice` ovunque ' +
      `(${cartelle.length} migration dopo la rinomina, nessuna col nome vecchio).`,
  );
  process.exit(0);
}

console.error("\n⛔ Il valore di enum ritirato non esiste piu' dal 26/08/2026.\n");
for (const v of violazioni) {
  console.error(`   ${v.file}\n     ${v.problema}\n     → ${v.rimedio}`);
}
console.error('');
process.exit(1);
