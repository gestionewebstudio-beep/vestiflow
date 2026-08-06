import { AdjustmentDirection, MovementOrigin, Prisma, StockMovementType } from '@prisma/client';

import { applyInventoryDelta } from './inventory-level-delta.util';

export interface StockMovementActor {
  readonly createdById?: string | null;
  readonly createdByName: string;
}

export interface ApplyStockLoadInput {
  readonly tenantId: string;
  readonly variantId: string;
  readonly sku: string;
  readonly locationId: string;
  readonly quantity: number;
  readonly reason: string;
  readonly externalRef: string;
  readonly actor: StockMovementActor;
}

/** Carico atomico: delta giacenza + movimento tracciabile (regola gestionale). */
export async function applyStockLoad(
  tx: Prisma.TransactionClient,
  input: ApplyStockLoadInput,
): Promise<void> {
  if (input.quantity <= 0) {
    return;
  }
  await applyInventoryDelta(tx, input.tenantId, input.variantId, input.locationId, input.quantity);

  await tx.stockMovement.create({
    data: {
      tenantId: input.tenantId,
      type: StockMovementType.load,
      origin: MovementOrigin.manual,
      variantId: input.variantId,
      sku: input.sku,
      locationId: input.locationId,
      quantity: input.quantity,
      reason: input.reason,
      externalRef: input.externalRef,
      createdById: input.actor.createdById ?? null,
      createdByName: input.actor.createdByName,
    },
  });
}

/** Scarico atomico collegato a documento (scarico manuale / storno carichi). */
export async function applyStockUnload(
  tx: Prisma.TransactionClient,
  input: ApplyStockLoadInput,
): Promise<void> {
  if (input.quantity <= 0) {
    return;
  }
  await applyInventoryDelta(tx, input.tenantId, input.variantId, input.locationId, -input.quantity);

  await tx.stockMovement.create({
    data: {
      tenantId: input.tenantId,
      type: StockMovementType.unload,
      origin: MovementOrigin.manual,
      variantId: input.variantId,
      sku: input.sku,
      locationId: input.locationId,
      quantity: input.quantity,
      reason: input.reason,
      externalRef: input.externalRef,
      createdById: input.actor.createdById ?? null,
      createdByName: input.actor.createdByName,
    },
  });
}

/** Vendita manuale (DDT vendita): scarico giacenza + movimento tipo sale. */
export async function applyStockSale(
  tx: Prisma.TransactionClient,
  input: ApplyStockLoadInput,
): Promise<void> {
  if (input.quantity <= 0) {
    return;
  }
  await applyInventoryDelta(tx, input.tenantId, input.variantId, input.locationId, -input.quantity);

  await tx.stockMovement.create({
    data: {
      tenantId: input.tenantId,
      type: StockMovementType.sale,
      origin: MovementOrigin.manual,
      variantId: input.variantId,
      sku: input.sku,
      locationId: input.locationId,
      quantity: input.quantity,
      reason: input.reason,
      externalRef: input.externalRef,
      createdById: input.actor.createdById ?? null,
      createdByName: input.actor.createdByName,
    },
  });
}

export interface ApplyStockTransferInput extends ApplyStockLoadInput {
  readonly targetLocationId: string;
}

/** Trasferimento interno: scarico origine, carico destinazione, movimento transfer. */
export async function applyStockTransfer(
  tx: Prisma.TransactionClient,
  input: ApplyStockTransferInput,
): Promise<void> {
  if (input.quantity <= 0) {
    return;
  }
  if (input.locationId === input.targetLocationId) {
    throw new Error('Origine e destinazione devono essere location diverse.');
  }

  await applyInventoryDelta(tx, input.tenantId, input.variantId, input.locationId, -input.quantity);
  await applyInventoryDelta(tx, input.tenantId, input.variantId, input.targetLocationId, input.quantity);

  await tx.stockMovement.create({
    data: {
      tenantId: input.tenantId,
      type: StockMovementType.transfer,
      origin: MovementOrigin.manual,
      variantId: input.variantId,
      sku: input.sku,
      locationId: input.locationId,
      targetLocationId: input.targetLocationId,
      quantity: input.quantity,
      reason: input.reason,
      externalRef: input.externalRef,
      createdById: input.actor.createdById ?? null,
      createdByName: input.actor.createdByName,
    },
  });
}

export interface ApplyStockAdjustmentInput extends ApplyStockLoadInput {
  readonly direction: AdjustmentDirection;
}

/** Rettifica inventario documentale: movimento adjustment con direzione esplicita. */
export async function applyStockAdjustment(
  tx: Prisma.TransactionClient,
  input: ApplyStockAdjustmentInput,
): Promise<void> {
  if (input.quantity <= 0) {
    return;
  }
  const delta =
    input.direction === AdjustmentDirection.increase ? input.quantity : -input.quantity;
  await applyInventoryDelta(tx, input.tenantId, input.variantId, input.locationId, delta);

  await tx.stockMovement.create({
    data: {
      tenantId: input.tenantId,
      type: StockMovementType.adjustment,
      origin: MovementOrigin.manual,
      variantId: input.variantId,
      sku: input.sku,
      locationId: input.locationId,
      quantity: input.quantity,
      direction: input.direction,
      reason: input.reason,
      externalRef: input.externalRef,
      createdById: input.actor.createdById ?? null,
      createdByName: input.actor.createdByName,
    },
  });
}
