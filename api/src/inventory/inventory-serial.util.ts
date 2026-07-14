import { UnprocessableEntityException } from '@nestjs/common';
import {
  InventorySerialStatus,
  InventoryTrackingMode,
  type DocumentLine,
  type Prisma,
} from '@prisma/client';

type SerialLine = Pick<
  DocumentLine,
  'id' | 'variantId' | 'quantity' | 'loadsStock' | 'serialNumbers'
>;

function parseSerialNumbers(raw: unknown): readonly string[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

async function isSerialTrackedVariant(
  tx: Prisma.TransactionClient,
  tenantId: string,
  variantId: string,
): Promise<{ sku: string; serial: boolean } | null> {
  const variant = await tx.productVariant.findFirst({
    where: { id: variantId, tenantId },
    select: {
      sku: true,
      product: { select: { inventoryTracking: true } },
    },
  });
  if (!variant) {
    return null;
  }
  return {
    sku: variant.sku ?? '',
    serial: variant.product?.inventoryTracking === InventoryTrackingMode.serial,
  };
}

function assertSerialCountMatchesQuantity(
  sku: string,
  quantity: number,
  serials: readonly string[],
): void {
  const unique = new Set(serials.map((entry) => entry.toLowerCase()));
  if (serials.length !== quantity) {
    throw new UnprocessableEntityException(
      `SKU ${sku}: servono ${quantity} numeri seriali (inseriti ${serials.length}).`,
    );
  }
  if (unique.size !== serials.length) {
    throw new UnprocessableEntityException(
      `SKU ${sku}: numeri seriali duplicati nella stessa riga.`,
    );
  }
}

/** Valida seriali obbligatori per prodotti con tracciamento serial (carico). */
export async function assertSerialNumbersForDocumentLines(
  tx: Prisma.TransactionClient,
  tenantId: string,
  lines: readonly SerialLine[],
): Promise<void> {
  for (const line of lines) {
    if (!line.loadsStock || line.quantity <= 0 || !line.variantId) {
      continue;
    }

    const variant = await isSerialTrackedVariant(tx, tenantId, line.variantId);
    if (!variant?.serial) {
      continue;
    }

    const serials = parseSerialNumbers(line.serialNumbers);
    assertSerialCountMatchesQuantity(variant.sku, line.quantity, serials);

    const existing = await tx.inventorySerial.findMany({
      where: { tenantId, serialNumber: { in: [...serials] } },
      select: { serialNumber: true },
    });
    if (existing.length > 0) {
      throw new UnprocessableEntityException(
        `Seriali già presenti a magazzino: ${existing.map((row) => row.serialNumber).join(', ')}.`,
      );
    }
  }
}

/** Valida seriali in stock per scarico/vendita/rettifica negativa. */
export async function assertSerialNumbersForUnloadLines(
  tx: Prisma.TransactionClient,
  tenantId: string,
  locationId: string,
  lines: readonly SerialLine[],
): Promise<void> {
  for (const line of lines) {
    if (!line.loadsStock || line.quantity <= 0 || !line.variantId) {
      continue;
    }

    const variant = await isSerialTrackedVariant(tx, tenantId, line.variantId);
    if (!variant?.serial) {
      continue;
    }

    const serials = parseSerialNumbers(line.serialNumbers);
    assertSerialCountMatchesQuantity(variant.sku, line.quantity, serials);

    for (const serialNumber of serials) {
      const record = await tx.inventorySerial.findFirst({
        where: {
          tenantId,
          serialNumber,
          status: InventorySerialStatus.in_stock,
          variantId: line.variantId,
          locationId,
        },
        select: { id: true },
      });
      if (!record) {
        throw new UnprocessableEntityException(
          `Seriale ${serialNumber} non disponibile in stock per SKU ${variant.sku} alla location selezionata.`,
        );
      }
    }
  }
}

/** Valida seriali per trasferimento (in stock alla location origine). */
export async function assertSerialNumbersForTransferLines(
  tx: Prisma.TransactionClient,
  tenantId: string,
  originLocationId: string,
  lines: readonly SerialLine[],
): Promise<void> {
  await assertSerialNumbersForUnloadLines(tx, tenantId, originLocationId, lines);
}

/** Registra seriali in stock da righe documento confermato (carico). */
export async function applyInventorySerialsFromDocumentLines(
  tx: Prisma.TransactionClient,
  tenantId: string,
  locationId: string,
  lines: readonly SerialLine[],
): Promise<void> {
  for (const line of lines) {
    if (!line.loadsStock || line.quantity <= 0 || !line.variantId) {
      continue;
    }

    const variant = await isSerialTrackedVariant(tx, tenantId, line.variantId);
    if (!variant?.serial) {
      continue;
    }

    const serials = parseSerialNumbers(line.serialNumbers);
    for (const serialNumber of serials) {
      await tx.inventorySerial.create({
        data: {
          tenantId,
          variantId: line.variantId,
          locationId,
          serialNumber,
          documentLineId: line.id,
        },
      });
    }
  }
}

/** Consuma seriali in stock (scarico / vendita / rettifica negativa). */
export async function consumeInventorySerialsFromDocumentLines(
  tx: Prisma.TransactionClient,
  tenantId: string,
  locationId: string,
  lines: readonly SerialLine[],
): Promise<void> {
  for (const line of lines) {
    if (!line.loadsStock || line.quantity <= 0 || !line.variantId) {
      continue;
    }

    const variant = await isSerialTrackedVariant(tx, tenantId, line.variantId);
    if (!variant?.serial) {
      continue;
    }

    const serials = parseSerialNumbers(line.serialNumbers);
    for (const serialNumber of serials) {
      const updated = await tx.inventorySerial.updateMany({
        where: {
          tenantId,
          serialNumber,
          status: InventorySerialStatus.in_stock,
          variantId: line.variantId,
          locationId,
        },
        data: {
          status: InventorySerialStatus.consumed,
          documentLineId: line.id,
        },
      });
      if (updated.count === 0) {
        throw new UnprocessableEntityException(
          `Impossibile consumare il seriale ${serialNumber} per SKU ${variant.sku}.`,
        );
      }
    }
  }
}

/** Sposta seriali da origine a destinazione (trasferimento). */
export async function transferInventorySerialsFromDocumentLines(
  tx: Prisma.TransactionClient,
  tenantId: string,
  originLocationId: string,
  targetLocationId: string,
  lines: readonly SerialLine[],
): Promise<void> {
  for (const line of lines) {
    if (!line.loadsStock || line.quantity <= 0 || !line.variantId) {
      continue;
    }

    const variant = await isSerialTrackedVariant(tx, tenantId, line.variantId);
    if (!variant?.serial) {
      continue;
    }

    const serials = parseSerialNumbers(line.serialNumbers);
    for (const serialNumber of serials) {
      const updated = await tx.inventorySerial.updateMany({
        where: {
          tenantId,
          serialNumber,
          status: InventorySerialStatus.in_stock,
          variantId: line.variantId,
          locationId: originLocationId,
        },
        data: {
          locationId: targetLocationId,
          documentLineId: line.id,
        },
      });
      if (updated.count === 0) {
        throw new UnprocessableEntityException(
          `Impossibile trasferire il seriale ${serialNumber} per SKU ${variant.sku}.`,
        );
      }
    }
  }
}

/** Ripristina seriali consumati da un documento (annullamento / modifica confermata). */
export async function restoreConsumedSerialsForDocument(
  tx: Prisma.TransactionClient,
  tenantId: string,
  lineIds: readonly string[],
): Promise<void> {
  if (lineIds.length === 0) {
    return;
  }

  await tx.inventorySerial.updateMany({
    where: {
      tenantId,
      documentLineId: { in: [...lineIds] },
      status: InventorySerialStatus.consumed,
    },
    data: {
      status: InventorySerialStatus.in_stock,
      documentLineId: null,
    },
  });
}

/** Annulla trasferimento seriali (destinazione → origine). */
export async function reverseTransferInventorySerialsForDocument(
  tx: Prisma.TransactionClient,
  tenantId: string,
  originLocationId: string,
  targetLocationId: string,
  lineIds: readonly string[],
): Promise<void> {
  if (lineIds.length === 0) {
    return;
  }

  await tx.inventorySerial.updateMany({
    where: {
      tenantId,
      documentLineId: { in: [...lineIds] },
      status: InventorySerialStatus.in_stock,
      locationId: targetLocationId,
    },
    data: {
      locationId: originLocationId,
      documentLineId: null,
    },
  });
}

/** Rimuove seriali registrati da un documento di carico annullato. */
export async function reverseInventorySerialsForDocument(
  tx: Prisma.TransactionClient,
  tenantId: string,
  lineIds: readonly string[],
): Promise<void> {
  if (lineIds.length === 0) {
    return;
  }

  await tx.inventorySerial.deleteMany({
    where: { tenantId, documentLineId: { in: [...lineIds] } },
  });
}

export { parseSerialNumbers };
