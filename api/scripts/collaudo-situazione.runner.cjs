/**
 * Il runner di `collaudo-situazione.mjs`: contesto Nest compilato, ambiente del
 * collaudo già composto dal chiamante. Legge la SITUAZIONE ATTUALE come la
 * calcola l'API (`ShopifySetupService.stato`) e la stampa per causa. Sola
 * lettura: `stato()` non scrive niente. Non si lancia da solo.
 */
'use strict';

async function main() {
  const { NestFactory } = require('@nestjs/core');
  const { AppModule } = require('../dist/app.module');
  const { PrismaService } = require('../dist/prisma/prisma.service');
  const { ShopifySetupService } = require('../dist/shopify/shopify-setup.service');

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
    const stato = await app.get(ShopifySetupService).stato(conn.tenantId);
    const problemi = stato.situazione.problemi;
    console.log(
      `- ${conn.shopDomain} · percorso ${stato.status} · situazione letta alle ${stato.situazione.calcolataAt}`,
    );
    console.log(`- problemi aperti: ${problemi.length}`);
    const perCausa = new Map();
    for (const p of problemi) {
      const voce = perCausa.get(p.causa) ?? { n: 0, esempi: [], azione: p.azione.etichetta };
      voce.n += 1;
      if (voce.esempi.length < 3) voce.esempi.push(p.nome);
      perCausa.set(p.causa, voce);
    }
    for (const [causa, voce] of perCausa) {
      console.log(`  ${String(voce.n).padStart(3)} × ${causa} — ${voce.esempi.join(', ')}`);
      console.log(`        azione: ${voce.azione.slice(0, 110)}`);
    }
    const rilevati = problemi.filter((p) => p.rilevatoAt).map((p) => p.rilevatoAt);
    console.log(
      `- con data di rilevazione: ${rilevati.length} (più vecchia ${rilevati.sort()[0] ?? '—'})`,
    );
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error('Fermo:', e.message);
  process.exit(1);
});
