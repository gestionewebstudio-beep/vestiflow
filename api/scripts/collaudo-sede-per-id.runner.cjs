/**
 * La SEDE di un ordine identificata per ID, non per nome: la sede VestiFlow
 * abbinata alla location Shopify, l'id che portano gli impegni dell'ordine, quello
 * della sua spedizione e della Vendita online — devono essere lo STESSO uuid.
 *
 *   node scripts/collaudo-esegui.mjs collaudo-sede-per-id.runner.cjs '#1012'
 *
 * Sola lettura sul database del collaudo.
 */
'use strict';

async function main() {
  const [numero] = process.argv.slice(2);
  if (!numero) {
    throw new Error("indica l'ordine, es. '#1012'");
  }
  const { NestFactory } = require('@nestjs/core');
  const { AppModule } = require('../dist/app.module');
  const { PrismaService } = require('../dist/prisma/prisma.service');
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
      where: { tenantId },
      select: { id: true, name: true, code: true, shopifyLocationId: true },
      orderBy: { name: 'asc' },
    });
    console.log('- sedi VestiFlow del tenant (id · nome · codice · location Shopify):');
    for (const s of sedi) {
      console.log(`    ${s.id} · «${s.name}» · ${s.code ?? '—'} · ${s.shopifyLocationId ?? '—'}`);
    }
    const coppie = await prisma.shopifyLocationPair.findMany({
      where: { tenantId },
      select: {
        locationId: true,
        shopifyLocationGid: true,
        periodi: { select: { status: true }, orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
    console.log('- coppie location Shopify ↔ sede (dallo storico):');
    for (const c of coppie) {
      console.log(`    ${c.shopifyLocationGid} → ${c.locationId} · ultimo periodo ${c.periodi[0]?.status ?? '—'}`);
    }
    const o = await prisma.salesOrder.findFirstOrThrow({
      where: { tenantId, orderNumber: numero },
      select: { id: true },
    });
    const impegni = await prisma.stockReservation.findMany({
      where: { tenantId, salesOrderId: o.id },
      select: { locationId: true, status: true },
    });
    const spedizioni = await prisma.salesOrderShipment.findMany({
      where: { tenantId, salesOrderId: o.id },
      select: { locationId: true, shopifyLocationId: true },
    });
    const vendita = await prisma.onlineSale.findUnique({
      where: { salesOrderId: o.id },
      select: { locationId: true, lines: { select: { locationId: true } } },
    });
    const movimenti = await prisma.stockMovement.findMany({
      where: { tenantId, sourceDocumentType: 'online_sale', sourceDocumentId: vendita ? undefined : '-' },
      select: { locationId: true },
      take: 0,
    });
    void movimenti;
    console.log(`- ${numero}:`);
    console.log(`    impegni → ${impegni.map((i) => `${i.locationId} (${i.status})`).join(', ') || 'nessuno'}`);
    console.log(
      `    spedizioni → ${spedizioni.map((s) => `${s.locationId} (location Shopify ${s.shopifyLocationId})`).join(', ') || 'nessuna'}`,
    );
    console.log(
      `    Vendita online → testata ${vendita?.locationId ?? '—'} · righe ${vendita?.lines.map((l) => l.locationId).join(', ') ?? '—'}`,
    );
    const ids = new Set([
      ...impegni.map((i) => i.locationId),
      ...spedizioni.map((s) => s.locationId),
      ...(vendita ? [vendita.locationId, ...vendita.lines.map((l) => l.locationId)] : []),
    ]);
    console.log(`- id distinti fra impegni, spedizioni e Vendita: ${ids.size} → ${[...ids].join(', ')}`);
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error('Fermo:', e.message);
  process.exit(1);
});
