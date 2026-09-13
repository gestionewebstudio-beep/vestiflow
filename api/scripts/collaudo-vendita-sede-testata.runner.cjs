/**
 * Rimedio UNA TANTUM per le Vendite online del collaudo nate SENZA sede di
 * testata (difetto della prova 3, 13/09/2026: la location di testata dell'ordine
 * vinceva su quella dell'evasione, e non era abbinata). La sede di testata
 * diventa quella delle righe, se è UNA sola; altrimenti si lascia com'è e lo si
 * dice. Stampa prima e dopo.
 *
 *   node scripts/collaudo-esegui.mjs collaudo-vendita-sede-testata.runner.cjs            (solo lettura)
 *   node scripts/collaudo-esegui.mjs collaudo-vendita-sede-testata.runner.cjs --applica  (scrive)
 *
 * ⚠️ Scrive SOLO con `--applica`, solo `locationId` delle vendite che lo hanno nullo,
 *    solo sul database del collaudo (5434).
 */
'use strict';

async function main() {
  const applica = process.argv.includes('--applica');
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
    const sedi = new Map(
      (
        await prisma.location.findMany({ where: { tenantId }, select: { id: true, name: true } })
      ).map((l) => [l.id, l.name]),
    );
    const senzaSede = await prisma.onlineSale.findMany({
      where: { tenantId, locationId: null },
      select: {
        id: true,
        reference: true,
        orderNumber: true,
        lines: { select: { locationId: true } },
      },
    });
    console.log(`- Vendite online senza sede di testata: ${senzaSede.length}`);
    for (const v of senzaSede) {
      const sediRighe = [...new Set(v.lines.map((l) => l.locationId).filter(Boolean))];
      if (sediRighe.length !== 1) {
        console.log(
          `  ${v.reference} (${v.orderNumber}): righe su ${sediRighe.length} sedi — si lascia com'è`,
        );
        continue;
      }
      const sede = sediRighe[0];
      console.log(
        `  ${v.reference} (${v.orderNumber}): sede delle righe «${sedi.get(sede) ?? sede}» → ${applica ? 'SCRITTA in testata' : 'da scrivere (con --applica)'}`,
      );
      if (applica) {
        await prisma.onlineSale.update({
          where: { id: v.id },
          data: { locationId: sede },
        });
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
