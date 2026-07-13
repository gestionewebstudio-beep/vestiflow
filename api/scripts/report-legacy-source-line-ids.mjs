#!/usr/bin/env node
/**
 * Report movimenti legacy senza sourceLineId (post-audit fase 6).
 * Uso: node scripts/report-legacy-source-line-ids.mjs
 * Richiede DATABASE_URL in .env (caricato da Prisma).
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

try {
  const rows = await prisma.stockMovement.groupBy({
    by: ['tenantId', 'sourceDocumentType'],
    where: {
      sourceDocumentId: { not: null },
      sourceLineId: null,
    },
    _count: { _all: true },
    orderBy: { tenantId: 'asc' },
  });

  if (rows.length === 0) {
    console.log('Nessun movimento legacy con sourceLineId null.');
  } else {
    console.log('Movimenti legacy (sourceLineId null) per tenant/tipo documento:');
    for (const row of rows) {
      console.log(
        `  tenant=${row.tenantId} type=${row.sourceDocumentType ?? 'n/a'} count=${row._count._all}`,
      );
    }
    console.log(
      '\nEsegui la migrazione controllata (convertLegacyMovements al prossimo salvataggio arrivo merce) o correggi manualmente.',
    );
  }
} finally {
  await prisma.$disconnect();
}
