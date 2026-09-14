/**
 * PROVA 4 del collaudo reale (`docs/28` §3): INTERRUZIONE e RECUPERO, misurati.
 *
 * Il componente fermato è la SOLA API di collaudo (3100): il tunnel resta acceso con lo
 * stesso indirizzo pubblico e Shopify, non ricevendo il 200, RITENTA le notifiche (fino a 8
 * tentativi in 4 ore). In sola lettura, salvo la fase `importa`, che esegue il RECUPERO
 * APPLICATIVO usato dal comando «Importa ordini» (`ordersSinceIdSeAttivato` →
 * `recuperaOrdini`, gli stessi servizi): dimostra il recupero, non il clic nell'interfaccia.
 * La riconsegna si legge nel log dell'API 3100 (`Shopify → notifica … accolta`), non da qui.
 *
 *   node scripts/collaudo-esegui.mjs collaudo-prova-4.runner.cjs '#1015' assente
 *      → l'ordine NON deve esistere (Shopify l'ha già evaso, l'API era ferma); se esiste,
 *        un webhook ha anticipato il recupero: quella passata NON dimostra il recupero manuale.
 *   node scripts/collaudo-esegui.mjs collaudo-prova-4.runner.cjs '#1015' importa
 *      → il recupero, con le chiamate uscenti nel log; poi ordine, scarichi, Vendita.
 *   node scripts/collaudo-esegui.mjs collaudo-prova-4.runner.cjs '#1015' riconsegna
 *      → dopo i webhook ritentati da Shopify: UN solo scarico per riga di spedizione, UNA
 *        Vendita online — nessun doppione dalla riconsegna.
 */
'use strict';

