import 'dotenv/config';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const apply = process.argv.includes('--apply');
const tenantFilter = process.argv.find((arg) => arg.startsWith('--tenant='))?.split('=')[1]?.trim();

async function main() {
  const { NestFactory } = require('@nestjs/core');
  const { AppModule } = require('../dist/app.module');
  const { ShopifyOrderDocumentService } = require('../dist/shopify/shopify-order-document.service');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: apply ? ['error', 'warn', 'log'] : ['error', 'warn'],
  });

  try {
    const service = app.get(ShopifyOrderDocumentService);

    const dryRunResult = await service.backfillUnlinkedOrders({
      tenantId: tenantFilter,
      dryRun: true,
    });

    console.log(
      `Ordini Shopify senza documento collegato: ${dryRunResult.candidates}` +
        (tenantFilter ? ` (tenant ${tenantFilter})` : ''),
    );

    if (dryRunResult.candidates === 0) {
      console.log('Nessun ordine da backfill.');
      return;
    }

    if (!apply) {
      console.log('\nDry-run: nessuna modifica. Usa --apply per creare i DDT vendita collegati.');
      console.log('Opzionale: --tenant=<uuid> per limitare a un tenant.');
      console.log('Prerequisito: npm run build (lo script usa i moduli compilati in dist/).');
      return;
    }

    const result = await service.backfillUnlinkedOrders({
      tenantId: tenantFilter,
      dryRun: false,
    });

    console.log(`\nBackfill completato:`);
    console.log(`  • Documenti creati/collegati: ${result.linked}`);
    console.log(`  • Saltati (DDT disabilitato, righe vuote, sede assente): ${result.skipped}`);
    console.log(`  • Errori: ${result.failed.length}`);

    if (result.failed.length > 0) {
      for (const failure of result.failed) {
        console.log(`    - ${failure.orderNumber} (${failure.orderId}): ${failure.message}`);
      }
    }
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Errore backfill ordini Shopify: ${message}`);
  if (message.includes('Cannot find module') && message.includes('dist/')) {
    console.error('Esegui prima: npm run build');
  }
  process.exitCode = 1;
});
