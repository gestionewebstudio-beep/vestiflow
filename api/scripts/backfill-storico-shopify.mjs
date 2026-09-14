/**
 * Backfill dello storico dei collegamenti Shopify — fase 3 e 4 di `docs/24`
 * §8.5.8: converte le colonne-cache (`shopify_product_id`, `shopify_variant_id`,
 * `shopify_inventory_item_id`, `locations.shopify_location_id`) in identità e
 * periodi, con i servizi ordinari (`ShopifyStoricoBackfillService`, da `dist/`).
 *
 *   node scripts/backfill-storico-shopify.mjs --tenant=<uuid>          prova, senza scrivere
 *   node scripts/backfill-storico-shopify.mjs --tutti                  prova su ogni tenant collegato
 *   node scripts/backfill-storico-shopify.mjs --tenant=<uuid> --apply  scrive
 *
 * ⭐ **Il bersaglio si dichiara prima di toccarlo** (`bersaglio.mjs`): locale
 *    → si dice e si procede; non locale → si chiede conferma, o `--conferma`.
 *    L'ambiente viene da UN file — `--env-file=<file>`, altrimenti
 *    `VESTIFLOW_ENV_FILE`, altrimenti `.env` — e le sue chiavi vincono sulla
 *    shell, come in `start-collaudo.mjs`: a valere è solo quel file.
 *
 * ⛔ **Un tenant bloccato dai controlli (§8.5.8) NON si tocca**: le anomalie si
 *    stampano con le righe, decide una persona, si riparte. Nessuna dedupe.
 *
 * ⭐ **Fase 4 è nell'esito**: dopo `--apply`, ogni id in cache senza un periodo
 *    attivo viene nominato, e il comando esce con codice 1. Un «quasi tutti»
 *    non è un esito.
 */
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { confermaBersaglioOEsci } from './bersaglio.mjs';
import { leggiFileAmbiente } from '../../scripts/backup/load-env.mjs';

const require = createRequire(import.meta.url);
const apiRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

const argv = process.argv.slice(2);
const applica = argv.includes('--apply');
const tutti = argv.includes('--tutti');
const tenantScelto = argv
  .find((a) => a.startsWith('--tenant='))
  ?.slice('--tenant='.length)
  .trim();
const fileAmbiente =
  argv
    .find((a) => a.startsWith('--env-file='))
    ?.slice('--env-file='.length)
    .trim() ||
  process.env['VESTIFLOW_ENV_FILE'] ||
  '.env';

if (!tutti && !tenantScelto) {
  console.error(
    'Uso: node scripts/backfill-storico-shopify.mjs (--tenant=<uuid> | --tutti) [--apply] [--env-file=<file>]',
  );
  process.exit(1);
}
// ⛔ `docs/DA-FARE` §14 punto 4: in applicazione il tenant è OBBLIGATORIO. Un
//    backfill che scrive su tutti i tenant insieme non è verificabile; `--tutti`
//    serve alla prova, che stampa i conteggi tenant per tenant.
if (applica && !tenantScelto) {
  console.error(
    'Con --apply serve --tenant=<uuid>: si applica un tenant alla volta, dopo la prova riletta.',
  );
  process.exit(1);
}

// ⭐ Un solo file di ambiente, e le sue chiavi vincono sulla shell.
const percorsoAmbiente = resolve(apiRoot, fileAmbiente);
const env = leggiFileAmbiente(percorsoAmbiente);
for (const [chiave, valore] of Object.entries(env)) {
  process.env[chiave] = valore;
}
process.env['VESTIFLOW_ENV_FILE'] = fileAmbiente;

await confermaBersaglioOEsci({
  azione: `backfill storico Shopify${applica ? ' (--apply)' : ' (prova)'}`,
  url: process.env['DATABASE_URL'],
  argomenti: argv,
});
console.error(`  ambiente: ${fileAmbiente}`);

