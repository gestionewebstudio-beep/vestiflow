/**
 * L'ordine COM'È su Shopify oggi (REST, sola lettura): i campi da cui VestiFlow
 * deduce la sede — `location_id` di testata, le evasioni con la loro
 * `location_id`, lo stato — e che cosa `extractShopifyOrderLocationId` ne ricava.
 *
 *   node scripts/collaudo-esegui.mjs collaudo-ordine-payload.runner.cjs '#1012'
 *
 * Non scrive nulla, né qui né su Shopify.
 */
'use strict';

async function main() {
  const [numero] = process.argv.slice(2);
  if (!numero) {
    throw new Error("indica il numero dell'ordine, es. '#1012'");
  }
  const { NestFactory } = require('@nestjs/core');
  const { AppModule } = require('../dist/app.module');
  const { PrismaService } = require('../dist/prisma/prisma.service');
  const { ShopifyAdminClient } = require('../dist/shopify/shopify-admin.client');
  const { ShopifyOAuthService } = require('../dist/shopify/shopify-oauth.service');
  const { legacyIdFromGid } = require('../dist/shopify/shopify-money.util');
  const {
    extractShopifyOrderLocationId,
    resolveShopifyOrderLocationId,
  } = require('../dist/shopify/shopify-order-location.util');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const prisma = app.get(PrismaService);
    const db = await prisma.$queryRawUnsafe('SELECT current_database() AS db');
    if (db[0]?.db !== 'vestiflow_collaudo') {
      throw new Error(`database «${db[0]?.db}», non vestiflow_collaudo`);
    }
    const conn = await prisma.shopifyConnection.findFirstOrThrow({ select: { tenantId: true } });
    const tenantId = conn.tenantId;
    const o = await prisma.salesOrder.findFirstOrThrow({
      where: { tenantId, orderNumber: numero },
      select: { shopifyOrderId: true },
    });
    const { shopDomain, accessToken } = await app.get(ShopifyOAuthService).getAccessToken(tenantId);
    const ordine = await app
      .get(ShopifyAdminClient)
      .getOrder(shopDomain, accessToken, legacyIdFromGid(String(o.shopifyOrderId)));
    if (!ordine) {
      throw new Error(`Shopify non restituisce ${numero}`);
    }
    console.log(
      `- ${numero}: location_id di testata = ${JSON.stringify(ordine.location_id ?? null)} · source_name ${ordine.source_name} · financial ${ordine.financial_status} · fulfillment ${ordine.fulfillment_status}`,
    );
    for (const f of ordine.fulfillments ?? []) {
      console.log(
        `  evasione ${f.id}: status ${f.status} · location_id ${JSON.stringify(f.location_id ?? null)} · creata ${f.created_at} · righe ${(f.line_items ?? []).map((l) => `${l.id}×${l.quantity}`).join(', ')}`,
      );
    }
    for (const l of ordine.line_items ?? []) {
      console.log(
        `  riga ${l.id}: «${l.title}» sku ${JSON.stringify(l.sku ?? null)} · variant ${l.variant_id} · fulfillment_status ${l.fulfillment_status ?? '—'} · fulfillable ${l.fulfillable_quantity}`,
      );
    }
    const estratta = extractShopifyOrderLocationId(ordine);
    const risolta = await resolveShopifyOrderLocationId(prisma, tenantId, ordine);
    const sede = risolta
      ? await prisma.location.findUnique({ where: { id: risolta }, select: { name: true } })
      : null;
    console.log(
      `- extractShopifyOrderLocationId → ${estratta ?? 'null'} · resolveShopifyOrderLocationId → ${risolta ? `«${sede?.name}»` : 'null'}`,
    );
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error('Fermo:', e.message);
  process.exit(1);
});
