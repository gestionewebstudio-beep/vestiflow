#!/usr/bin/env node
/**
 * Le colonne ordinabili di un elenco vivono in DUE posti — la whitelist
 * dell'endpoint, che sa tradurle in `ORDER BY`, e il suo specchio nel frontend,
 * che decide quali intestazioni si possono premere (`14` §H15).
 *
 * ⛔ **Una divergenza non rompe niente e non fa arrossare un test.** Fa una di
 * queste due cose, tutte e due in silenzio:
 *
 * | Colonna in più nel client | l'operatore preme, l'API risponde `400`, l'elenco sparisce |
 * | Colonna in più nell'API   | una capacità che esiste e che nessuno può usare             |
 *
 * È lo stesso mestiere di `check:permissions`: due mappe che devono restare
 * identiche, e nessun compilatore che le guardi insieme.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** I tre elenchi paginati che ordinano lato server. */
const ELENCHI = [
  {
    nome: 'documenti',
    api: 'api/src/documents/documents-sort.util.ts',
    client: 'src/app/features/documents/models/document-table-columns.config.ts',
    insieme: 'DOCUMENT_LIST_SORTABLE_COLUMNS',
  },
  {
    nome: 'ordini fornitore',
    api: 'api/src/supplier-orders/supplier-orders-sort.util.ts',
    client: 'src/app/features/orders/supplier-order-list.component.ts',
    insieme: 'SORTABLE',
  },
  {
    nome: 'ordini cliente',
    api: 'api/src/sales-orders/sales-orders-sort.util.ts',
    client: 'src/app/features/sales-orders/models/sales-order-list-columns.config.ts',
    insieme: 'SALES_ORDER_LIST_SORTABLE_COLUMNS',
  },
];

const errori = [];

/**
 * Le chiavi di `ORDER_BY` lato API: sono le colonne che il database sa
 * ordinare, ed è la fonte — il client ne è lo specchio.
 *
 * ⚠️ Si taglia per indici e non con una regex sola: il tipo dichiarato contiene
 * `=>`, e una regex «fino al primo `=`» si ferma là invece che sull'oggetto.
 */
function colonneApi(sorgente, file) {
  const apertura = sorgente.indexOf('const ORDER_BY');
  if (apertura < 0) {
    throw new Error(`ORDER_BY non trovata in ${file}`);
  }
  const corpo = sorgente.slice(sorgente.indexOf('> = {', apertura));
  const blocco = corpo.slice(0, corpo.indexOf(FINE_OGGETTO));
  return [...blocco.matchAll(CHIAVE_ORDER_BY)].map((m) => m[1]).sort();
}

/** I valori di un `new Set([...])`, comunque si chiami chi lo tiene. */
function colonneClient(sorgente, insieme, file) {
  const apertura = sorgente.indexOf(insieme);
  if (apertura < 0) {
    throw new Error(`${insieme} non trovato in ${file}`);
  }
  const corpo = sorgente.slice(sorgente.indexOf('new Set([', apertura));
  const blocco = corpo.slice(0, corpo.indexOf(']'));
  return [...blocco.matchAll(VALORE_STRINGA)].map((m) => m[1]).sort();
}

const CHIAVE_ORDER_BY = /^ {2}(\w+): \(direction\)/gm;
const VALORE_STRINGA = /'([^']+)'/g;
const FINE_OGGETTO = '\n};';

for (const elenco of ELENCHI) {
  const api = colonneApi(readFileSync(join(ROOT, elenco.api), 'utf8'), elenco.api);
  const client = colonneClient(
    readFileSync(join(ROOT, elenco.client), 'utf8'),
    elenco.insieme,
    elenco.client,
  );

  const soloClient = client.filter((colonna) => !api.includes(colonna));
  const soloApi = api.filter((colonna) => !client.includes(colonna));

  if (soloClient.length > 0) {
    errori.push(
      `${elenco.nome}: il client offre ${soloClient.map((c) => `«${c}»`).join(', ')} che l'API non ordina → 400 al primo clic`,
    );
  }
  if (soloApi.length > 0) {
    errori.push(
      `${elenco.nome}: l'API ordina ${soloApi.map((c) => `«${c}»`).join(', ')} e il client non lo offre → capacità inutilizzabile`,
    );
  }
}

if (errori.length > 0) {
  console.error('\n✗ ordinamento: whitelist API e client divergono\n');
  for (const errore of errori) {
    console.error(`  • ${errore}`);
  }
  console.error(
    "\n  Le due liste devono restare identiche: la fonte è `ORDER_BY` dell'endpoint,\n" +
      '  il client ne è lo specchio (`14` §H15).\n',
  );
  process.exit(1);
}

console.log(`✓ ordinamento: ${ELENCHI.length} elenchi, whitelist API e client allineate.`);
