/**
 * Dopo uno SPOSTAMENTO di sede fatto sul negozio: che cosa ha ricevuto e fatto
 * VestiFlow, misurato sul database del collaudo.
 *
 *   node scripts/collaudo-esegui.mjs collaudo-ordine-spostato.runner.cjs '#1010' '2026-09-13T07:40:00Z'
 *
 * Stampa: gli eventi canonici dell'ordine nati dopo l'istante dato (il webhook
 * lascia un evento con la sua chiave), le righe con gli impegni e la sede
 * letta ORA dai fulfillment order, «Da verificare» e motivo, la situazione,
 * i movimenti nati dopo l'istante. Sola lettura sul database; verso Shopify
 * sola lettura (fulfillment order via GraphQL).
 */
'use strict';

async function main() {
  const [numero, daIso] = process.argv.slice(2);
  if (!numero || !daIso) {
    throw new Error("indica ordine e istante, es. '#1010' '2026-09-13T07:40:00Z'");
  }
  const da = new Date(daIso);
  const { NestFactory } = require('@nestjs/core');
  const { AppModule } = require('../dist/app.module');
  const { PrismaService } = require('../dist/prisma/prisma.service');
  const { ShopifySetupService } = require('../dist/shopify/shopify-setup.service');
  const {
    ShopifyFulfillmentOrdersService,
  } = require('../dist/shopify/shopify-fulfillment-orders.service');

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
        await prisma.location.findMany({ where: { tenantId }, select: { id: true, name: true } })
      ).map((l) => [l.id, l.name]),
    );
    const o = await prisma.salesOrder.findFirstOrThrow({
      where: { tenantId, orderNumber: numero },
      select: {
        id: true,
        shopifyOrderId: true,
        requiresReview: true,
        reviewReason: true,
        updatedAt: true,
        lines: {
          select: {
            id: true,
            externalLineId: true,
            sku: true,
            quantity: true,
            title: true,
          },
        },
      },
    });
    const eventi = await prisma.onlineOrderEvent.findMany({
      where: { tenantId, salesOrderId: o.id, createdAt: { gte: da } },
      select: { type: true, dedupeKey: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
    console.log(`- eventi canonici di ${numero} dopo ${daIso}: ${eventi.length}`);
    for (const e of eventi) {
      console.log(`  ${e.createdAt.toISOString().slice(11, 19)} ${e.type} · ${e.dedupeKey}`);
    }
    console.log(
      `- ${numero}: aggiornato ${o.updatedAt.toISOString().slice(11, 19)} · daVerificare=${o.requiresReview} · motivo «${o.reviewReason ?? ''}»`,
    );
    const fo = app.get(ShopifyFulfillmentOrdersService);
    const letturaOra = await fo.sediDelleRighe(
      tenantId,
      String(o.shopifyOrderId),
      o.lines.map((l) => ({ salesOrderLineId: l.id, externalLineId: l.externalLineId })),
    );
    const impegni = await prisma.stockReservation.findMany({
      where: { tenantId, salesOrderId: o.id },
      select: { salesOrderLineId: true, locationId: true, status: true, remainingQuantity: true },
    });
    for (const l of o.lines) {
      const i = impegni.filter((x) => x.salesOrderLineId === l.id);
      const s = letturaOra.get(l.id);
      const letta = !s
        ? '?'
        : 'locationId' in s
          ? `sede «${sedi.get(s.locationId) ?? s.locationId}»`
          : 'evasa' in s
            ? 'evasa'
            : `IRRISOLTA (${s.motivo.tipo}${s.motivo.locationId ? ` location ${s.motivo.locationId}` : ''})`;
      console.log(
        `  riga «${l.title}» ×${l.quantity}: impegni ${i.length ? i.map((x) => `${x.status} ${x.remainingQuantity} @ «${sedi.get(x.locationId) ?? x.locationId}»`).join(' + ') : 'NESSUNO'} · FO ora → ${letta}`,
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
    for (const p of stato.situazione.problemi.filter((x) => x.tipo.startsWith('ordine'))) {
      console.log(`  ${p.tipo} · ${p.nome} · causa ${p.causa} · azione ${p.azione.tipo} «${p.azione.etichetta}» · «${p.dettaglio ?? ''}»`);
    }
    const mov = await prisma.stockMovement.count({ where: { tenantId, createdAt: { gte: da } } });
    console.log(`- movimenti di magazzino nati dopo ${daIso}: ${mov} (attesi 0)`);
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error('Fermo:', e.message);
  process.exit(1);
});
