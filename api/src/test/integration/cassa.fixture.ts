import type { PrismaClient } from '@prisma/client';

import { creaDataset, IDS } from './fixture';

/** Estende il dataset tenant/sedi comune; nessun seed o collegamento esterno. */
export async function creaDatasetCassa(prisma: PrismaClient) {
  await creaDataset(prisma);
  await prisma.user.update({ where: { id: IDS.utenteA1 }, data: { role: 'owner' } });
  const product = await prisma.product.create({
    data: { tenantId: IDS.tenantA, name: 'Articolo Cassa TEST', articleCode: 'CASSA-TEST' },
  });
  const variant = await prisma.productVariant.create({
    data: {
      tenantId: IDS.tenantA,
      productId: product.id,
      sku: 'CASSA-TEST',
      sellingPriceMinor: 100,
      purchasePriceMinor: 40,
    },
  });
  const cash = await prisma.paymentOption.create({
    data: { tenantId: IDS.tenantA, kind: 'method', name: 'Contanti TEST', tenderKind: 'cash' },
  });
  const card = await prisma.paymentOption.create({
    data: { tenantId: IDS.tenantA, kind: 'method', name: 'Carta TEST', tenderKind: 'electronic' },
  });
  const party = await prisma.party.create({ data: { tenantId: IDS.tenantA } });
  const supplier = await prisma.supplier.create({
    data: { tenantId: IDS.tenantA, partyId: party.id },
  });
  return { variantId: variant.id, cashId: cash.id, cardId: card.id, supplierId: supplier.id };
}

/** Fotografia dei fatti economici, inclusi contatori, quote e giacenze. */
export async function fotografaCassa(prisma: PrismaClient, tenantId: string = IDS.tenantA) {
  const where = { tenantId };
  const orderBy = { id: 'asc' as const };
  return JSON.stringify(
    await Promise.all([
      prisma.document.findMany({ where, orderBy }),
      prisma.documentLine.findMany({ where, orderBy }),
      prisma.storeSalePayment.findMany({ where, orderBy }),
      prisma.stockMovement.findMany({ where, orderBy }),
      prisma.inventoryLevel.findMany({ where, orderBy }),
      prisma.cashSession.findMany({ where, orderBy }),
      prisma.cashSessionMovement.findMany({ where, orderBy }),
      prisma.cashSessionDeviceChange.findMany({ where, orderBy }),
      prisma.documentRevision.findMany({ where, orderBy }),
      prisma.documentAttachment.findMany({ where, orderBy }),
      prisma.documentCounter.findMany({ where, orderBy }),
    ]),
  );
}
