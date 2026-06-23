import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

/**
 * Heuristica allineata a api/src/products/catalog-origin.util.ts
 */
const SHOPIFY_LINK_AT_CREATION_TOLERANCE_MS = 15_000;

function hasLocalCatalogMedia(images) {
  return images.some(
    (image) => image.storagePath != null && String(image.storagePath).trim().length > 0,
  );
}

function wasShopifyLinkedAtProductCreation(product) {
  if (!product.shopifyLastSyncAt) {
    return false;
  }
  return (
    Math.abs(product.shopifyLastSyncAt.getTime() - product.createdAt.getTime()) <=
    SHOPIFY_LINK_AT_CREATION_TOLERANCE_MS
  );
}

function shouldBackfillShopifyCatalogOrigin(product) {
  if (product.catalogOrigin !== 'vestiflow') {
    return false;
  }
  if (product.shopifyCatalogLinkKind === 'pushed') {
    return false;
  }
  if (product.shopifyCatalogLinkKind === 'imported') {
    return true;
  }
  if (!product.shopifyProductId) {
    return false;
  }
  if (hasLocalCatalogMedia(product.images)) {
    return false;
  }
  return wasShopifyLinkedAtProductCreation(product);
}

const apply = process.argv.includes('--apply');
const tenantFilter = process.argv.find((arg) => arg.startsWith('--tenant='))?.split('=')[1]?.trim();

const prisma = new PrismaClient();

try {
  const products = await prisma.product.findMany({
    where: {
      shopifyProductId: { not: null },
      catalogOrigin: 'vestiflow',
      ...(tenantFilter ? { tenantId: tenantFilter } : {}),
    },
    select: {
      id: true,
      tenantId: true,
      name: true,
      shopifyProductId: true,
      catalogOrigin: true,
      shopifyCatalogLinkKind: true,
      createdAt: true,
      shopifyLastSyncAt: true,
      images: { select: { storagePath: true } },
    },
    orderBy: { name: 'asc' },
  });

  const candidates = products.filter(shouldBackfillShopifyCatalogOrigin);
  const keptVestiflow = products.filter((product) => !shouldBackfillShopifyCatalogOrigin(product));

  console.log(`Prodotti collegati a Shopify con catalogOrigin=vestiflow: ${products.length}`);
  console.log(`Candidati backfill → shopify (import legacy): ${candidates.length}`);
  console.log(`Restano vestiflow (push gestionale / media locale / push tardivo): ${keptVestiflow.length}`);

  if (candidates.length === 0) {
    console.log('Nessun prodotto da aggiornare.');
  } else {
    for (const product of candidates) {
      console.log(
        `  • ${product.name} (${product.id}) shopify=${product.shopifyProductId} tenant=${product.tenantId}`,
      );
    }
  }

  if (keptVestiflow.length > 0) {
    console.log('\nProdotti lasciati vestiflow (owner gestionale):');
    for (const product of keptVestiflow) {
      const localImages = product.images.filter((image) => image.storagePath).length;
      const syncDeltaMs = product.shopifyLastSyncAt
        ? Math.abs(product.shopifyLastSyncAt.getTime() - product.createdAt.getTime())
        : null;
      console.log(
        `  • ${product.name} (${product.id}) — link=${product.shopifyCatalogLinkKind ?? 'legacy'} immagini locali=${localImages} Δsync=${syncDeltaMs ?? 'n/a'}ms`,
      );
    }
  }

  if (!apply) {
    console.log('\nDry-run: nessuna modifica. Usa --apply per scrivere sul DB.');
    console.log(
      'Suggerimento: salva o sincronizza con Shopify i prodotti nati gestionale prima del backfill',
    );
    console.log('(imposta shopifyCatalogLinkKind=pushed e li esclude dal backfill).');
  } else if (candidates.length > 0) {
    const result = await prisma.product.updateMany({
      where: { id: { in: candidates.map((product) => product.id) } },
      data: {
        catalogOrigin: 'shopify',
        shopifyCatalogLinkKind: 'imported',
      },
    });
    console.log(`\nAggiornati ${result.count} prodotti → catalogOrigin=shopify, linkKind=imported`);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Errore backfill: ${message}`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
