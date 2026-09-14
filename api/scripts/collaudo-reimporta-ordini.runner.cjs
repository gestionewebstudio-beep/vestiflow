/**
 * REIMPORTA esplicitamente uno o più ordini del collaudo — per la via di sempre
 * (`ShopifySyncService.applyOrderFromShopify`, acquisizione `continua`): la
 * stessa strada del webhook, senza aspettare che ne arrivi uno.
 *
 *   node scripts/collaudo-esegui.mjs collaudo-reimporta-ordini.runner.cjs '#1010' '#1011'
 *
 * Per ogni ordine stampa PRIMA e DOPO: gli impegni per riga (sede, quantità,
 * stato), il «Da verificare», e alla fine la situazione attuale e l'esito
 * persistito del percorso (che deve restare com'era: è lo storico).
 *
 * ⚠️ Scrive sul database del collaudo (5434) ciò che scrive un webhook: righe
 *    d'ordine, impegni, `committed` delle sedi, motivi. Verso Shopify: sola
 *    lettura (l'ordine via REST, i fulfillment order via GraphQL).
 */
'use strict';

async function main() {
  const numeri = process.argv.slice(2);
  if (numeri.length === 0) {
    throw new Error("indica i numeri degli ordini, es. '#1010' '#1011'");
  }
  const { NestFactory } = require('@nestjs/core');
  const { AppModule } = require('../dist/app.module');
  const { PrismaService } = require('../dist/prisma/prisma.service');
  const { ShopifySyncService } = require('../dist/shopify/shopify-sync.service');
  const { ShopifyAdminClient } = require('../dist/shopify/shopify-admin.client');
  const { ShopifyOAuthService } = require('../dist/shopify/shopify-oauth.service');
  const { ShopifySetupService } = require('../dist/shopify/shopify-setup.service');
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
    const sedi = new Map(
      (
        await prisma.location.findMany({ where: { tenantId }, select: { id: true, name: true } })
      ).map((l) => [l.id, l.name]),
    );

    const fotografa = async (orderNumber) => {
      const o = await prisma.salesOrder.findFirst({
        where: { tenantId, orderNumber },
        select: {
          id: true,
          shopifyOrderId: true,
          requiresReview: true,
          reviewReason: true,
          lines: { select: { id: true, sku: true, quantity: true } },
        },
      });
      if (!o) {
        return null;
      }
      const impegni = await prisma.stockReservation.findMany({
        where: { tenantId, salesOrderId: o.id },
        select: { salesOrderLineId: true, locationId: true, status: true, remainingQuantity: true },
      });
      const righe = o.lines.map((l) => {
        const i = impegni.filter((x) => x.salesOrderLineId === l.id);
        const testo = i.length
          ? i
              .map(
                (x) =>
                  `${x.status} ${x.remainingQuantity} @ ${sedi.get(x.locationId) ?? x.locationId}`,
              )
              .join(' + ')
          : 'nessun impegno';
        return `${l.sku} ×${l.quantity}: ${testo}`;
      });
      return {
        ...o,
        riassunto: `daVerificare=${o.requiresReview} «${(o.reviewReason ?? '').slice(0, 90)}» · ${righe.join(' | ')}`,
      };
    };

    const esitoPrima = await prisma.shopifySetup.findFirst({
      select: { esito: true, activatedAt: true },
    });
    const esclusiPrima = esitoPrima?.esito?.esclusi?.length ?? null;

    const { shopDomain, accessToken } = await app.get(ShopifyOAuthService).getAccessToken(tenantId);
    const admin = app.get(ShopifyAdminClient);
    const sync = app.get(ShopifySyncService);
    for (const numero of numeri) {
      const prima = await fotografa(numero);
      if (!prima) {
        console.log(`- ${numero}: non presente in VestiFlow, salto`);
        continue;
      }
      console.log(`- ${numero} PRIMA: ${prima.riassunto}`);
      const ordine = await admin.getOrder(
        shopDomain,
        accessToken,
        legacyIdFromGid(String(prima.shopifyOrderId)),
      );
      if (!ordine) {
        console.log(`- ${numero}: Shopify non lo restituisce, salto`);
        continue;
      }
      const esito = await sync.applyOrderFromShopify(tenantId, ordine, 'continua');
      const dopo = await fotografa(numero);
      console.log(`- ${numero} DOPO (${esito}): ${dopo?.riassunto}`);
    }

    const stato = await app.get(ShopifySetupService).stato(tenantId);
    const perCausa = new Map();
    for (const p of stato.situazione.problemi) {
      perCausa.set(p.causa, (perCausa.get(p.causa) ?? 0) + 1);
    }
    console.log(
      `- situazione attuale: ${stato.situazione.problemi.length} problemi · ${[...perCausa].map(([c, n]) => `${n}×${c}`).join(' · ')}`,
    );
    const esitoDopo = await prisma.shopifySetup.findFirst({
      select: { esito: true, activatedAt: true },
    });
    console.log(
      `- storico del tentativo precedente: esclusi persistiti ${esclusiPrima} → ${esitoDopo?.esito?.esclusi?.length ?? null} · attivazione ${esitoDopo?.activatedAt?.toISOString()} (deve restare com'era)`,
    );
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error('Fermo:', e.message);
  process.exit(1);
});
