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

interface SerialTrackedVariant {
  readonly sku: string;
  readonly serial: boolean;
}

/**
 * Carica in un'unica query il tracciamento di tutte le varianti citate dalle
 * righe: interrogarle una per una costava un round-trip per riga documento.
 */
async function loadSerialTrackedVariants(
  tx: Prisma.TransactionClient,
  tenantId: string,
  lines: readonly SerialLine[],
): Promise<Map<string, SerialTrackedVariant>> {
  const variantIds = [
    ...new Set(
      lines
        .filter((line) => line.loadsStock && line.quantity > 0 && line.variantId)
        .map((line) => line.variantId as string),
    ),
  ];
  if (variantIds.length === 0) {
    return new Map();
  }

  const variants = await tx.productVariant.findMany({
    where: { id: { in: variantIds }, tenantId },
    select: {
      id: true,
      sku: true,
      product: { select: { inventoryTracking: true } },
    },
  });

  return new Map(
    variants.map((variant) => [
      variant.id,
      {
        sku: variant.sku ?? '',
        serial: variant.product?.inventoryTracking === InventoryTrackingMode.serial,
      },
    ]),
  );
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
  const variantsById = await loadSerialTrackedVariants(tx, tenantId, lines);

  // Righe a tracciamento seriale con i rispettivi seriali digitati.
  const serialLines: {
    readonly sku: string;
    readonly quantity: number;
    readonly serials: readonly string[];
  }[] = [];
  for (const line of lines) {
    if (!line.loadsStock || line.quantity <= 0 || !line.variantId) {
      continue;
    }
    const variant = variantsById.get(line.variantId);
    if (!variant?.serial) {
      continue;
    }
    serialLines.push({
      sku: variant.sku,
      quantity: line.quantity,
      serials: parseSerialNumbers(line.serialNumbers),
    });
  }

  if (serialLines.length === 0) {
    return;
  }

  // Un'unica interrogazione per tutti i seriali del documento: la verifica di
  // esistenza non dipende dalla riga, quindi non serve una query per riga.
  const allSerials = [...new Set(serialLines.flatMap((line) => [...line.serials]))];
  const existing = await tx.inventorySerial.findMany({
    where: { tenantId, serialNumber: { in: allSerials } },
    select: { serialNumber: true },
  });
  const taken = new Set(existing.map((row) => row.serialNumber));

  // I controlli restano nell'ordine originale — per riga, prima il conteggio e
  // poi l'esistenza — così l'errore segnalato è lo stesso di quando ogni riga
  // faceva la propria query. È solo la lettura ad essere stata accorpata.
  for (const line of serialLines) {
    assertSerialCountMatchesQuantity(line.sku, line.quantity, line.serials);

    const conflicting = line.serials.filter((serial) => taken.has(serial));
    if (conflicting.length > 0) {
      throw new UnprocessableEntityException(
        `Seriali già presenti a magazzino: ${conflicting.join(', ')}.`,
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
  const variantsById = await loadSerialTrackedVariants(tx, tenantId, lines);

  for (const line of lines) {
    if (!line.loadsStock || line.quantity <= 0 || !line.variantId) {
      continue;
    }

    const variant = variantsById.get(line.variantId);
    if (!variant?.serial) {
      continue;
    }

    const serials = parseSerialNumbers(line.serialNumbers);
    assertSerialCountMatchesQuantity(variant.sku, line.quantity, serials);

    // Tutti i seriali della riga in una query sola: uno per uno erano N query
    // per riga. L'errore continua a citare il primo seriale mancante in ordine.
    const inStock = await tx.inventorySerial.findMany({
      where: {
        tenantId,
        serialNumber: { in: [...serials] },
        status: InventorySerialStatus.in_stock,
        variantId: line.variantId,
        locationId,
      },
      select: { serialNumber: true },
    });
    const available = new Set(inStock.map((row) => row.serialNumber));

    const missing = serials.find((serialNumber) => !available.has(serialNumber));
    if (missing !== undefined) {
      throw new UnprocessableEntityException(
        `Seriale ${missing} non disponibile in stock per SKU ${variant.sku} alla location selezionata.`,
      );
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
  const variantsById = await loadSerialTrackedVariants(tx, tenantId, lines);

  for (const line of lines) {
    if (!line.loadsStock || line.quantity <= 0 || !line.variantId) {
      continue;
    }

    const variant = variantsById.get(line.variantId);
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
  const variantsById = await loadSerialTrackedVariants(tx, tenantId, lines);

  for (const line of lines) {
    if (!line.loadsStock || line.quantity <= 0 || !line.variantId) {
      continue;
    }

    const variant = variantsById.get(line.variantId);
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
  const variantsById = await loadSerialTrackedVariants(tx, tenantId, lines);

  for (const line of lines) {
    if (!line.loadsStock || line.quantity <= 0 || !line.variantId) {
      continue;
    }

    const variant = variantsById.get(line.variantId);
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