function stampaEsito(esito, nome) {
  const c = (n) => String(n).padStart(4);
  console.log(`\n■ ${nome} (${esito.tenantId}) — ${esito.esito.toUpperCase()}`);
  if (esito.anomalie.length > 0) {
    console.log('  ⛔ Controlli bloccanti (§8.5.8) — decide una persona, nessuna dedupe:');
    for (const a of esito.anomalie) {
      console.log(`     ${a.controllo} · ${a.valore} · righe: ${a.righe.join(', ')}`);
    }
  }
  console.log('  storico                      prima  dopo');
  const righe = [
    ['identità prodotto', 'identitaProdotto'],
    ['periodi prodotto attivi', 'periodiProdottoAttivi'],
    ['identità variante', 'identitaVariante'],
    ['periodi variante attivi', 'periodiVarianteAttivi'],
    ['coppie sede', 'coppieSede'],
    ['periodi sede attivi', 'periodiSedeAttivi'],
  ];
  for (const [etichetta, chiave] of righe) {
    console.log(`  ${etichetta.padEnd(28)} ${c(esito.prima[chiave])}  ${c(esito.dopo[chiave])}`);
  }
  if (esito.esito === 'eseguito' && applica) {
    console.log(
      `  prodotti: +${esito.prodotti.registrati} (${esito.prodotti.giaCollegati} già collegati, ${esito.prodotti.rifiutati.length} rifiutati)`,
    );
    console.log(
      `  varianti: +${esito.varianti.registrate} (${esito.varianti.giaAgganciate} già agganciate, ${esito.varianti.rifiutate.length} rifiutate)`,
    );
    console.log(
      `  sedi:     +${esito.sedi.registrate} (${esito.sedi.giaCollegate} già collegate, ${esito.sedi.rifiutate.length} rifiutate)`,
    );
    for (const r of [
      ...esito.prodotti.rifiutati,
      ...esito.varianti.rifiutate,
      ...esito.sedi.rifiutate,
    ]) {
      console.log(`     rifiutato: ${r}`);
    }
  }
  const nc = esito.nonCoperti;
  const totale = nc.prodotti.length + nc.varianti.length + nc.sedi.length;
  if (totale === 0) {
    console.log('  ✅ verifica: ogni id in cache ha un periodo attivo nello storico.');
  } else {
    console.log(
      `  ${applica ? '⛔' : '→'} ${applica ? 'NON coperti dopo il backfill' : 'da convertire'}: ` +
        `${nc.prodotti.length} prodotti, ${nc.varianti.length} varianti, ${nc.sedi.length} sedi`,
    );
    for (const [tipo, ids] of [
      ['prodotto', nc.prodotti],
      ['variante', nc.varianti],
      ['sede', nc.sedi],
    ]) {
      for (const id of ids) {
        console.log(`     ${tipo} ${id}`);
      }
    }
  }
  return totale;
}

async function main() {
  const { NestFactory } = require('@nestjs/core');
  const { AppModule } = require('../dist/app.module');
  const { PrismaService } = require('../dist/prisma/prisma.service');
  const {
    ShopifyStoricoBackfillService,
  } = require('../dist/shopify/shopify-storico-backfill.service');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: applica ? ['error', 'warn', 'log'] : ['error', 'warn'],
  });
  let fermo = false;
  try {
    const prisma = app.get(PrismaService);
    const backfill = app.get(ShopifyStoricoBackfillService);

    const connessioni = await prisma.shopifyConnection.findMany({
      where: tutti ? {} : { tenantId: tenantScelto },
      select: { tenantId: true, shopDomain: true },
      orderBy: { tenantId: 'asc' },
    });
    const nomi = new Map(
      (
        await prisma.tenant.findMany({
          where: { id: { in: connessioni.map((c) => c.tenantId) } },
          select: { id: true, name: true },
        })
      ).map((t) => [t.id, t.name]),
    );
    if (connessioni.length === 0) {
      console.log(
        tutti
          ? 'Nessuna connessione Shopify.'
          : `Nessuna connessione Shopify per il tenant ${tenantScelto}.`,
      );
      return;
    }
    console.log(
      `${connessioni.length} connession${connessioni.length === 1 ? 'e' : 'i'} · ${applica ? 'SCRITTURA' : 'PROVA, nessuna scrittura'}`,
    );

    for (const c of connessioni) {
      const esito = await backfill.esegui(c.tenantId, { applica });
      const nonCoperti = stampaEsito(
        esito,
        `${nomi.get(c.tenantId) ?? '(tenant senza nome)'} · ${c.shopDomain ?? '(dominio assente)'}`,
      );
      if (esito.esito !== 'eseguito' || (applica && nonCoperti > 0)) {
        fermo = true;
      }
    }
    if (!applica) {
      console.log('\nProva: nessuna modifica. Con --apply si scrive.');
    }
  } finally {
    await app.close();
  }
  if (fermo) {
    process.exitCode = 1;
  }
}

main().catch((errore) => {
  const messaggio = errore instanceof Error ? errore.message : String(errore);
  console.error(`Errore backfill storico Shopify: ${messaggio}`);
  if (messaggio.includes('Cannot find module') && messaggio.includes('dist')) {
    console.error('Esegui prima: npm run build');
  }
  process.exitCode = 1;
});
