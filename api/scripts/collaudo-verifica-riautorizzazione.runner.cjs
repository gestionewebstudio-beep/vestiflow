/**
 * Dopo «Disconnetti → Connetti» sul collaudo: che cosa è stato DAVVERO concesso.
 *
 *   node scripts/collaudo-esegui.mjs collaudo-verifica-riautorizzazione.runner.cjs
 *
 * Stampa (senza mai stampare il token):
 *  - gli ambiti salvati sul token e sulla connessione, e se c'è
 *    `read_merchant_managed_fulfillment_orders`;
 *  - le sottoscrizioni webhook come stanno SUL NEGOZIO (`check`, lo stesso
 *    comando di «Verifica ora»): quante, quali mancano, verso quale indirizzo,
 *    e se esistono altri indirizzi (⛔ mai due destinazioni);
 *  - per ogni ordine di canale aperto, la sede per riga letta dai fulfillment
 *    order — la lettura vera, con la coppia attiva.
 * Scrive solo ciò che «Verifica ora» scrive: l'osservazione dei webhook sulla
 * connessione. Verso Shopify: sola lettura.
 */
'use strict';

async function main() {
  const { NestFactory } = require('@nestjs/core');
  const { AppModule } = require('../dist/app.module');
  const { PrismaService } = require('../dist/prisma/prisma.service');
  const { ShopifyWebhookStatusService } = require('../dist/shopify/shopify-webhook-status.service');
  const {
    ShopifyFulfillmentOrdersService,
  } = require('../dist/shopify/shopify-fulfillment-orders.service');
  const { SHOPIFY_WEBHOOK_TOPICS } = require('../dist/shopify/shopify-webhook-topics');
  const AMBITO = 'read_merchant_managed_fulfillment_orders';

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const prisma = app.get(PrismaService);
    const db = await prisma.$queryRawUnsafe('SELECT current_database() AS db');
    if (db[0]?.db !== 'vestiflow_collaudo') {
      throw new Error(`database «${db[0]?.db}», non vestiflow_collaudo`);
    }
    const conn = await prisma.shopifyConnection.findFirstOrThrow({
      select: { tenantId: true, shopDomain: true, scopes: true, status: true, updatedAt: true },
    });
    const cred = await prisma.shopifyCredential.findUniqueOrThrow({
      where: { tenantId: conn.tenantId },
      select: { scopes: true, updatedAt: true },
    });
    console.log(
      `- ${conn.shopDomain} · ${conn.status} · credenziale aggiornata ${cred.updatedAt.toISOString()}`,
    );
    console.log(
      `- ambiti del token: ${cred.scopes.length} · ${AMBITO}: ${cred.scopes.includes(AMBITO) ? 'CONCESSO' : 'ASSENTE'}`,
    );
    console.log(`  ${[...cred.scopes].sort().join(', ')}`);
    console.log(
      `- ambiti sulla connessione: ${conn.scopes.length} · ${AMBITO}: ${conn.scopes.includes(AMBITO) ? 'presente' : 'assente'}`,
    );

    const webhook = await app.get(ShopifyWebhookStatusService).check(conn.tenantId);
    console.log(
      `- webhook sul negozio: ${webhook.topics.length} attesi ${SHOPIFY_WEBHOOK_TOPICS.length} · indirizzo ${webhook.observedAddress ?? '—'} · coincide con il configurato: ${webhook.addressMatchesConfigured}`,
    );
    console.log(
      `  mancanti: ${webhook.missingTopics.length ? webhook.missingTopics.join(', ') : 'nessuno'}`,
    );
    console.log(
      `  altri indirizzi: ${webhook.otherAddresses.length ? webhook.otherAddresses.map((a) => `${a.address} (${a.topicCount})`).join(' · ') : 'nessuno'}`,
    );

    const ordini = await prisma.salesOrder.findMany({
      where: {
        tenantId: conn.tenantId,
        source: { in: ['shopify_online', 'shopify_pos'] },
        cancelledAt: null,
        fulfillmentStatus: { not: 'fulfilled' },
      },
      select: {
        orderNumber: true,
        shopifyOrderId: true,
        requiresReview: true,
        lines: { select: { id: true, externalLineId: true, sku: true, quantity: true } },
      },
      orderBy: { orderNumber: 'asc' },
    });
    const fo = app.get(ShopifyFulfillmentOrdersService);
    for (const o of ordini) {
      const sedi = await fo.sediDelleRighe(
        conn.tenantId,
        String(o.shopifyOrderId),
        o.lines.map((l) => ({ salesOrderLineId: l.id, externalLineId: l.externalLineId })),
      );
      const righe = o.lines.map((l) => {
        const s = sedi.get(l.id);
        const esito = !s
          ? '?'
          : 'locationId' in s
            ? `sede ${s.locationId}`
            : 'evasa' in s
              ? 'evasa'
              : `IRRISOLTA (${s.motivo.tipo})`;
        return `${l.sku} ×${l.quantity} → ${esito}`;
      });
      console.log(
        `- ordine ${o.orderNumber} (daVerificare=${o.requiresReview}): ${righe.join(' | ')}`,
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
