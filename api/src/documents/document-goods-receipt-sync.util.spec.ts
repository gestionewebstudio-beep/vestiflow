import { DocumentType } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import {
  buildGoodsReceiptMovementReason,
  syncGoodsReceiptLineMovements,
} from './document-goods-receipt-sync.util';

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
    unitPriceMinor: 1000,
    discountPercent: 0,
    lineTotalMinor: 5000,
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
    quantity: 5,
    reason: 'Arrivo merce n. 3 del 11/07/2026',
    sourceLineId: 'line-1',
    unitCostMinor: 1000,
    totalCostMinor: 5000,
    createdAt: new Date('2026-07-11T00:00:00.000Z'),
    ...overrides,
  };
}

describe('buildGoodsReceiptMovementReason (§12)', () => {
  const documentDate = new Date('2026-07-11T00:00:00.000Z');

  it('con causale: "Arrivo merce n. 3 del 11/07/2026 (DDT 145 del 08/05/2026)"', () => {
    expect(
      buildGoodsReceiptMovementReason({
        number: 3,
        reference: 'AM 3/2026',
        documentDate,
        causalText: 'DDT 145 del 08/05/2026',
      }),
    ).toBe('Arrivo merce n. 3 del 11/07/2026 (DDT 145 del 08/05/2026)');
  });

  it('con causale personalizzata la include integralmente', () => {
    expect(
      buildGoodsReceiptMovementReason({
        number: 3,
        reference: null,
        documentDate,
        causalText: 'DDT 145 del 08/05/2026 - C/Lavorazione',
      }),
    ).toBe('Arrivo merce n. 3 del 11/07/2026 (DDT 145 del 08/05/2026 - C/Lavorazione)');
  });

  it('senza causale: solo riferimento interno', () => {
    expect(
      buildGoodsReceiptMovementReason({
        number: 3,
        reference: null,
        documentDate,
        causalText: null,
      }),
    ).toBe('Arrivo merce n. 3 del 11/07/2026');
  });

  it('senza numero: usa la sola data interna', () => {
    expect(
      buildGoodsReceiptMovementReason({
        number: null,
        reference: null,
        documentDate,
        causalText: '',
      }),
    ).toBe('Arrivo merce del 11/07/2026');
  });
});

