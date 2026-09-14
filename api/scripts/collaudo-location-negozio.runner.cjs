/**
 * Le LOCATION del negozio di collaudo come stanno su Shopify, e a quale sede
 * VestiFlow è abbinata ciascuna — per sapere che prova di spostamento è
 * possibile prima di chiederla al titolare.
 *
 *   node scripts/collaudo-esegui.mjs collaudo-location-negozio.runner.cjs
 *
 * Sola lettura, sul database del collaudo e verso Shopify (REST `locations`).
 */
'use strict';

async function main() {
  const { NestFactory } = require('@nestjs/core');
  const { AppModule } = require('../dist/app.module');
  const { PrismaService } = require('../dist/prisma/prisma.service');
  const { ShopifyAdminClient } = require('../dist/shopify/shopify-admin.client');
  const { ShopifyOAuthService } = require('../dist/shopify/shopify-oauth.service');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const prisma = app.get(PrismaService);
    const db = await prisma.$queryRawUnsafe('SELECT current_database() AS db');
    if (db[0]?.db !== 'vestiflow_collaudo') {
      throw new Error(`database «${db[0]?.db}», non vestiflow_collaudo`);
    }
    const conn = await prisma.shopifyConnection.findFirstOrThrow({ select: { tenantId: true } });
    const sedi = await prisma.location.findMany({
      where: { tenantId: conn.tenantId },
      select: { id: true, name: true, shopifyLocationId: true },
    });
    const { shopDomain, accessToken } = await app
      .get(ShopifyOAuthService)
      .getAccessToken(conn.tenantId);
    const locations = await app.get(ShopifyAdminClient).listLocations(shopDomain, accessToken);
    for (const l of locations) {
      const sede = sedi.find((s) => String(s.shopifyLocationId) === String(l.id));
      console.log(
        `- location ${l.id} «${l.name}» · attiva=${l.active} · sede VestiFlow: ${sede ? `«${sede.name}»` : 'NESSUNA (non abbinata)'}`,
      );
    }
    console.log(`- ${locations.length} location sul negozio · ${sedi.length} sedi VestiFlow`);
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error('Fermo:', e.message);
  process.exit(1);
});
