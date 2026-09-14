/**
 * ISOLA la copia del database ripristinata sulla 5434 (`docs/28` §2-bis, punto
 * 1 del proprietario): «la copia contiene anche il collegamento del collega.
 * Prima di avviare l'API di collaudo, deve impedire qualunque chiamata al suo
 * negozio». Un ripristino copia configurazioni e collegamenti; questo script
 * toglie a OGNI tenant diverso da quello del collaudo la possibilità di
 * chiamare un canale.
 *
 *   node scripts/collaudo-isola-copia.mjs --negozio test-vestiflow.myshopify.com
 *
 * Che cosa fa, e SOLO su `localhost:5434/vestiflow_collaudo`:
 * - cancella `shopify_credentials` e `tiktok_credentials` dei tenant che NON
 *   hanno il negozio indicato: senza credenziale nessun servizio può chiamare
 *   (`getAccessToken` → «Shopify non connesso»);
 * - porta le loro `shopify_connections` / `tiktok_connections` a
 *   `not_connected`, aggiornamenti automatici spenti, webhook non attivati;
 * - cancella gli stati OAuth in sospeso;
 * - rilegge e stampa: deve restare UNA credenziale, quella del negozio del collaudo.
 *
 * ⛔ Non tocca dati di magazzino, ordini, articoli: quelli sono il materiale del
 *    collaudo. Non tocca il negozio del collega su Shopify: gli toglie solo il
 *    telefono da questa copia.
 *
 * ⚠️ I bucket originali non stanno nel database: i nomi vengono dall'ambiente,
 *    e `start-collaudo.mjs` pretende i quattro `collaudo-*`.
 */
import { PrismaClient } from '@prisma/client';

import { leggiFileAmbiente } from '../../scripts/backup/load-env.mjs';
import { FILE_AMBIENTE_COLLAUDO, verificaBersaglioCollaudo } from './prisma-deploy-collaudo.mjs';

function argomento(nome) {
  const i = process.argv.indexOf(nome);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function muori(m) {
  console.error(`\n  Fermo: ${m}\n`);
  process.exit(1);
}

const negozio = argomento('--negozio');
if (!negozio || !negozio.endsWith('.myshopify.com')) {
  muori('serve --negozio <dominio del negozio del collaudo>.');
}
const env = leggiFileAmbiente(FILE_AMBIENTE_COLLAUDO);
const bersaglio = verificaBersaglioCollaudo(env['DATABASE_URL']);
if (!bersaglio.ok) {
  muori(`DATABASE_URL del collaudo ${bersaglio.motivo}.`);
}

const prisma = new PrismaClient({ datasources: { db: { url: bersaglio.url.toString() } } });
try {
  const [{ db }] = await prisma.$queryRawUnsafe('SELECT current_database() AS db');
  if (db !== 'vestiflow_collaudo') {
    muori(`connesso a «${db}», non a vestiflow_collaudo.`);
  }

  const collaudo = await prisma.shopifyConnection.findMany({
    where: { shopDomain: negozio },
    select: { tenantId: true },
  });
  if (collaudo.length !== 1) {
    muori(`tenant con il negozio «${negozio}»: attesi 1, trovati ${collaudo.length}.`);
  }
  const tenantCollaudo = collaudo[0].tenantId;

  const esito = await prisma.$transaction(async (tx) => {
    const shopifyCred = await tx.shopifyCredential.deleteMany({
      where: { tenantId: { not: tenantCollaudo } },
    });
    const tiktokCred = await tx.tikTokCredential.deleteMany({
      where: { tenantId: { not: tenantCollaudo } },
    });
    const shopifyConn = await tx.shopifyConnection.updateMany({
      where: { tenantId: { not: tenantCollaudo } },
      data: {
        status: 'not_connected',
        autoSyncEnabled: false,
        webhooksActivatedAt: null,
        lastErrorCode: 'collaudo_isolato',
        lastErrorMessage: 'Copia di collaudo: connessione disattivata, nessuna chiamata al canale.',
        lastErrorAt: new Date(),
      },
    });
    const tiktokConn = await tx.tikTokConnection.updateMany({
      where: { tenantId: { not: tenantCollaudo } },
      data: { status: 'not_connected' },
    });
    const oauth = await tx.shopifyOAuthState.deleteMany({});
    return { shopifyCred, tiktokCred, shopifyConn, tiktokConn, oauth };
  });

  console.log(`  tenant del collaudo: ${tenantCollaudo} (${negozio})`);
  console.log(
    `  credenziali Shopify cancellate: ${esito.shopifyCred.count} · TikTok: ${esito.tiktokCred.count}`,
  );
  console.log(
    `  connessioni Shopify disattivate: ${esito.shopifyConn.count} · TikTok: ${esito.tiktokConn.count}`,
  );
  console.log(`  stati OAuth in sospeso cancellati: ${esito.oauth.count}`);

  // ── La rilettura: la prova, non la promessa ─────────────────────────────
  const rimaste = await prisma.shopifyCredential.findMany({
    select: { tenantId: true, shopDomain: true },
  });
  const tiktokRimaste = await prisma.tikTokCredential.count();
  const connesse = await prisma.shopifyConnection.findMany({
    where: { status: 'connected' },
    select: { tenantId: true, shopDomain: true },
  });
  console.log(
    `\n  credenziali Shopify rimaste: ${rimaste.map((r) => r.shopDomain).join(', ') || 'nessuna'}`,
  );
  console.log(`  credenziali TikTok rimaste: ${tiktokRimaste}`);
  console.log(
    `  connessioni Shopify ancora «connected»: ${connesse.map((c) => c.shopDomain).join(', ') || 'nessuna'}`,
  );
  const ok =
    rimaste.length === 1 &&
    rimaste[0].shopDomain === negozio &&
    tiktokRimaste === 0 &&
    connesse.every((c) => c.shopDomain === negozio);
  if (!ok) {
    muori('la copia NON è isolata: resta una credenziale o una connessione di un altro negozio.');
  }
  console.log(
    '\n  ✅ copia isolata: solo il negozio del collaudo può essere chiamato da questa API.',
  );
} finally {
  await prisma.$disconnect();
}
