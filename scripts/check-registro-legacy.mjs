/**
 * Guardia incrociata: il vocabolario del vecchio «registro commercialista» non
 * deve rientrare, da nessuna parte.
 *
 * Il 16/08/2026 sono state ritirate tre strutture che si somigliavano e che
 * nessun test copriva insieme:
 *
 *   · il **Registro commercialista** e l'azione «Inviata al commercialista»
 *     (`DocumentStatus.externally_registered`);
 *   · la **consegna al commercialista** dei Corrispettivi (`markDelivered`,
 *     lo storico consegne, `delivered_to_accountant`);
 *   · lo **stato fiscale della vendita** (`sales_orders.fiscal_status`).
 *
 * Perché serve una guardia e non bastano i test: nessuna di queste cose
 * romperebbe qualcosa tornando. Un `fiscalStatus` riaggiunto a un DTO compila,
 * passa i test e non fa arrossare niente — semplicemente ricostruisce un
 * modello che abbiamo deciso di non avere. Le decisioni funzionali non hanno un
 * compilatore: hanno questa lista.
 *
 * Attraversa API, frontend ed e2e in una passata sola, che è il punto: le tre
 * strutture vivevano in strati diversi e si tenevano su a vicenda.
 *
 * Se una voce va davvero reintrodotta, si toglie da qui **con la decisione
 * scritta accanto** — non si aggiunge un'eccezione al file che sta controllando.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Cartelle da attraversare: i tre strati che tenevano su le strutture. */
const AREE = ['src/app', 'api/src', 'e2e'];
const ESTENSIONI = new Set(['.ts', '.html', '.scss']);

/** Ciò che non deve rientrare, con il perché — il messaggio è metà del valore. */
const VIETATI = [
  {
    termine: 'externally_registered',
    perche:
      'stato «Registrato esternamente»: ritirato col Registro commercialista. Resta morto nel tipo PostgreSQL, non nel codice.',
  },
  { termine: 'ExternallyRegistered', perche: 'idem, forma frontend.' },
  {
    termine: 'registerExternal',
    perche: 'azione «Inviata al commercialista»: VestiFlow non traccia cosa è stato mandato.',
  },
  {
    termine: 'accountant-register',
    perche: 'il Registro commercialista è stato rimosso: i sottoinsiemi si ottengono coi filtri.',
  },
  {
    termine: 'AccountantRegister',
    perche: 'idem, forma classe/modulo.',
  },
  {
    termine: 'markDelivered',
    perche: 'consegna dei Corrispettivi al commercialista: stampare o esportare non genera stati.',
  },
  {
    termine: 'delivered_to_accountant',
    perche: 'stato «Consegnato al commercialista»: stessa decisione.',
  },
  {
    termine: 'DeliveredToAccountant',
    perche: 'idem, forma frontend.',
  },
  {
    termine: 'CorrispettiviDelivery',
    perche: 'storico delle consegne: tabella rimossa, non va ricostruita.',
  },
  {
    termine: 'pendingDeliveryOnly',
    perche: 'filtro «solo da consegnare»: non esiste un «da consegnare».',
  },
  {
    termine: 'pendingDeliveryCount',
    perche: 'contatore «da consegnare»: stessa decisione.',
  },
  {
    termine: 'fiscalStatus',
    perche:
      'stato fiscale sulla vendita: il Registro classifica per ORIGINE (`source`), che è un fatto. Vedi la nota del 16/08 sulla struttura Vendite e Corrispettivi.',
  },
  {
    termine: 'SalesOrderFiscalStatus',
    perche: 'enum dello stato fiscale: rimosso con la colonna, tipo PostgreSQL incluso.',
  },
  {
    termine: 'excluded_pos_register',
    perche:
      'Shopify POS COMPARE nel Registro come vendita fisica/POS: non si esclude, si classifica.',
  },
];

/** Questo file nomina i termini per mestiere: si esclude da sé. */
const ESENTI = new Set([relative(root, fileURLToPath(import.meta.url)).replaceAll('\\', '/')]);

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

const trovati = [];
for (const area of AREE) {
  for (const file of filesIn(join(root, area))) {
    const rel = relative(root, file).replaceAll('\\', '/');
    if (ESENTI.has(rel)) continue;
    const righe = readFileSync(file, 'utf8').split(/\r?\n/);
    righe.forEach((riga, i) => {
      // I commenti che RACCONTANO la rimozione sono la memoria del perché:
      // vietare anche quelli costringerebbe a cancellare la spiegazione.
      const testo = riga.trim();
      const eCommento =
        testo.startsWith('//') ||
        testo.startsWith('*') ||
        testo.startsWith('/*') ||
        testo.startsWith('<!--') ||
        testo.startsWith('///');
      if (eCommento) return;
      for (const { termine, perche } of VIETATI) {
        if (riga.includes(termine)) {
          trovati.push({ file: rel, riga: i + 1, termine, perche, testo: testo.slice(0, 90) });
        }
      }
    });
  }
}

if (trovati.length > 0) {
  console.error('\n✖ Vocabolario del vecchio registro commercialista rientrato nel codice:\n');
  for (const t of trovati) {
    console.error(`  ${t.file}:${t.riga}  «${t.termine}»`);
    console.error(`    ${t.testo}`);
    console.error(`    → ${t.perche}\n`);
  }
  console.error(
    `${trovati.length} occorrenze. Se una di queste va davvero reintrodotta, toglila da\n` +
      'scripts/check-registro-legacy.mjs insieme alla decisione che lo giustifica.\n',
  );
  process.exit(1);
}

console.log(
  `✓ registro: nessuno dei ${VIETATI.length} termini ritirati è rientrato in ${AREE.join(', ')}.`,
);
