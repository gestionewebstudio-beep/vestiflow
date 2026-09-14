/**
 * Quali articoli si prestano a una prova di VENDITA sul negozio: le varianti
 * collegate con giacenza VestiFlow positiva nella sede abbinata, e i livelli che
 * Shopify tiene nella location abbinata (on_hand · available · committed).
 *
 *   node scripts/collaudo-esegui.mjs collaudo-articoli-vendibili.runner.cjs [quante=8]
 *
 * Sola lettura sul database del collaudo e verso Shopify (GraphQL).
 */
'use strict';

async function main() {
  const quante = Number(process.argv[2] ?? 8);
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
    const sedi = await prisma.location.findMany({
      where: { tenantId, shopifyLocationId: { not: null } },
      select: { id: true, name: true, shopifyLocationId: true },
    });
    if (sedi.length === 0) {
      throw new Error('nessuna sede abbinata a una location Shopify');
    }
    const { shopDomain, accessToken } = await app.get(ShopifyOAuthService).getAccessToken(tenantId);
    const graphql = app.get(ShopifyGraphqlClient);
    for (const sede of sedi) {
      const livelli = await prisma.inventoryLevel.findMany({
        where: {
          locationId: sede.id,
          available: { gt: 0 },
          variant: { shopifyInventoryItemId: { not: null } },
        },
        orderBy: { available: 'desc' },
        take: quante,
        select: {
          onHand: true,
          available: true,
          committed: true,
          variant: {
            select: {
              sku: true,
              shopifyInventoryItemId: true,
              product: { select: { name: true } },
              optionValues: true,
            },
          },
        },
      });
      console.log(
        `- sede «${sede.name}» ↔ location Shopify ${sede.shopifyLocationId}: ${livelli.length} varianti con disponibile > 0 (le prime ${quante})`,
      );
      for (const lv of livelli) {
        const item = String(lv.variant.shopifyInventoryItemId);
        const itemGid = item.startsWith('gid://') ? item : `gid://shopify/InventoryItem/${item}`;
        const stock = await graphql.getRemoteStockAtLocation(
          shopDomain,
          accessToken,
          itemGid,
          `gid://shopify/Location/${sede.shopifyLocationId}`,
        );
        // `optionValues` è un elenco `{ name, value }` (semantica Shopify).
        const opzioni = Array.isArray(lv.variant.optionValues)
          ? lv.variant.optionValues
              .map((o) => (o && typeof o === 'object' && 'value' in o ? String(o.value) : ''))
              .filter(Boolean)
              .join(' · ')
          : '';
        console.log(
          `  «${lv.variant.product.name}»${opzioni ? ` ${opzioni}` : ''} sku ${lv.variant.sku}: VestiFlow on_hand ${lv.onHand} · impegnati ${lv.committed} · disponibile ${lv.available} | Shopify ${stock.found ? `on_hand ${stock.onHand} · available ${stock.available} · committed ${stock.committed}` : stock.reason}`,
        );
      }
    }
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error('Fermo:', e.message);
  process.exit(1);
});
