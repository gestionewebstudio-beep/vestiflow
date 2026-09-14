/**
 * Prova 2 del collaudo (`docs/28` §3): una VENDITA NUOVA fatta sul negozio. Che cosa
 * ha ricevuto e fatto VestiFlow dopo un istante dato, misurato sul database del
 * collaudo e riletto su Shopify.
 *
 *   node scripts/collaudo-esegui.mjs collaudo-vendita-nuova.runner.cjs '2026-09-13T12:00:00Z' [113512284455]
 *
 * Stampa: l'ultimo evento webhook ricevuto dalla connessione; gli ordini nati o
 * aggiornati dopo l'istante, con righe, impegni (stato, residuo, sede) e «Da
 * verificare»; gli eventi canonici (uno per chiave: un webhook ripetuto non ne
 * lascia un secondo); per ogni variante coinvolta la giacenza VestiFlow per sede e
 * i livelli Shopify nella location data (on_hand · available · committed); i
 * movimenti nati dopo l'istante (attesi 0: un impegno non è un movimento); la
 * situazione. Sola lettura sul database; verso Shopify sola lettura (GraphQL).
 */
'use strict';

async function main() {
  const [daIso, locationShopify = '113512284455'] = process.argv.slice(2);
  if (!daIso) {
    throw new Error("indica l'istante da cui leggere, es. '2026-09-13T12:00:00Z'");
  }
  const da = new Date(daIso);
  if (Number.isNaN(da.getTime())) {
    throw new Error(`istante non valido: ${daIso}`);
  }
  const { NestFactory } = require('@nestjs/core');
  const { AppModule } = require('../dist/app.module');
  const { PrismaService } = require('../dist/prisma/prisma.service');
  const { ShopifyGraphqlClient } = require('../dist/shopify/shopify-graphql.client');
  const { ShopifyOAuthService } = require('../dist/shopify/shopify-oauth.service');
  const { ShopifySetupService } = require('../dist/shopify/shopify-setup.service');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const prisma = app.get(PrismaService);
    const db = await prisma.$queryRawUnsafe('SELECT current_database() AS db');
    if (db[0]?.db !== 'vestiflow_collaudo') {
      throw new Error(`database «${db[0]?.db}», non vestiflow_collaudo`);
    }
    const conn = await prisma.shopifyConnection.findFirstOrThrow({
      select: { tenantId: true, lastWebhookEventAt: true, lastSyncAt: true, shopDomain: true },
    });
    const tenantId = conn.tenantId;
    const ora = (d) => (d ? d.toISOString().slice(0, 19).replace('T', ' ') : '—');
    console.log(
      `- connessione ${conn.shopDomain}: ultimo webhook ${ora(conn.lastWebhookEventAt)} · ultimo sync ${ora(conn.lastSyncAt)} (ora ${ora(new Date())})`,
    );
    const sedi = new Map(
      (
        await prisma.location.findMany({
          where: { tenantId },
          select: { id: true, name: true, shopifyLocationId: true },
        })
      ).map((l) => [l.id, l]),
    );

    // ── gli ordini toccati dopo l'istante ──
    const ordini = await prisma.salesOrder.findMany({
      where: { tenantId, updatedAt: { gte: da } },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        orderNumber: true,
        source: true,
        shopifyOrderId: true,
        financialStatus: true,
        fulfillmentStatus: true,
        requiresReview: true,
        reviewReason: true,
        cancelledAt: true,
        createdAt: true,
        updatedAt: true,
        lines: {
          select: { id: true, title: true, sku: true, quantity: true, variantId: true },
        },
      },
    });
    console.log(`- ordini nati o aggiornati dopo ${daIso}: ${ordini.length}`);
    const varianti = new Map();
    for (const o of ordini) {
      const nuovo = o.createdAt >= da ? 'NUOVO' : 'aggiornato';
      console.log(
        `  ${o.orderNumber} (${nuovo}, ${o.source}, shopify ${o.shopifyOrderId ?? '—'}) · pagamento ${o.financialStatus} · evasione ${o.fulfillmentStatus}${o.cancelledAt ? ` · ANNULLATO ${ora(o.cancelledAt)}` : ''} · nato ${ora(o.createdAt)} · daVerificare=${o.requiresReview}${o.reviewReason ? ` «${o.reviewReason}»` : ''}`,
      );
      const eventi = await prisma.onlineOrderEvent.findMany({
        where: { tenantId, salesOrderId: o.id },
        select: { type: true, dedupeKey: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      });
      for (const e of eventi) {
        const dopo = e.createdAt >= da ? '★' : ' ';
        console.log(`    ${dopo} evento ${ora(e.createdAt)} ${e.type} · ${e.dedupeKey}`);
      }
      const impegni = await prisma.stockReservation.findMany({
        where: { tenantId, salesOrderId: o.id },
        select: {
          salesOrderLineId: true,
          locationId: true,
          status: true,
          quantity: true,
          remainingQuantity: true,
          createdAt: true,
        },
      });
      for (const l of o.lines) {
        const suoi = impegni.filter((i) => i.salesOrderLineId === l.id);
        console.log(
          `    riga «${l.title}» sku ${l.sku} ×${l.quantity}: impegni ${suoi.length ? suoi.map((i) => `${i.status} ${i.remainingQuantity}/${i.quantity} @ «${sedi.get(i.locationId)?.name ?? i.locationId}» (${ora(i.createdAt)})`).join(' + ') : 'NESSUNO'}`,
        );
        if (l.variantId) {
          varianti.set(l.variantId, l.title);
        }
      }
    }

    // ── giacenze VestiFlow e livelli Shopify delle varianti coinvolte ──
    const { shopDomain, accessToken } = await app.get(ShopifyOAuthService).getAccessToken(tenantId);
    const graphql = app.get(ShopifyGraphqlClient);
    for (const [variantId, titolo] of varianti) {
      const v = await prisma.productVariant.findUnique({
        where: { id: variantId },
        select: { sku: true, shopifyInventoryItemId: true },
      });
      const livelli = await prisma.inventoryLevel.findMany({
        where: { variantId },
        select: { locationId: true, onHand: true, available: true, committed: true },
      });
      console.log(`- variante «${titolo}» (${v?.sku ?? '?'}):`);
      for (const lv of livelli) {
        console.log(
          `    VestiFlow «${sedi.get(lv.locationId)?.name ?? lv.locationId}»: on_hand ${lv.onHand} · impegnati ${lv.committed} · disponibile ${lv.available}`,
        );
      }
      const item = v?.shopifyInventoryItemId;
      if (!item) {
        console.log('    Shopify: variante senza inventory item');
        continue;
      }
      const itemGid = String(item).startsWith('gid://')
        ? String(item)
        : `gid://shopify/InventoryItem/${item}`;
      const stock = await graphql.getRemoteStockAtLocation(
        shopDomain,
        accessToken,
        itemGid,
        `gid://shopify/Location/${locationShopify}`,
      );
      const nomeLoc =
        [...sedi.values()].find((s) => String(s.shopifyLocationId) === String(locationShopify))
          ?.name ?? '(non abbinata)';
      console.log(
        `    Shopify location ${locationShopify} ${nomeLoc}: ${stock.found ? `on_hand ${stock.onHand} · available ${stock.available} · committed ${stock.committed}` : stock.reason}`,
      );
    }

    // ── i movimenti e le Vendite online: alla vendita nessuno, alla spedizione UNO per riga ──
    const movimenti = await prisma.stockMovement.findMany({
      where: { tenantId, createdAt: { gte: da } },
      orderBy: { createdAt: 'asc' },
      select: {
        type: true,
        quantity: true,
        sku: true,
        locationId: true,
        sourceDocumentType: true,
        sourceLineId: true,
        createdAt: true,
      },
    });
    console.log(
      `- movimenti di magazzino nati dopo ${daIso}: ${movimenti.length} (alla vendita 0: un impegno non è un movimento; alla spedizione 1 per riga)`,
    );
    for (const m of movimenti) {
      console.log(
        `    ${ora(m.createdAt)} ${m.type} ${m.quantity} sku ${m.sku} @ «${sedi.get(m.locationId)?.name ?? m.locationId}» · origine ${m.sourceDocumentType ?? '—'} riga ${m.sourceLineId ?? '—'}`,
      );
    }
    for (const o of ordini) {
      const spedizioni = await prisma.salesOrderShipment.findMany({
        where: { tenantId, salesOrderId: o.id },
        select: {
          externalFulfillmentId: true,
          shopifyLocationId: true,
          locationId: true,
          shippedAt: true,
        },
      });
      for (const sp of spedizioni) {
        console.log(
          `- spedizione di ${o.orderNumber}: fulfillment ${sp.externalFulfillmentId} · location Shopify ${sp.shopifyLocationId ?? '—'} → sede «${sedi.get(sp.locationId)?.name ?? sp.locationId ?? '—'}» · spedita ${ora(sp.shippedAt)}`,
        );
      }
      const vendita = await prisma.onlineSale.findUnique({
        where: { salesOrderId: o.id },
        select: {
          orderNumber: true,
          reference: true,
          inventoryStatus: true,
          fulfilledAt: true,
          locationId: true,
          totalMinor: true,
          lines: { select: { quantity: true, sku: true, locationId: true } },
        },
      });
      console.log(
        `- Vendita online di ${o.orderNumber}: ${vendita ? `${vendita.reference} · ${vendita.inventoryStatus} · evasa ${ora(vendita.fulfilledAt)} · sede di testata «${sedi.get(vendita.locationId)?.name ?? vendita.locationId ?? '—'}» · totale ${(vendita.totalMinor / 100).toFixed(2)} · righe ${vendita.lines.map((l) => `${l.sku}×${l.quantity} @ «${sedi.get(l.locationId)?.name ?? l.locationId ?? '—'}»`).join(', ')}` : 'NESSUNA'}`,
      );
    }

    const stato = await app.get(ShopifySetupService).stato(tenantId);
    const perCausa = new Map();
    for (const p of stato.situazione.problemi) {
      perCausa.set(p.causa, (perCausa.get(p.causa) ?? 0) + 1);
    }
    console.log(
      `- situazione: ${stato.situazione.problemi.length} problemi · ${[...perCausa].map(([c, n]) => `${n}×${c}`).join(' · ')}`,
    );
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error('Fermo:', e.message);
  process.exit(1);
});