describe('syncGoodsReceiptLineMovements — causale e data registrazione (§2, §12)', () => {
  it('nuova riga: crea movimento con createdAt = data registrazione (caso 7)', async () => {
    const tx = createTxMock();
    const movementDate = new Date('2026-05-08T00:00:00.000Z');

    await syncGoodsReceiptLineMovements(tx as never, {
      tenantId,
      documentId,
      documentType: DocumentType.goods_receipt,
      locationId: 'loc-1',
      reason: 'Arrivo merce n. 3 del 08/05/2026 (DDT 145)',
      movementDate,
      lines: [line()],
      actor,
    });

    expect(tx.stockMovement.create).toHaveBeenCalledTimes(1);
    const created = tx.stockMovement.create.mock.calls[0][0].data;
    expect(created.createdAt).toEqual(movementDate);
    expect(created.reason).toBe('Arrivo merce n. 3 del 08/05/2026 (DDT 145)');
    expect(created.sourceLineId).toBe('line-1');
  });

  it('modifica causale: aggiorna LO STESSO movimento senza toccare la giacenza (caso 8)', async () => {
    const tx = createTxMock([existingMovement()]);

    await syncGoodsReceiptLineMovements(tx as never, {
      tenantId,
      documentId,
      documentType: DocumentType.goods_receipt,
      locationId: 'loc-1',
      reason: 'Arrivo merce n. 3 del 11/07/2026 (DDT 145 del 08/05/2026 - C/Lavorazione)',
      movementDate: new Date('2026-07-11T00:00:00.000Z'),
      lines: [line()],
      actor,
    });

    expect(tx.stockMovement.create).not.toHaveBeenCalled();
    expect(tx.stockMovement.delete).not.toHaveBeenCalled();
    expect(tx.stockMovement.update).toHaveBeenCalledTimes(1);
    expect(tx.stockMovement.update.mock.calls[0][0].where).toEqual({ id: 'mov-1' });
    expect(tx.stockMovement.update.mock.calls[0][0].data.reason).toContain('C/Lavorazione');
    // Quantità invariata → nessun delta di giacenza applicato.
    expect(tx.inventoryLevel.updateMany).not.toHaveBeenCalled();
  });

  it('modifica data registrazione: aggiorna createdAt mantenendo id e quantità (§2)', async () => {
    const tx = createTxMock([existingMovement()]);
    const newDate = new Date('2026-07-15T00:00:00.000Z');

    await syncGoodsReceiptLineMovements(tx as never, {
      tenantId,
      documentId,
      documentType: DocumentType.goods_receipt,
      locationId: 'loc-1',
      reason: 'Arrivo merce n. 3 del 11/07/2026',
      movementDate: newDate,
      lines: [line()],
      actor,
    });

    expect(tx.stockMovement.create).not.toHaveBeenCalled();
    expect(tx.stockMovement.update).toHaveBeenCalledTimes(1);
    const data = tx.stockMovement.update.mock.calls[0][0].data;
    expect(data.createdAt).toEqual(newDate);
    expect(data.quantity).toBe(5);
    expect(tx.inventoryLevel.updateMany).not.toHaveBeenCalled();
  });

  it('nessuna modifica: salvataggio idempotente, nessun update', async () => {
    const tx = createTxMock([existingMovement()]);

    await syncGoodsReceiptLineMovements(tx as never, {
      tenantId,
      documentId,
      documentType: DocumentType.goods_receipt,
      locationId: 'loc-1',
      reason: 'Arrivo merce n. 3 del 11/07/2026',
      movementDate: new Date('2026-07-11T00:00:00.000Z'),
      lines: [line()],
      actor,
    });

    expect(tx.stockMovement.create).not.toHaveBeenCalled();
    expect(tx.stockMovement.update).not.toHaveBeenCalled();
    expect(tx.stockMovement.delete).not.toHaveBeenCalled();
  });
});