async function main() {
  const [numero, fase] = process.argv.slice(2);
  if (!numero || !['assente', 'importa', 'riconsegna'].includes(fase ?? '')) {
    throw new Error("indica l'ordine e la fase: '#1015' assente|importa|riconsegna");
  }
  const { NestFactory } = require('@nestjs/core');
  const { AppModule } = require('../dist/app.module');
  const { PrismaService } = require('../dist/prisma/prisma.service');
  const { ShopifyOrdersPullService } = require('../dist/shopify/shopify-orders-pull.service');
  const { ShopifySetupService } = require('../dist/shopify/shopify-setup.service');

  // Con 'debug' si vedono le LETTURE uscenti (`Shopify ← LETTURA REST …`): è la misura.
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: fase === 'importa' ? ['error', 'warn', 'log', 'debug'] : ['error', 'warn'],
  });
  try {
    const prisma = app.get(PrismaService);
    const db = await prisma.$queryRawUnsafe('SELECT current_database() AS db');
    if (db[0]?.db !== 'vestiflow_collaudo') {
      throw new Error(`database «${db[0]?.db}», non vestiflow_collaudo`);
    }
    const conn = await prisma.shopifyConnection.findFirstOrThrow({
      select: { tenantId: true, lastWebhookEventAt: true, lastSyncAt: true },
    });
    const tenantId = conn.tenantId;
    const ora = (d) => (d ? new Date(d).toISOString().slice(0, 19).replace('T', ' ') : '—');

    const fotografia = async () => {
      const ordine = await prisma.salesOrder.findFirst({
        where: { tenantId, orderNumber: numero },
        select: {
          id: true,
          fulfillmentStatus: true,
          fulfilledAt: true,
          createdAt: true,
          updatedAt: true,
          lines: { select: { id: true, title: true, quantity: true } },
          onlineSale: { select: { id: true, reference: true, inventoryStatus: true, createdAt: true } },
          orderEvents: {
            select: { type: true, dedupeKey: true, createdAt: true },
            orderBy: { createdAt: 'asc' },
          },
        },
      });
      if (!ordine) {
        return null;
      }
      const movimenti = ordine.onlineSale
        ? await prisma.stockMovement.findMany({
            where: { tenantId, sourceDocumentType: 'online_sale', sourceDocumentId: ordine.onlineSale.id },
            select: { id: true, quantity: true, type: true, createdAt: true, locationId: true },
            orderBy: { createdAt: 'asc' },
          })
        : [];
      const spedizioni = await prisma.salesOrderShipmentLine.count({
        where: { salesOrderLineId: { in: ordine.lines.map((l) => l.id) } },
      });
      return { ordine, movimenti, spedizioni };
    };

    const stampa = (foto) => {
      if (!foto) {
        console.log(`   ${numero}: ASSENTE in VestiFlow`);
        return;
      }
      const { ordine, movimenti, spedizioni } = foto;
      console.log(
        `   ${numero}: creato ${ora(ordine.createdAt)} · aggiornato ${ora(ordine.updatedAt)} · evasione ${ordine.fulfillmentStatus} · evaso ${ora(ordine.fulfilledAt)}`,
      );
      console.log(
        `   righe ${ordine.lines.map((l) => `«${l.title}» ×${l.quantity}`).join(', ')} · righe di spedizione ${spedizioni}`,
      );
      console.log(
        `   Vendita online: ${ordine.onlineSale ? `${ordine.onlineSale.reference} (${ordine.onlineSale.inventoryStatus}, creata ${ora(ordine.onlineSale.createdAt)})` : 'NESSUNA'}`,
      );
      console.log(
        `   scarichi: ${movimenti.length} — ${movimenti.map((m) => `${m.type} ${m.quantity} @${ora(m.createdAt)}`).join(', ') || 'nessuno'}`,
      );
      console.log(`   eventi (${ordine.orderEvents.length}):`);
      for (const e of ordine.orderEvents) {
        console.log(`      ${ora(e.createdAt)} ${e.type} · ${e.dedupeKey}`);
      }
    };

    console.log(
      `── connessione: ultimo webhook accolto ${ora(conn.lastWebhookEventAt)} · ultimo sync ${ora(conn.lastSyncAt)}`,
    );

    if (fase === 'assente') {
      const foto = await fotografia();
      console.log(`── PRIMA del recupero`);
      stampa(foto);
      console.log(
        foto
          ? `   ⚠️ L'ORDINE C'È GIÀ: un webhook ha anticipato il recupero. Questa passata NON dimostra il recupero manuale.`
          : `   ✓ assente: il recupero manuale può dimostrare qualcosa.`,
      );
      return;
    }

    if (fase === 'importa') {
      const prima = await fotografia();
      if (prima) {
        console.log(`── ⚠️ l'ordine esisteva GIÀ prima del recupero (webhook anticipato):`);
        stampa(prima);
      }
      const setup = app.get(ShopifySetupService);
      const daId = await setup.ordersSinceIdSeAttivato(tenantId);
      console.log(`── RECUPERO («Importa ordini»): ordersSinceId ${daId ?? 'nullo → importazione completa'}`);
      const pull = app.get(ShopifyOrdersPullService);
      const esito =
        daId !== null ? await pull.recuperaOrdini(tenantId, daId) : await pull.pullOrders(tenantId);
      console.log(`   esito: ${JSON.stringify(esito)}`);
      console.log(`── DOPO il recupero`);
      stampa(await fotografia());
      return;
    }

    console.log(`── DOPO la riconsegna dei webhook`);
    const foto = await fotografia();
    stampa(foto);
    if (foto) {
      // UN movimento per RIGA DI SPEDIZIONE (una spedizione parziale ne fa due sulla
      // stessa riga d'ordine: non è un doppione), e una sola Vendita online.
      const unoPerSpedizione = foto.movimenti.length === foto.spedizioni;
      const vendite = await prisma.onlineSale.count({ where: { salesOrderId: foto.ordine.id } });
      console.log(
        `   ${unoPerSpedizione ? '✓' : '⛔'} scarichi ${foto.movimenti.length} per ${foto.spedizioni} righe di spedizione · ${vendite === 1 ? '✓ UNA Vendita online' : `⛔ Vendite online: ${vendite}`}`,
      );
    }
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error('Fermo:', e.message);
  process.exit(1);
});
