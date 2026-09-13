/**
 * Per ogni riga di un ordine del collaudo: il `committed` che Shopify tiene
 * nelle location interessate, a confronto con l'impegno VestiFlow.
 *
 *   node scripts/collaudo-esegui.mjs collaudo-committed-riga.runner.cjs '#1010' 113512284455 113512546599
 *
 * Sola lettura, sul database del collaudo e verso Shopify (GraphQL
 * `inventoryLevel.quantities`).
 */
'use strict';

async function main() {
  const [numero, ...locationIds] = process.argv.slice(2);
  if (!numero || locationIds.length === 0) {
    throw new Error("indica ordine e location Shopify, es. '#1010' 113512284455 113512546599");
  }
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
    const sedi = new Map(
      (
        await prisma.location.findMany({
          where: { tenantId },
          select: { id: true, name: true, shopifyLocationId: true },
        })
      ).map((l) => [String(l.shopifyLocationId), l]),
    );
    const o = await prisma.salesOrder.findFirstOrThrow({
      where: { tenantId, orderNumber: numero },
      select: {
        id: true,
        lines: {
          select: {
            id: true,
            title: true,
            variantId: true,
          },
        },
      },
    });
    const { shopDomain, accessToken } = await app.get(ShopifyOAuthService).getAccessToken(tenantId);
    const graphql = app.get(ShopifyGraphqlClient);
    for (const l of o.lines) {
      const variante = l.variantId
        ? await prisma.productVariant.findUnique({
            where: { id: l.variantId },
            select: { shopifyInventoryItemId: true },
          })
        : null;
      const item = variante?.shopifyInventoryItemId;
      if (!item) {
        console.log(`- riga «${l.title}»: variante senza inventory item, salto`);
        continue;
      }
      const itemGid = String(item).startsWith('gid://') ? String(item) : `gid://shopify/InventoryItem/${item}`;
      const impegno = await prisma.stockReservation.findFirst({
        where: { tenantId, salesOrderLineId: l.id },
        select: { locationId: true, status: true, remainingQuantity: true },
      });
      const sedeImpegno = impegno
        ? [...sedi.values()].find((s) => s.id === impegno.locationId)?.name ?? impegno.locationId
        : null;
      console.log(
        `- riga «${l.title}» · impegno VestiFlow: ${impegno ? `${impegno.status} ${impegno.remainingQuantity} @ «${sedeImpegno}»` : 'nessuno'}`,
      );
      for (const loc of locationIds) {
        const stock = await graphql.getRemoteStockAtLocation(
          shopDomain,
          accessToken,
          itemGid,
          `gid://shopify/Location/${loc}`,
        );
        const nome = sedi.get(loc)?.name ?? '(non abbinata)';
        console.log(
          `    Shopify location ${loc} ${nome}: ${stock.found ? `on_hand ${stock.onHand} · available ${stock.available} · committed ${stock.committed}` : stock.reason}`,
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
