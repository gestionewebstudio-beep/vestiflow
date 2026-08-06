import type { PrismaClient, Prisma } from '@prisma/client';

type ShopifyImageRow = {
  readonly id: number;
  readonly src: string;
  readonly alt: string | null;
  readonly position: number;
};

/** Importa metadati immagine da Shopify senza re-upload (URL CDN). */
export async function syncProductImagesFromShopify(
  prisma: PrismaClient | Prisma.TransactionClient,
  tenantId: string,
  productId: string,
  images: readonly ShopifyImageRow[],
): Promise<void> {
  if (images.length === 0) {
    return;
  }

  const existing = await prisma.productImage.findMany({
    where: { productId, tenantId },
    select: { shopifyImageId: true },
  });
  const existingShopifyIds = new Set(
    existing.map((row) => row.shopifyImageId).filter((id): id is string => id != null),
  );

  for (const image of images) {
    const shopifyImageId = String(image.id);
    if (existingShopifyIds.has(shopifyImageId)) {
      continue;
    }
    await prisma.productImage.create({
      data: {
        tenantId,
        productId,
        url: image.src,
        altText: image.alt,
        sortOrder: image.position,
        shopifyImageId,
      },
    });
  }
}