describe('syncGoodsReceiptLineMovements — casi A-F del prompt (§2.3)', () => {
  const baseParams = {
    tenantId,
    documentId,
    documentType: DocumentType.goods_receipt,
    locationId: 'loc-1',
    reason: 'Arrivo merce n. 3 del 11/07/2026',
    movementDate: new Date('2026-07-11T00:00:00.000Z'),
    actor,
  } as const;

  /** Delta di giacenza applicati: [{ where, increment onHand }]. */
  function inventoryDeltas(tx: ReturnType<typeof createTxMock>) {
    return tx.inventoryLevel.updateMany.mock.calls.map(([args]) => ({
      variantId: args.where.variantId,
      locationId: args.where.locationId,
      delta: args.data.onHand.increment,
    }));
  }

  it('caso B: quantità da 5 a 15 → stesso movimento, giacenza solo +10', async () => {
    const tx = createTxMock([existingMovement()]);

    const result = await syncGoodsReceiptLineMovements(tx as never, {
      ...baseParams,
      lines: [line({ quantity: 15, lineTotalMinor: 15000 })],
    });

    expect(tx.stockMovement.create).not.toHaveBeenCalled();
    expect(tx.stockMovement.delete).not.toHaveBeenCalled();
    expect(tx.stockMovement.update).toHaveBeenCalledTimes(1);
    expect(tx.stockMovement.update.mock.calls[0][0].where).toEqual({ id: 'mov-1' });
    expect(tx.stockMovement.update.mock.calls[0][0].data.quantity).toBe(15);
    expect(inventoryDeltas(tx)).toEqual([{ variantId: 'var-1', locationId: 'loc-1', delta: 10 }]);
    expect(result.deltas).toEqual([{ sku: 'SKU-1', delta: 10 }]);
  });

  it('caso C: quantità da 5 a 2 → stesso movimento, giacenza -3 senza guardia (§3)', async () => {
    const tx = createTxMock([existingMovement()]);

    await syncGoodsReceiptLineMovements(tx as never, {
      ...baseParams,
      lines: [line({ quantity: 2, lineTotalMinor: 2000 })],
    });

    expect(tx.stockMovement.create).not.toHaveBeenCalled();
    expect(tx.stockMovement.update).toHaveBeenCalledTimes(1);
    expect(tx.stockMovement.update.mock.calls[0][0].data.quantity).toBe(2);
    expect(inventoryDeltas(tx)).toEqual([{ variantId: 'var-1', locationId: 'loc-1', delta: -3 }]);
    // Policy §3: nessuna condizione `available >= qty` nel where del decremento.
    expect(tx.inventoryLevel.updateMany.mock.calls[0][0].where).not.toHaveProperty('available');
  });

  it('caso C: riduzione oltre la disponibilità registrata comunque (saldo negativo ammesso §3)', async () => {
    const tx = createTxMock([existingMovement()]);

    const result = await syncGoodsReceiptLineMovements(tx as never, {
      ...baseParams,
      lines: [line({ quantity: 2 })],
    });

    // Nessun 422: il delta -3 viene applicato anche se la merce risulta già
    // venduta/trasferita; la giacenza può diventare negativa.
    expect(result.deltas).toEqual([{ sku: 'SKU-1', delta: -3 }]);
    expect(inventoryDeltas(tx)).toEqual([{ variantId: 'var-1', locationId: 'loc-1', delta: -3 }]);
    expect(tx.stockMovement.update).toHaveBeenCalledTimes(1);
  });

  it('caso D: riga eliminata → movimento rimosso e giacenza stornata', async () => {
    const tx = createTxMock([existingMovement()]);

    const result = await syncGoodsReceiptLineMovements(tx as never, {
      ...baseParams,
      lines: [line({ id: 'line-2', variantId: 'var-2', sku: 'SKU-2', quantity: 3 })],
    });

    // La riga nuova crea il suo movimento; quello orfano viene eliminato.
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
      existingMovement({ id: 'mov-2', sourceLineId: 'line-2', variantId: 'var-2', quantity: 20 }),
    ]);

    await syncGoodsReceiptLineMovements(tx as never, { ...baseParams, lines: [] });

    expect(tx.stockMovement.delete).toHaveBeenCalledTimes(2);
    expect(inventoryDeltas(tx)).toEqual([
      { variantId: 'var-1', locationId: 'loc-1', delta: -5 },
      { variantId: 'var-2', locationId: 'loc-1', delta: -20 },
    ]);
  });

  it('caso F: due righe dello stesso articolo → due movimenti distinti per riga', async () => {
    const tx = createTxMock();

    await syncGoodsReceiptLineMovements(tx as never, {
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

  it('cambio variante a parità di quantità: storna la vecchia e carica la nuova', async () => {
    const tx = createTxMock([existingMovement()]);

    await syncGoodsReceiptLineMovements(tx as never, {
      ...baseParams,
      lines: [line({ variantId: 'var-2', sku: 'SKU-2' })],
    });

    expect(tx.stockMovement.update).toHaveBeenCalledTimes(1);
    expect(tx.stockMovement.update.mock.calls[0][0].data.variantId).toBe('var-2');
    expect(inventoryDeltas(tx)).toEqual([
      { variantId: 'var-1', locationId: 'loc-1', delta: -5 },
      { variantId: 'var-2', locationId: 'loc-1', delta: 5 },
    ]);
  });

  it('cambio location documento: storna sulla vecchia location e carica sulla nuova', async () => {
    const tx = createTxMock([existingMovement()]);

    await syncGoodsReceiptLineMovements(tx as never, {
      ...baseParams,
      locationId: 'loc-2',
      lines: [line()],
    });

    expect(inventoryDeltas(tx)).toEqual([
      { variantId: 'var-1', locationId: 'loc-1', delta: -5 },
      { variantId: 'var-1', locationId: 'loc-2', delta: 5 },
    ]);
    expect(tx.stockMovement.update.mock.calls[0][0].data.locationId).toBe('loc-2');
  });

  it('righe non valide (loadsStock false, qty 0, senza variante) non generano movimenti', async () => {
    const tx = createTxMock();

    await syncGoodsReceiptLineMovements(tx as never, {
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
});
