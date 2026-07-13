import type { Prisma, PrismaClient } from '@prisma/client';

import { shopifyGid } from './shopify-money.util';

type PrismaReader = PrismaClient | Prisma.TransactionClient;

/** Estrae l'id numerico location da payload ordine Shopify (REST). */
export function extractShopifyOrderLocationId(
  order: Record<string, unknown>,
): string | null {
  const direct = order.location_id;
  if (direct != null && String(direct).trim() !== '') {
    return shopifyGid('Location', String(direct));
  }

  const fulfillments = order.fulfillments as Record<string, unknown>[] | undefined;
  if (fulfillments?.length) {
    for (const fulfillment of fulfillments) {
      const locId = fulfillment.location_id;
      if (locId != null && String(locId).trim() !== '') {
        return shopifyGid('Location', String(locId));
      }
    }
  }

  return null;
}

/**
 * Risolve la location VestiFlow di un ordine Shopify: mapping esplicito dal
 * payload, altrimenti prima sede licenziata attiva del tenant. Null se il
 * tenant non ha sedi utilizzabili.
 */
export async function resolveShopifyOrderLocationId(
  prisma: PrismaReader,
  tenantId: string,
  orderPayload: Record<string, unknown>,
): Promise<string | null> {
  const shopifyLocationId = extractShopifyOrderLocationId(orderPayload);
  if (shopifyLocationId) {
    const mapped = await prisma.location.findFirst({
      where: { tenantId, shopifyLocationId, licensedInVf: true, isActive: true },
      select: { id: true },
    });
    if (mapped) {
      return mapped.id;
    }
  }

  const fallback = await prisma.location.findFirst({
    where: { tenantId, licensedInVf: true, isActive: true },
    orderBy: { name: 'asc' },
    select: { id: true },
  });
  return fallback?.id ?? null;
}
