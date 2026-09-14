/**
 * Che cosa ha SCRITTO «Allinea giacenze su Shopify» dopo un istante dato: le coppie
 * con un invio (`lastPushedAt`) dopo l'istante, con il valore inviato, quello
 * osservato prima sul canale, la giacenza VestiFlow di adesso e i livelli Shopify
 * di adesso (on_hand · available · committed). Sola lettura.
 *
 *   node scripts/collaudo-esegui.mjs collaudo-allinea-scritture.runner.cjs '2026-09-13T13:27:00Z'
 */
'use strict';

async function main() {
  const [daIso] = process.argv.slice(2);
  if (!daIso) {
    throw new Error("indica l'istante, es. '2026-09-13T13:27:00Z'");
  }
  const da = new Date(daIso);
  const { NestFactory } = require('@nestjs/core');
  const { AppModule } = require('../dist/app.module');
  const { PrismaService } = require('../dist/prisma/prisma.service');
  const { ShopifyGraphqlClient } = require('../dist/shopify/shopify-graphql.client');
  const { ShopifyOAuthService } = require('../dist/shopify/shopify-oauth.service');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const prisma = app.get(PrismaService);
    const db = await prisma.$queryRawUnsafe('SELECT current_database() AS db');
    if (db[0]?.db !== 'vestiflow_collaudo') {
      throw new Error(`database «${db[0]?.db}», non vestiflow_collaudo`);
    }
    const conn = await prisma.shopifyConnection.findFirstOrThrow({ select: { tenantId: true } });
    const tenantId = conn.tenantId;
    const ora = (d) => (d ? new Date(d).toISOString().slice(11, 19) : '—');
    const stati = await prisma.shopifyInventorySyncState.findMany({
      where: { tenantId, lastPushedAt: { gte: da } },
      orderBy: { lastPushedAt: 'asc' },
      select: {
        lastPushedAvailable: true,
        lastPushedAt: true,
        lastObservedShopifyAvailable: true,
        lastObservedAt: true,
        mismatchDetected: true,
        mismatchNote: true,
        location: { select: { name: true, shopifyLocationId: true } },
        variant: {
          select: {
            sku: true,
            shopifyInventoryItemId: true,
            product: { select: { name: true } },
            inventoryLevels: {
              select: { locationId: true, onHand: true, available: true, committed: true },
            },
          },
        },
        locationId: true,
      },
    });
    const osservate = await prisma.shopifyInventorySyncState.count({
      where: { tenantId, lastObservedAt: { gte: da } },
    });
    console.log(`- coppie osservate dopo ${daIso}: ${osservate} · con un invio: ${stati.length}`);
    const { shopDomain, accessToken } = await app.get(ShopifyOAuthService).getAccessToken(tenantId);
    const graphql = app.get(ShopifyGraphqlClient);
    for (const s of stati) {
      const lv = s.variant.inventoryLevels.find((l) => l.locationId === s.locationId);
      const item = String(s.variant.shopifyInventoryItemId);
      const itemGid = item.startsWith('gid://') ? item : `gid://shopify/InventoryItem/${item}`;
      const stock = await graphql.getRemoteStockAtLocation(
        shopDomain,
        accessToken,
        itemGid,
        `gid://shopify/Location/${s.location.shopifyLocationId}`,
      );
      console.log(
        `  ${ora(s.lastPushedAt)} «${s.variant.product.name}» (${s.variant.sku}) @ «${s.location.name}»: osservato ${s.lastObservedShopifyAvailable ?? '—'} → inviato ${s.lastPushedAvailable} · VestiFlow ora ${lv ? `${lv.onHand} · ${lv.committed} · ${lv.available}` : '?'} · Shopify ora ${stock.found ? `on_hand ${stock.onHand} · available ${stock.available} · committed ${stock.committed}` : stock.reason}${s.mismatchDetected ? ` · ⚠️ ${s.mismatchNote ?? 'mismatch'}` : ''}`,
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
