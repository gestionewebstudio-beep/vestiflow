import { DocumentType } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import {
  buildTransferMovementReason,
  syncTransferLineMovements,
} from './document-stock-transfer-sync.util';

const tenantId = 'tenant-1';
const documentId = 'doc-1';
const actor = { createdById: 'user-1', createdByName: 'Mario' };

function createTxMock(movements: readonly unknown[] = []) {
  return {
    stockMovement: {
      // Prima query = conversione legacy (sourceLineId: null) → sempre vuota;
      // seconda query = movimenti per-riga del documento.
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
    locationId: 'loc-a',
    targetLocationId: 'loc-b',
    quantity: 5,
    direction: null,
    reason: 'Trasferimento TR-2026-0001',
    sourceLineId: 'line-1',
    createdAt: new Date('2026-07-11T00:00:00.000Z'),
    ...overrides,
  };
}

/** Delta di giacenza applicati: [{ variantId, locationId, delta }]. */
function inventoryDeltas(tx: ReturnType<typeof createTxMock>) {
  return tx.inventoryLevel.updateMany.mock.calls.map(([args]) => ({
    variantId: args.where.variantId,
    locationId: args.where.locationId,
    delta: args.data.onHand.increment,
  }));
}

describe('buildTransferMovementReason', () => {
  it('con riferimento: "Trasferimento TR-2026-0002"', () => {
    expect(buildTransferMovementReason({ reference: 'TR-2026-0002' })).toBe(
      'Trasferimento TR-2026-0002',
    );
  });

  it('senza riferimento: "Trasferimento interno"', () => {
    expect(buildTransferMovementReason({ reference: null })).toBe('Trasferimento interno');
  });

  it('con suffisso: lo accoda alla base', () => {
    expect(
      buildTransferMovementReason({ reference: 'TR-2026-0002', reasonSuffix: ': rettifica +2' }),
    ).toBe('Trasferimento TR-2026-0002: rettifica +2');
  });
});

describe('syncTransferLineMovements — casi A-F (mirror arrivo merce §2.3)', () => {
  const baseParams = {
    tenantId,
    documentId,
    documentType: DocumentType.transfer,
    originLocationId: 'loc-a',
    targetLocationId: 'loc-b',
    reason: 'Trasferimento TR-2026-0001',
    actor,
  } as const;

  it('caso A: riga nuova → un movimento transfer, -qty origine / +qty destinazione', async () => {
    const tx = createTxMock();

    const result = await syncTransferLineMovements(tx as never, {
      ...baseParams,
      lines: [line()],
    });

    expect(tx.stockMovement.create).toHaveBeenCalledTimes(1);
    const created = tx.stockMovement.create.mock.calls[0]![0]!.data;
    expect(created.type).toBe('transfer');
    expect(created.locationId).toBe('loc-a');
    expect(created.targetLocationId).toBe('loc-b');
    expect(created.quantity).toBe(5);
    expect(created.sourceLineId).toBe('line-1');
    expect(created.sourceDocumentType).toBe(DocumentType.transfer);
    expect(inventoryDeltas(tx)).toEqual([
      { variantId: 'var-1', locationId: 'loc-a', delta: -5 },
      { variantId: 'var-1', locationId: 'loc-b', delta: 5 },
    ]);
    expect(result.deltas).toEqual([{ sku: 'SKU-1', delta: 5 }]);
    expect(result.createdLineIds).toEqual(['line-1']);
  });

  it('caso B: quantità da 5 a 15 → stesso movimento, delta solo sul +10', async () => {
    const tx = createTxMock([existingMovement()]);

    const result = await syncTransferLineMovements(tx as never, {
      ...baseParams,
      lines: [line({ quantity: 15 })],
    });

    expect(tx.stockMovement.create).not.toHaveBeenCalled();
    expect(tx.stockMovement.delete).not.toHaveBeenCalled();
    expect(tx.stockMovement.update).toHaveBeenCalledTimes(1);
    expect(tx.stockMovement.update.mock.calls[0]![0]!.where).toEqual({ id: 'mov-1' });
    expect(tx.stockMovement.update.mock.calls[0]![0]!.data.quantity).toBe(15);
    expect(inventoryDeltas(tx)).toEqual([
      { variantId: 'var-1', locationId: 'loc-a', delta: -10 },
      { variantId: 'var-1', locationId: 'loc-b', delta: 10 },
    ]);
    expect(result.deltas).toEqual([{ sku: 'SKU-1', delta: 10 }]);
  });

  it('caso C: quantità da 5 a 2 → stesso movimento, delta -3 senza guardia', async () => {
    const tx = createTxMock([existingMovement()]);

    const result = await syncTransferLineMovements(tx as never, {
      ...baseParams,
      lines: [line({ quantity: 2 })],
    });

    expect(tx.stockMovement.update).toHaveBeenCalledTimes(1);
    expect(tx.stockMovement.update.mock.calls[0]![0]!.data.quantity).toBe(2);
    expect(inventoryDeltas(tx)).toEqual([
      { variantId: 'var-1', locationId: 'loc-a', delta: 3 },
      { variantId: 'var-1', locationId: 'loc-b', delta: -3 },
    ]);
    expect(result.deltas).toEqual([{ sku: 'SKU-1', delta: -3 }]);
  });

  it('caso D: riga eliminata → movimento rimosso e giacenza ripristinata su entrambe le location', async () => {
    const tx = createTxMock([existingMovement()]);

    const result = await syncTransferLineMovements(tx as never, {
      ...baseParams,
      lines: [line({ id: 'line-2', variantId: 'var-2', sku: 'SKU-2', quantity: 3 })],
    });

    expect(tx.stockMovement.create).toHaveBeenCalledTimes(1);
    expect(tx.stockMovement.delete).toHaveBeenCalledWith({ where: { id: 'mov-1' } });
    expect(inventoryDeltas(tx)).toEqual([
      { variantId: 'var-2', locationId: 'loc-a', delta: -3 },
      { variantId: 'var-2', locationId: 'loc-b', delta: 3 },
      { variantId: 'var-1', locationId: 'loc-a', delta: 5 },
      { variantId: 'var-1', locationId: 'loc-b', delta: -5 },
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
      }),
    ]);

    await syncTransferLineMovements(tx as never, { ...baseParams, lines: [] });

    expect(tx.stockMovement.delete).toHaveBeenCalledTimes(2);
    expect(inventoryDeltas(tx)).toEqual([
      { variantId: 'var-1', locationId: 'loc-a', delta: 5 },
      { variantId: 'var-1', locationId: 'loc-b', delta: -5 },
      { variantId: 'var-2', locationId: 'loc-a', delta: 20 },
      { variantId: 'var-2', locationId: 'loc-b', delta: -20 },
    ]);
  });

  it('caso F: due righe dello stesso articolo → due movimenti distinti (mai aggregati)', async () => {
    const tx = createTxMock();

    await syncTransferLineMovements(tx as never, {
      ...baseParams,
      lines: [line({ id: 'line-1', quantity: 2 }), line({ id: 'line-2', quantity: 3 })],
    });

    expect(tx.stockMovement.create).toHaveBeenCalledTimes(2);
    const created = tx.stockMovement.create.mock.calls.map(([args]) => args.data);
    expect(created.map((data) => data.sourceLineId)).toEqual(['line-1', 'line-2']);
    expect(created.map((data) => data.quantity)).toEqual([2, 3]);
    expect(inventoryDeltas(tx)).toEqual([
      { variantId: 'var-1', locationId: 'loc-a', delta: -2 },
      { variantId: 'var-1', locationId: 'loc-b', delta: 2 },
      { variantId: 'var-1', locationId: 'loc-a', delta: -3 },
      { variantId: 'var-1', locationId: 'loc-b', delta: 3 },
    ]);
  });

  it('cambio origine/destinazione documento: storna la vecchia terna e carica la nuova', async () => {
    const tx = createTxMock([existingMovement()]);

    await syncTransferLineMovements(tx as never, {
      ...baseParams,
      originLocationId: 'loc-c',
      targetLocationId: 'loc-d',
      lines: [line()],
    });

    expect(inventoryDeltas(tx)).toEqual([
      { variantId: 'var-1', locationId: 'loc-a', delta: 5 },
      { variantId: 'var-1', locationId: 'loc-b', delta: -5 },
      { variantId: 'var-1', locationId: 'loc-c', delta: -5 },
      { variantId: 'var-1', locationId: 'loc-d', delta: 5 },
    ]);
    expect(tx.stockMovement.update.mock.calls[0]![0]!.data.locationId).toBe('loc-c');
    expect(tx.stockMovement.update.mock.calls[0]![0]!.data.targetLocationId).toBe('loc-d');
  });

  it('righe non valide (loadsStock false, qty 0, senza variante) non generano movimenti', async () => {
    const tx = createTxMock();

    await syncTransferLineMovements(tx as never, {
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

    await syncTransferLineMovements(tx as never, {
      ...baseParams,
      lines: [line()],
    });

    expect(tx.stockMovement.create).not.toHaveBeenCalled();
    expect(tx.stockMovement.update).not.toHaveBeenCalled();
    expect(tx.stockMovement.delete).not.toHaveBeenCalled();
    expect(tx.inventoryLevel.updateMany).not.toHaveBeenCalled();
  });
});

describe('syncTransferLineMovements — conversione movimenti legacy aggregati', () => {
  it('un movimento legacy transfer (senza sourceLineId) viene stornato e rimosso al primo tocco', async () => {
    const legacyMovement = {
      id: 'legacy-1',
      variantId: 'var-1',
      sku: 'SKU-1',
      locationId: 'loc-a',
      targetLocationId: 'loc-b',
      quantity: 7,
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

    await syncTransferLineMovements(tx as never, {
      tenantId,
      documentId,
      documentType: DocumentType.transfer,
      originLocationId: 'loc-a',
      targetLocationId: 'loc-b',
      reason: 'Trasferimento TR-2026-0001',
      lines: [line({ quantity: 7 })],
      actor,
    });

    // Storno del legacy: +7 alla vecchia origine, -7 alla vecchia destinazione.
    expect(tx.stockMovement.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['legacy-1'] } },
    });
    const legacyDeltas = tx.inventoryLevel.updateMany.mock.calls.slice(0, 2).map((call) => {
      const [args] = call as [{ where: { locationId: string }; data: { onHand: { increment: number } } }];
      return { locationId: args.where.locationId, delta: args.data.onHand.increment };
    });
    expect(legacyDeltas).toEqual([
      { locationId: 'loc-a', delta: 7 },
      { locationId: 'loc-b', delta: -7 },
    ]);
    // Poi il sync per riga ricrea il movimento corretto.
    expect(tx.stockMovement.create).toHaveBeenCalledTimes(1);
  });
});
