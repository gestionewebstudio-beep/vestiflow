/**
 * RICONSEGNA di un webhook: lo stesso ordine, com'è ORA su Shopify (REST, sola
 * lettura), rimandato all'endpoint dei webhook dell'API di collaudo con argomento,
 * dominio e firma HMAC — la strada del webhook, non quella del reimporto. È la
 * prova che un evento consegnato due volte non produce un secondo effetto.
 *
 *   node scripts/collaudo-esegui.mjs collaudo-riconsegna-webhook.runner.cjs '#1012' orders/updated
 *
 * Stampa: la risposta dell'API, gli eventi canonici dell'ordine prima e dopo (non
 * deve nascerne nessuno), impegni e movimenti prima e dopo (invariati). Le scritture
 * verso Shopify si leggono nel log dell'API («Shopify ← SCRITTURA …»): qui non ce ne
 * devono essere.
 *
 * ⚠️ La firma usa la chiave dell'app dall'ambiente del collaudo, come fa l'API
 *    per verificarla: resta in memoria, non si stampa. Il corpo è l'ordine letto
 *    da Shopify: stessi `updated_at`, stesse evasioni del webhook originale.
 */
'use strict';

const { createHmac } = require('node:crypto');

async function main() {
  const [numero, topic = 'orders/updated'] = process.argv.slice(2);
  if (!numero) {
    throw new Error("indica l'ordine, es. '#1012' [orders/updated]");
  }
  const secret = process.env.SHOPIFY_API_SECRET;
  const porta = process.env.PORT;
  if (!secret || !porta) {
    throw new Error("manca SHOPIFY_API_SECRET o PORT nell'ambiente del collaudo");
  }
  const { NestFactory } = require('@nestjs/core');
  const { AppModule } = require('../dist/app.module');
  const { PrismaService } = require('../dist/prisma/prisma.service');
  const { ShopifyAdminClient } = require('../dist/shopify/shopify-admin.client');
  const { ShopifyOAuthService } = require('../dist/shopify/shopify-oauth.service');
  const { legacyIdFromGid } = require('../dist/shopify/shopify-money.util');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const prisma = app.get(PrismaService);
    const db = await prisma.$queryRawUnsafe('SELECT current_database() AS db');
    if (db[0]?.db !== 'vestiflow_collaudo') {
      throw new Error(`database «${db[0]?.db}», non vestiflow_collaudo`);
    }
    const conn = await prisma.shopifyConnection.findFirstOrThrow({
      select: { tenantId: true, shopDomain: true },
    });
    const tenantId = conn.tenantId;
    const o = await prisma.salesOrder.findFirstOrThrow({
      where: { tenantId, orderNumber: numero },
      select: { id: true, shopifyOrderId: true },
    });
    const fotografa = async () => {
      const eventi = await prisma.onlineOrderEvent.count({ where: { tenantId, salesOrderId: o.id } });
      const impegni = await prisma.stockReservation.findMany({
        where: { tenantId, salesOrderId: o.id },
        select: { status: true, remainingQuantity: true },
      });
      const movimenti = await prisma.stockMovement.count({ where: { tenantId } });
      const vendite = await prisma.onlineSale.count({ where: { tenantId } });
      return {
        eventi,
        impegni: impegni.map((i) => `${i.status} ${i.remainingQuantity}`).join(' + '),
        movimenti,
        vendite,
      };
    };
    const prima = await fotografa();
    console.log(
      `- ${numero} PRIMA: eventi ${prima.eventi} · impegni ${prima.impegni} · movimenti (tenant) ${prima.movimenti} · vendite online ${prima.vendite}`,
    );

    const { shopDomain, accessToken } = await app.get(ShopifyOAuthService).getAccessToken(tenantId);
    const ordine = await app
      .get(ShopifyAdminClient)
      .getOrder(shopDomain, accessToken, legacyIdFromGid(String(o.shopifyOrderId)));
    if (!ordine) {
      throw new Error(`Shopify non restituisce ${numero}`);
    }
    const corpo = Buffer.from(JSON.stringify(ordine), 'utf8');
    const firma = createHmac('sha256', secret).update(corpo).digest('base64');
    const risposta = await fetch(`http://127.0.0.1:${porta}/api/v1/shopify/webhooks`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-shopify-topic': topic,
        'x-shopify-shop-domain': conn.shopDomain,
        'x-shopify-hmac-sha256': firma,
        'x-shopify-webhook-id': `riconsegna-collaudo-${Date.now()}`,
      },
      body: corpo,
    });
    const testo = await risposta.text();
    console.log(
      `- riconsegna ${topic} di ${numero} (updated_at ${ordine.updated_at}, evasioni ${(ordine.fulfillments ?? []).length}): HTTP ${risposta.status} ${testo.slice(0, 120)}`,
    );
    // L'elaborazione è sincrona nel controller: la risposta arriva a effetti applicati.
    const dopo = await fotografa();
    console.log(
      `- ${numero} DOPO:  eventi ${dopo.eventi} · impegni ${dopo.impegni} · movimenti (tenant) ${dopo.movimenti} · vendite online ${dopo.vendite}`,
    );
    const invariato =
      prima.eventi === dopo.eventi &&
      prima.impegni === dopo.impegni &&
      prima.movimenti === dopo.movimenti &&
      prima.vendite === dopo.vendite;
    console.log(`- esito: ${invariato ? 'NESSUN effetto (come deve)' : '⛔ QUALCOSA È CAMBIATO'}`);
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error('Fermo:', e.message);
  process.exit(1);
});
