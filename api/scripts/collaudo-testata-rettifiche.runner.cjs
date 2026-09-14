/**
 * La TESTATA delle rettifiche dopo la migration `20260913170000_testata_rettifiche_ordine`,
 * in sola lettura: per ogni ordine con rimborsi, `refund_total_minor` (scritto) contro
 * la somma viva di `sales_order_refunds`, e `current_total_minor` (generato) contro
 * `total_minor − refund_total_minor`. Poi l'ordinamento dell'elenco per le due colonne.
 *
 *   node scripts/collaudo-esegui.mjs collaudo-testata-rettifiche.runner.cjs
 */
'use strict';

async function main() {
  const { NestFactory } = require('@nestjs/core');
  const { AppModule } = require('../dist/app.module');
  const { PrismaService } = require('../dist/prisma/prisma.service');
  const { SalesOrdersService } = require('../dist/sales-orders/sales-orders.service');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const prisma = app.get(PrismaService);
    const db = await prisma.$queryRawUnsafe('SELECT current_database() AS db');
    if (db[0]?.db !== 'vestiflow_collaudo') {
      throw new Error(`database «${db[0]?.db}», non vestiflow_collaudo`);
    }
    const eur = (m) => (m / 100).toFixed(2).replace('.', ',') + ' €';
    const righe = await prisma.$queryRawUnsafe(`
      SELECT o."order_number" AS numero, o."total_minor" AS totale,
             o."refund_total_minor" AS testata, o."current_total_minor" AS aggiornato,
             COALESCE((SELECT SUM(r."total_minor") FROM "sales_order_refunds" r WHERE r."sales_order_id" = o."id"), 0) AS viva
      FROM "sales_orders" o
      WHERE EXISTS (SELECT 1 FROM "sales_order_refunds" r WHERE r."sales_order_id" = o."id")
         OR o."refund_total_minor" <> 0
      ORDER BY o."order_number"`);
    console.log(`── TESTATA delle rettifiche: ${righe.length} ordini con rimborsi`);
    let incoerenti = 0;
    for (const r of righe) {
      const testata = Number(r.testata);
      const viva = Number(r.viva);
      const aggiornato = Number(r.aggiornato);
      const ok = testata === viva && aggiornato === Number(r.totale) - testata;
      if (!ok) incoerenti += 1;
      console.log(
        `   ${r.numero}: totale ${eur(Number(r.totale))} · testata ${eur(testata)} · somma viva ${eur(viva)} · aggiornato ${eur(aggiornato)} ${ok ? '✓' : '⛔ INCOERENTE'}`,
      );
    }
    console.log(`   incoerenze: ${incoerenti}`);

    const tenantId = (await prisma.shopifyConnection.findFirstOrThrow({ select: { tenantId: true } })).tenantId;
    const ordini = app.get(SalesOrdersService);
    for (const sort of ['refundTotal:desc', 'updatedTotal:asc']) {
      const elenco = await ordini.list(tenantId, { page: 1, pageSize: 50, sort });
      console.log(
        `── elenco ordinato per ${sort}: ${elenco.items
          .map((o) => `${o.orderNumber} (${eur(o.refundTotalMinor)} · ${eur(o.currentTotalMinor)})`)
          .join(' → ')}`,
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
