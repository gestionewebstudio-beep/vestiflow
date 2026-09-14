/**
 * Il runner della dimostrazione (vedi `collaudo-dimostra-quantita-ferma.mjs`): gira
 * nel contesto Nest compilato, con l'ambiente del collaudo già composto dal
 * chiamante. Non si lancia da solo.
 */
'use strict';

const { createDecipheriv, scryptSync } = require('node:crypto');

async function quantitaRemota(prisma, tenantId, inventoryItemId, locationGid) {
  // Sola lettura sul negozio, col token del collaudo decifrato in memoria.
  const cred = await prisma.shopifyCredential.findFirst({ where: { tenantId } });
  const key = scryptSync(
    process.env.SHOPIFY_TOKEN_ENCRYPTION_KEY ?? '',
    'vestiflow-shopify-token',
    32,
  );
  const [iv, tag, data] = cred.accessTokenEnc.split(':');
  const d = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  const token = Buffer.concat([d.update(Buffer.from(data, 'base64')), d.final()]).toString('utf8');
  const query = `{ inventoryItem(id: "gid://shopify/InventoryItem/${inventoryItemId}") { inventoryLevel(locationId: "${locationGid}") { quantities(names: ["available","on_hand"]) { name quantity } } } }`;
  const r = await fetch(`https://${cred.shopDomain}/admin/api/2026-07/graphql.json`, {
    method: 'POST',
    headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const j = await r.json();
  const q = j.data?.inventoryItem?.inventoryLevel?.quantities ?? [];
  return Object.fromEntries(q.map((x) => [x.name, x.quantity]));
}

async function main() {
  const { NestFactory } = require('@nestjs/core');
  const { AppModule } = require('../dist/app.module');
  const { PrismaService } = require('../dist/prisma/prisma.service');
  const { ShopifyInventoryPushService } = require('../dist/shopify/shopify-inventory-push.service');
  const {
    ShopifyInventoryAlignService,
  } = require('../dist/shopify/shopify-inventory-align.service');
  const { ordiniApertiSenzaSede } = require('../dist/shopify/shopify-ordini-senza-sede.util');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const prisma = app.get(PrismaService);
    const db = await prisma.$queryRawUnsafe('SELECT current_database() AS db');
    if (db[0]?.db !== 'vestiflow_collaudo')
      throw new Error(`database «${db[0]?.db}», non vestiflow_collaudo`);
    const conn = await prisma.shopifyConnection.findFirstOrThrow({
      select: { tenantId: true, shopDomain: true },
    });
    const tenantId = conn.tenantId;
    console.log(`- database ${db[0].db} · negozio ${conn.shopDomain}`);

    const senzaSede = await ordiniApertiSenzaSede(prisma, tenantId);
    console.log(
      `- ordini aperti senza sede: ${senzaSede.map((o) => o.orderNumber).join(', ') || 'nessuno'}`,
    );
    if (senzaSede.length === 0) return;

    // La riga non ha la relazione con la variante nel modello: due letture.
    const rigaOrdine = await prisma.salesOrderLine.findFirst({
      where: { orderId: senzaSede[0].id, variantId: { not: null } },
      select: { variantId: true },
    });
    const variante = await prisma.productVariant.findUniqueOrThrow({
      where: { id: rigaOrdine.variantId },
      select: { sku: true, shopifyInventoryItemId: true },
    });
    const riga = { variantId: rigaOrdine.variantId, variant: variante };
    const sede = await prisma.location.findFirstOrThrow({
      where: { tenantId, shopifyLocationId: { not: null } },
      select: { id: true, name: true, shopifyLocationId: true },
    });
    const gid = `gid://shopify/Location/${sede.shopifyLocationId}`;
    const prima = await quantitaRemota(prisma, tenantId, riga.variant.shopifyInventoryItemId, gid);
    const livello = await prisma.inventoryLevel.findFirst({
      where: { variantId: riga.variantId, locationId: sede.id },
      select: { onHand: true, committed: true, available: true },
    });
    console.log(
      `- variante ${riga.variant.sku} @ ${sede.name}: VestiFlow ${JSON.stringify(livello)} · Shopify prima ${JSON.stringify(prima)}`,
    );

    const push = app.get(ShopifyInventoryPushService);
    const esito = await push.pushLevel(tenantId, riga.variantId, sede.id);
    console.log(`- pushLevel → ${JSON.stringify(esito)}`);
    const dopo = await quantitaRemota(prisma, tenantId, riga.variant.shopifyInventoryItemId, gid);
    console.log(
      `- Shopify dopo ${JSON.stringify(dopo)} · invariata: ${JSON.stringify(prima) === JSON.stringify(dopo)}`,
    );
    const c2 = await prisma.shopifyConnection.findFirstOrThrow({
      select: { lastErrorCode: true, lastErrorMessage: true },
    });
    console.log(
      `- connessione: ${c2.lastErrorCode} — «${(c2.lastErrorMessage ?? '').slice(0, 140)}…»`,
    );

    const align = app.get(ShopifyInventoryAlignService);
    try {
      await align.allinea(tenantId);
      console.log('- Allinea → ⛔ NON ha rifiutato');
    } catch (e) {
      console.log(
        `- Allinea → rifiutato (${e.status ?? e.constructor.name}): «${String(e.message).slice(0, 140)}…»`,
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
