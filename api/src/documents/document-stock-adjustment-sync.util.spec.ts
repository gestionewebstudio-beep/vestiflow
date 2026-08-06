import { AdjustmentDirection, DocumentType } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import {
  buildAdjustmentMovementReason,
  syncAdjustmentLineMovements,
} from './document-stock-adjustment-sync.util';

const tenantId = 'tenant-1';
const documentId = 'doc-1';
const actor = { createdById: 'user-1', createdByName: 'Mario' };

function createTxMock(movements: readonly unknown[] = []) {
  return {
    stockMovement: {
      findMany: vi.fn().mockImplementation(({ where }: { where: Record<string, unknown> }) => {
        if (where.sourceLineId === null) {
          return Promise.resolve([]);
        }
        return Promise.resolve([...movements]);
      }),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    inventoryLevel: {
      upsert: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findUnique: vi.fn(),
    },
  };
}

function line(overrides: Record<string, unknown> = {}) {
  return {
    id: 'line-1',
    variantId: 'var-1',
    sku: 'SKU-1',
    quantity: 5,
    loadsStock: true,
    ...overrides,
  } as never;
}

function existingMovement(overrides: Record<string, unknown> = {}) {
  return {
    id: 'mov-1',
    tenantId,
    variantId: 'var-1',
    sku: 'SKU-1',
    locationId: 'loc-1',
    targetLocationId: null,
    quantity: 5,
    direction: AdjustmentDirection.increase,
    reason: 'Rettifica RET-2026-0001: Conteggio',
    sourceLineId: 'line-1',
    createdAt: new Date('2026-07-11T00:00:00.000Z'),
    ...overrides,
  };
}

function inventoryDeltas(tx: ReturnType<typeof createTxMock>) {
  return tx.inventoryLevel.updateMany.mock.calls.map(([args]) => ({
    variantId: args.where.variantId,
    locationId: args.where.locationId,
    delta: args.data.onHand.increment,
  }));
}

describe('buildAdjustmentMovementReason', () => {
  it('con riferimento: "Rettifica RET-2026-0001: Conteggio"', () => {
    expect(
      buildAdjustmentMovementReason({ reference: 'RET-2026-0001', reason: 'Conteggio' }),
    ).toBe('Rettifica RET-2026-0001: Conteggio');
  });

  it('senza riferimento: "Rettifica inventario: Conteggio"', () => {
    expect(buildAdjustmentMovementReason({ reference: null, reason: 'Conteggio' })).toBe(
      'Rettifica inventario: Conteggio',
    );
  });
});

describe('syncAdjustmentLineMovements — casi A-F (mirror arrivo merce §2.3)', () => {
  const baseParams = {
    tenantId,
    documentId,
    documentType: DocumentType.adjustment,
    locationId: 'loc-1',
    direction: AdjustmentDirection.increase,
    reason: 'Rettifica RET-2026-0001: Conteggio',
    actor,
  } as const;

  it('caso A (aumento): riga nuova → un movimento adjustment, giacenza +qty', async () => {
    const tx = createTxMock();

    const result = await syncAdjustmentLineMovements(tx as never, {
      ...baseParams,
      lines: [line()],
    });

    expect(tx.stockMovement.create).toHaveBeenCalledTimes(1);
    const created = tx.stockMovement.create.mock.calls[0]![0]!.data;
    expect(created.type).toBe('adjustment');
    expect(created.direction).toBe('increase');
    expect(created.locationId).toBe('loc-1');
    expect(created.quantity).toBe(5);
    expect(created.sourceLineId).toBe('line-1');
    expect(inventoryDeltas(tx)).toEqual([{ variantId: 'var-1', locationId: 'loc-1', delta: 5 }]);
    expect(result.deltas).toEqual([{ sku: 'SKU-1', delta: 5 }]);
    expect(result.createdLineIds).toEqual(['line-1']);
  });

  it('caso A (diminuzione): riga nuova → giacenza -qty', async () => {
    const tx = createTxMock();

    const result = await syncAdjustmentLineMovements(tx as never, {
      ...baseParams,
      direction: AdjustmentDirection.decrease,
      lines: [line()],
    });

    expect(tx.stockMovement.create.mock.calls[0]![0]!.data.direction).toBe('decrease');
    expect(inventoryDeltas(tx)).toEqual([{ variantId: 'var-1', locationId: 'loc-1', delta: -5 }]);
    expect(result.deltas).toEqual([{ sku: 'SKU-1', delta: -5 }]);
  });

  it('caso B: quantità da 5 a 15 (aumento) → stesso movimento, giacenza solo +10', async () => {
    const tx = createTxMock([existingMovement()]);

    const result = await syncAdjustmentLineMovements(tx as never, {
      ...baseParams,
      lines: [line({ quantity: 15 })],
    });

    expect(tx.stockMovement.create).not.toHaveBeenCalled();
    expect(tx.stockMovement.delete).not.toHaveBeenCalled();
    expect(tx.stockMovement.update).toHaveBeenCalledTimes(1);
    expect(tx.stockMovement.update.mock.calls[0]![0]!.where).toEqual({ id: 'mov-1' });
    expect(tx.stockMovement.update.mock.calls[0]![0]!.data.quantity).toBe(15);
    expect(inventoryDeltas(tx)).toEqual([{ variantId: 'var-1', locationId: 'loc-1', delta: 10 }]);
    expect(result.deltas).toEqual([{ sku: 'SKU-1', delta: 10 }]);
  });

  it('caso C: quantità da 5 a 2 (aumento) → stesso movimento, giacenza -3 senza guardia', async () => {
    const tx = createTxMock([existingMovement()]);

    const result = await syncAdjustmentLineMovements(tx as never, {
      ...baseParams,
      lines: [line({ quantity: 2 })],
    });

    expect(tx.stockMovement.update).toHaveBeenCalledTimes(1);
    expect(tx.stockMovement.update.mock.calls[0]![0]!.data.quantity).toBe(2);
    expect(inventoryDeltas(tx)).toEqual([{ variantId: 'var-1', locationId: 'loc-1', delta: -3 }]);
    expect(result.deltas).toEqual([{ sku: 'SKU-1', delta: -3 }]);
  });

  it('caso D: riga eliminata → movimento rimosso e giacenza stornata', async () => {
    const tx = createTxMock([existingMovement()]);

    const result = await syncAdjustmentLineMovements(tx as never, {
      ...baseParams,
      lines: [line({ id: 'line-2', variantId: 'var-2', sku: 'SKU-2', quantity: 3 })],
    });

    expect(tx.stockMovement.create).toHaveBeenCalledTimes(1);
    expect(tx.stockMovement.delete).toHaveBeenCalledWith({ where: { id: 'mov-1' } });
    expect(inventoryDeltas(tx)).toEqual([
      { variantId: 'var-2', locationId: 'loc-1', delta: 3 },
      { variantId: 'var-1', locationId: 'loc-1', delta: -5 },
    ]);
    expect(result.deltas).toEqual([
      { sku: 'SKU-2', delta: 3 },
      { sku: 'SKU-1', delta: -5 },
    ]);
  });

  it('caso E: documento eliminato (righe vuote) → rimuove tutti i movimenti', async () => {
    const tx = createTxMock([
      existingMovement(),
      existingMovement({
        id: 'mov-2',
        sourceLineId: 'line-2',
        variantId: 'var-2',
        sku: 'SKU-2',
        quantity: 20,
        direction: AdjustmentDirection.decrease,
      }),
    ]);

    await syncAdjustmentLineMovements(tx as never, { ...baseParams, lines: [] });

    expect(tx.stockMovement.delete).toHaveBeenCalledTimes(2);
    expect(inventoryDeltas(tx)).toEqual([
      { variantId: 'var-1', locationId: 'loc-1', delta: -5 },
      { variantId: 'var-2', locationId: 'loc-1', delta: 20 },
    ]);
  });

  it('caso F: due righe dello stesso articolo → due movimenti distinti (mai aggregati)', async () => {
    const tx = createTxMock();

    await syncAdjustmentLineMovements(tx as never, {
      ...baseParams,
      lines: [line({ id: 'line-1', quantity: 10 }), line({ id: 'line-2', quantity: 5 })],
    });

    expect(tx.stockMovement.create).toHaveBeenCalledTimes(2);
    const created = tx.stockMovement.create.mock.calls.map(([args]) => args.data);
    expect(created.map((data) => data.sourceLineId)).toEqual(['line-1', 'line-2']);
    expect(created.map((data) => data.quantity)).toEqual([10, 5]);
    expect(inventoryDeltas(tx)).toEqual([
      { variantId: 'var-1', locationId: 'loc-1', delta: 10 },
      { variantId: 'var-1', locationId: 'loc-1', delta: 5 },
    ]);
  });

  it('cambio direzione documento: storna il vecchio effetto e applica il nuovo', async () => {
    const tx = createTxMock([existingMovement()]);

    await syncAdjustmentLineMovements(tx as never, {
      ...baseParams,
      direction: AdjustmentDirection.decrease,
      lines: [line()],
    });

    expect(inventoryDeltas(tx)).toEqual([
      { variantId: 'var-1', locationId: 'loc-1', delta: -5 },
      { variantId: 'var-1', locationId: 'loc-1', delta: -5 },
    ]);
    expect(tx.stockMovement.update.mock.calls[0]![0]!.data.direction).toBe('decrease');
  });

  it('cambio location documento: storna sulla vecchia e applica sulla nuova', async () => {
    const tx = createTxMock([existingMovement()]);

    await syncAdjustmentLineMovements(tx as never, {
      ...baseParams,
      locationId: 'loc-2',
      lines: [line()],
    });

    expect(inventoryDeltas(tx)).toEqual([
      { variantId: 'var-1', locationId: 'loc-1', delta: -5 },
      { variantId: 'var-1', locationId: 'loc-2', delta: 5 },
    ]);
    expect(tx.stockMovement.update.mock.calls[0]![0]!.data.locationId).toBe('loc-2');
  });

  it('righe non valide (loadsStock false, qty 0, senza variante) non generano movimenti', async () => {
    const tx = createTxMock();

    await syncAdjustmentLineMovements(tx as never, {
      ...baseParams,
      lines: [
        line({ id: 'line-a', loadsStock: false }),
        line({ id: 'line-b', quantity: 0 }),
        line({ id: 'line-c', variantId: null }),
      ],
    });

    expect(tx.stockMovement.create).not.toHaveBeenCalled();
    expect(tx.inventoryLevel.updateMany).not.toHaveBeenCalled();
  });

  it('nessuna modifica: salvataggio idempotente, nessun update', async () => {
    const tx = createTxMock([existingMovement()]);

    await syncAdjustmentLineMovements(tx as never, {
      ...baseParams,
      lines: [line()],
    });

    expect(tx.stockMovement.create).not.toHaveBeenCalled();
    expect(tx.stockMovement.update).not.toHaveBeenCalled();
    expect(tx.stockMovement.delete).not.toHaveBeenCalled();
    expect(tx.inventoryLevel.updateMany).not.toHaveBeenCalled();
  });
});

describe('syncAdjustmentLineMovements — conversione movimenti legacy aggregati', () => {
  it('un movimento legacy adjustment (senza sourceLineId) viene stornato e rimosso al primo tocco', async () => {
    const legacyMovement = {
      id: 'legacy-1',
      variantId: 'var-1',
      sku: 'SKU-1',
      locationId: 'loc-1',
      quantity: 7,
      direction: AdjustmentDirection.increase,
      sourceLineId: null,
    };
    const tx = {
      stockMovement: {
        findMany: vi
          .fn()
          .mockImplementation(({ where }: { where: Record<string, unknown> }) => {
            if (where.sourceLineId === null) {
              return Promise.resolve([legacyMovement]);
            }
            return Promise.resolve([]);
          }),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        deleteMany: vi.fn(),
      },
      inventoryLevel: {
        upsert: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUnique: vi.fn(),
      },
    };

    await syncAdjustmentLineMovements(tx as never, {
      tenantId,
      documentId,
      documentType: DocumentType.adjustment,
      locationId: 'loc-1',
      direction: AdjustmentDirection.increase,
      reason: 'Rettifica RET-2026-0001: Conteggio',
      lines: [line({ quantity: 7 })],
      actor,
    });

    expect(tx.stockMovement.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['legacy-1'] } },
    });
    const legacyDelta = tx.inventoryLevel.updateMany.mock.calls[0]![0]!;
    expect(legacyDelta.where.locationId).toBe('loc-1');
    expect(legacyDelta.data.onHand.increment).toBe(-7);
    expect(tx.stockMovement.create).toHaveBeenCalledTimes(1);
  });
});
