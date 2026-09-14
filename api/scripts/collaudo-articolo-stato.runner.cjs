/**
 * Un ARTICOLO sui due lati, in sola lettura: stato e date su Shopify (REST
 * `products/{id}`: status, created_at, updated_at, published_at) e in VestiFlow
 * (status, cestino, stato di sync, ultimo sync, ultimo errore). Serve a rispondere
 * a «chi l'ha messo così?» senza presumere.
 *
 *   node scripts/collaudo-esegui.mjs collaudo-articolo-stato.runner.cjs 'The Archived Snowboard'
 *
 * Non scrive nulla.
 */
'use strict';

async function main() {
  const [nome] = process.argv.slice(2);
  if (!nome) {
    throw new Error("indica il nome (o parte) dell'articolo, es. 'The Archived Snowboard'");
  }
  const { NestFactory } = require('@nestjs/core');
  const { AppModule } = require('../dist/app.module');
  const { PrismaService } = require('../dist/prisma/prisma.service');
  const { ShopifyOAuthService } = require('../dist/shopify/shopify-oauth.service');
  const { ShopifyAdminHttpClient } = require('../dist/shopify/shopify-admin-http.client');
  const { legacyIdFromGid } = require('../dist/shopify/shopify-money.util');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const prisma = app.get(PrismaService);
    const db = await prisma.$queryRawUnsafe('SELECT current_database() AS db');
    if (db[0]?.db !== 'vestiflow_collaudo') {
      throw new Error(`database «${db[0]?.db}», non vestiflow_collaudo`);
    }
    const conn = await prisma.shopifyConnection.findFirstOrThrow({ select: { tenantId: true } });
    const tenantId = conn.tenantId;
    const prodotti = await prisma.product.findMany({
      where: { tenantId, name: { contains: nome, mode: 'insensitive' } },
      select: {
        name: true,
        status: true,
        deletedAt: true,
        shopifyProductId: true,
        shopifySyncStatus: true,
        shopifyLastSyncAt: true,
        shopifyLastError: true,
        shopifyCatalogLinkKind: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (prodotti.length === 0) {
      throw new Error(`nessun articolo VestiFlow con nome «${nome}»`);
    }
    const ora = (d) => (d ? new Date(d).toISOString().slice(0, 19).replace('T', ' ') : '—');
    const { shopDomain, accessToken } = await app.get(ShopifyOAuthService).getAccessToken(tenantId);
    const http = app.get(ShopifyAdminHttpClient);
    for (const p of prodotti) {
      console.log(
        `- VestiFlow «${p.name}»: status ${p.status} · cestino ${p.deletedAt ? ora(p.deletedAt) : 'no'} · collegamento ${p.shopifyCatalogLinkKind ?? '—'} · sync ${p.shopifySyncStatus} · ultimo sync ${ora(p.shopifyLastSyncAt)} · creato ${ora(p.createdAt)} · aggiornato ${ora(p.updatedAt)}${p.shopifyLastError ? ` · ultimo errore «${p.shopifyLastError}»` : ''}`,
      );
      if (!p.shopifyProductId) {
        console.log('    Shopify: non collegato');
        continue;
      }
      const id = legacyIdFromGid(String(p.shopifyProductId));
      const risposta = await http.request(shopDomain, accessToken, `/products/${id}.json`);
      const r = risposta?.product;
      if (!r) {
        console.log(`    Shopify: prodotto ${id} non restituito`);
        continue;
      }
      console.log(
        `    Shopify ${id}: status ${r.status} · creato ${r.created_at} · aggiornato ${r.updated_at} · pubblicato ${r.published_at ?? '—'} · varianti ${(r.variants ?? []).length}`,
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
