import type { Prisma } from '@prisma/client';

/** Filtro varianti per ricerca giacenze (SKU, barcode, nome prodotto). */
export function buildInventoryVariantSearchWhere(
  search: string,
): Prisma.ProductVariantWhereInput {
  return {
    OR: [
      { sku: { contains: search, mode: 'insensitive' } },
      { barcode: { contains: search, mode: 'insensitive' } },
      { product: { name: { contains: search, mode: 'insensitive' } } },
      {
        supplierLinks: {
          some: { supplierSku: { contains: search, mode: 'insensitive' } },
        },
      },
    ],
  };
}
