import type { Prisma } from '@prisma/client';

function wordFilter(word: string): Prisma.ProductVariantWhereInput {
  return {
    OR: [
      { sku: { contains: word, mode: 'insensitive' } },
      { barcode: { contains: word, mode: 'insensitive' } },
      { product: { name: { contains: word, mode: 'insensitive' } } },
      {
        supplierLinks: {
          some: { supplierSku: { contains: word, mode: 'insensitive' } },
        },
      },
    ],
  };
}

/**
 * Filtro varianti per ricerca giacenze e righe documento (SKU, barcode,
 * nome prodotto, SKU fornitore). Il termine è tokenizzato per parola: ogni
 * parola deve matchare uno dei campi ("blazer lana" trova "Blazer
 * sartoriale lana"), non serve che la stringa sia contigua.
 */
export function buildInventoryVariantSearchWhere(
  search: string,
): Prisma.ProductVariantWhereInput {
  const words = search.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 1) {
    return wordFilter(search.trim());
  }
  return { AND: words.map(wordFilter) };
}
