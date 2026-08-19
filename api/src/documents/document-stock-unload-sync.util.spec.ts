import { DocumentType, MovementOrigin, StockMovementType } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import {
  buildUnloadMovementReason,
  syncUnloadLineMovements,
} from './document-stock-unload-sync.util';

const tenantId = 'tenant-1';
const documentId = 'doc-ddt';
const actor = { createdById: 'user-1', createdByName: 'Mario' };
const reason = 'DDT vendita DDT-0005';

/**
 * `movements` = movimenti per riga già collegati; `legacy` = movimenti vecchi
 * aggregati, senza `sourceLineId`, come li lasciava il percorso precedente.
 */
function createTxMock(movements: readonly unknown[] = [], legacy: readonly unknown[] = []) {
  return {
    stockMovement: {
      findMany: vi.fn().mockImplementation(({ where }: { where: Record<string, unknown> }) => {
        if (where.sourceLineId === null) {
          return Promise.resolve([...legacy]);
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
    quantity: 3,
    loadsStock: true,
    ...overrides,
  } as never;
}

function existingMovement(overrides: Record<string, unknown> = {}) {
  return {
    id: 'mov-1',
    tenantId,
    type: StockMovementType.sale,
    variantId: 'var-1',
    sku: 'SKU-1',
    locationId: 'loc-1',
    targetLocationId: null,
    quantity: 3,
    direction: null,
    reason,
    sourceLineId: 'line-1',
    createdAt: new Date('2026-08-06T10:00:00.000Z'),
    ...overrides,
  };
}

function legacyMovement(overrides: Record<string, unknown> = {}) {
  return {
    id: 'legacy-1',
    tenantId,
    type: StockMovementType.sale,
    variantId: 'var-1',
    sku: 'SKU-1',
    locationId: 'loc-1',
    quantity: 3,
    reason,
    sourceLineId: null,
    createdAt: new Date('2026-08-06T10:00:00.000Z'),
    ...overrides,
  };
}

/** Variazioni di giacenza applicate, nell'ordine. */
function inventoryDeltas(tx: ReturnType<typeof createTxMock>) {
  return tx.inventoryLevel.updateMany.mock.calls.map(([args]) => ({
    variantId: args.where.variantId,
    locationId: args.where.locationId,
    delta: args.data.onHand.increment,
  }));
}

function run(tx: ReturnType<typeof createTxMock>, lines: unknown[], locationId = 'loc-1') {
  return syncUnloadLineMovements(tx as never, {
    tenantId,
    documentId,
    documentType: DocumentType.sales_ddt,
    locationId,
    reason,
    lines: lines as never,
    actor,
  });
}

describe('syncUnloadLineMovements', () => {
  it('1 · DDT nuovo: una riga scarica → un solo movimento con sourceLineId', async () => {
    const tx = createTxMock();

    await run(tx, [line({ quantity: 3 })]);

    expect(tx.stockMovement.create).toHaveBeenCalledTimes(1);
    const created = tx.stockMovement.create.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(created.data).toMatchObject({
      type: StockMovementType.sale,
      quantity: 3,
      sourceLineId: 'line-1',
      sourceDocumentId: documentId,
      sourceDocumentType: DocumentType.sales_ddt,
      reason,
    });
    expect(inventoryDeltas(tx)).toEqual([{ variantId: 'var-1', locationId: 'loc-1', delta: -3 }]);
  });

  it('2 · quantità 3 → 2: aggiorna LO STESSO movimento, nessun carico di rettifica', async () => {
    const tx = createTxMock([existingMovement({ quantity: 3 })]);

    await run(tx, [line({ quantity: 2 })]);

    expect(tx.stockMovement.create).not.toHaveBeenCalled();
    expect(tx.stockMovement.delete).not.toHaveBeenCalled();
    expect(tx.stockMovement.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'mov-1' },
        data: expect.objectContaining({ quantity: 2 }),
      }),
    );
    // Un pezzo torna in giacenza: la differenza, non l'intera quantità.
    expect(inventoryDeltas(tx)).toEqual([{ variantId: 'var-1', locationId: 'loc-1', delta: 1 }]);
  });

  it('3 · quantità 2 → 4: stesso movimento, giacenza scende di due', async () => {
    const tx = createTxMock([existingMovement({ quantity: 2 })]);

    await run(tx, [line({ quantity: 4 })]);

    expect(tx.stockMovement.create).not.toHaveBeenCalled();
    expect(tx.stockMovement.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ quantity: 4 }) }),
    );
    expect(inventoryDeltas(tx)).toEqual([{ variantId: 'var-1', locationId: 'loc-1', delta: -2 }]);
  });

  it('4 · riga eliminata: sparisce solo il suo effetto', async () => {
    const tx = createTxMock([
      existingMovement({ id: 'mov-1', sourceLineId: 'line-1', quantity: 3 }),
      existingMovement({ id: 'mov-2', sourceLineId: 'line-2', quantity: 5, variantId: 'var-2' }),
    ]);

    await run(tx, [line({ id: 'line-1', quantity: 3 })]);

    expect(tx.stockMovement.delete).toHaveBeenCalledTimes(1);
    expect(tx.stockMovement.delete).toHaveBeenCalledWith({ where: { id: 'mov-2' } });
    // Torna in giacenza solo ciò che la riga eliminata aveva scaricato.
    expect(inventoryDeltas(tx)).toEqual([{ variantId: 'var-2', locationId: 'loc-1', delta: 5 }]);
  });

  it('5 · due righe dello stesso articolo → due movimenti distinti', async () => {
    const tx = createTxMock();

    await run(tx, [line({ id: 'line-1', quantity: 2 }), line({ id: 'line-2', quantity: 3 })]);

    expect(tx.stockMovement.create).toHaveBeenCalledTimes(2);
    const ids = tx.stockMovement.create.mock.calls.map(
      (call) => (call[0] as { data: { sourceLineId: string } }).data.sourceLineId,
    );
    expect(ids).toEqual(['line-1', 'line-2']);
    expect(inventoryDeltas(tx)).toEqual([
      { variantId: 'var-1', locationId: 'loc-1', delta: -2 },
      { variantId: 'var-1', locationId: 'loc-1', delta: -3 },
    ]);
  });

  it('6 · cambio location: ripristina la vecchia e scarica la nuova, per intero', async () => {
    const tx = createTxMock([existingMovement({ locationId: 'loc-1', quantity: 3 })]);

    await run(tx, [line({ quantity: 3 })], 'loc-2');

    expect(inventoryDeltas(tx)).toEqual([
      { variantId: 'var-1', locationId: 'loc-1', delta: 3 },
      { variantId: 'var-1', locationId: 'loc-2', delta: -3 },
    ]);
    expect(tx.stockMovement.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ locationId: 'loc-2' }) }),
    );
    expect(tx.stockMovement.create).not.toHaveBeenCalled();
  });

  it('7 · salvataggio identico: nessuna scrittura, nessuna variazione', async () => {
    const tx = createTxMock([existingMovement({ quantity: 3 })]);

    await run(tx, [line({ quantity: 3 })]);

    expect(tx.stockMovement.create).not.toHaveBeenCalled();
    expect(tx.stockMovement.update).not.toHaveBeenCalled();
    expect(tx.stockMovement.delete).not.toHaveBeenCalled();
    expect(inventoryDeltas(tx)).toEqual([]);
  });

  it('8 · DDT legacy con rettifica: conversione a saldo invariato', async () => {
    // Storia tipica: scarico −3, poi una rettifica +1 accodata da una modifica.
    // Netto in giacenza: −2. Il documento oggi dice 2.
    const tx = createTxMock(
      [],
      [
        legacyMovement({ id: 'legacy-1', type: StockMovementType.sale, quantity: 3 }),
        legacyMovement({ id: 'legacy-2', type: StockMovementType.load, quantity: 1 }),
      ],
    );

    await run(tx, [line({ quantity: 2 })]);

    // Annulla il netto legacy (+2), poi riscrive la riga (−2): saldo invariato.
    expect(inventoryDeltas(tx)).toEqual([
      { variantId: 'var-1', locationId: 'loc-1', delta: 2 },
      { variantId: 'var-1', locationId: 'loc-1', delta: -2 },
    ]);
    expect(tx.stockMovement.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['legacy-1', 'legacy-2'] } },
    });
    expect(tx.stockMovement.create).toHaveBeenCalledTimes(1);
    const created = tx.stockMovement.create.mock.calls[0]![0] as {
      data: { quantity: number; sourceLineId: string; createdAt?: Date };
    };
    expect(created.data.quantity).toBe(2);
    expect(created.data.sourceLineId).toBe('line-1');
    // Il movimento ricostruito tiene la data di quello vecchio: quell'uscita è
    // di allora, e nel registro non deve saltare in cima.
    expect(created.data.createdAt).toEqual(new Date('2026-08-06T10:00:00.000Z'));
  });

  it('9 · movimento orfano legacy: il residuo viene assorbito, non ricreato', async () => {
    // La riga che l'aveva generato non c'è più nel documento.
    const tx = createTxMock(
      [],
      [legacyMovement({ id: 'legacy-orfano', type: StockMovementType.sale, quantity: 4 })],
    );

    await run(tx, []);

    expect(inventoryDeltas(tx)).toEqual([{ variantId: 'var-1', locationId: 'loc-1', delta: 4 }]);
    expect(tx.stockMovement.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['legacy-orfano'] } },
    });
    expect(tx.stockMovement.create).not.toHaveBeenCalled();
  });

  it('10 · righe non movimentabili: servizi e descrittive non generano movimenti', async () => {
    const tx = createTxMock();

    await run(tx, [
      line({ id: 'line-serv', variantId: null, quantity: 1 }),
      line({ id: 'line-zero', quantity: 0 }),
      line({ id: 'line-nostock', loadsStock: false }),
    ]);

    expect(tx.stockMovement.create).not.toHaveBeenCalled();
    expect(inventoryDeltas(tx)).toEqual([]);
  });

  it('11 · spunta magazzino tolta: il movimento della riga sparisce', async () => {
    const tx = createTxMock([existingMovement({ quantity: 3 })]);

    await run(tx, [line({ quantity: 3, loadsStock: false })]);

    expect(tx.stockMovement.delete).toHaveBeenCalledWith({ where: { id: 'mov-1' } });
    expect(inventoryDeltas(tx)).toEqual([{ variantId: 'var-1', locationId: 'loc-1', delta: 3 }]);
  });

  it('12 · annullamento: righe vuote rimuovono tutto e restituiscono la giacenza', async () => {
    const tx = createTxMock([
      existingMovement({ id: 'mov-1', sourceLineId: 'line-1', quantity: 3 }),
      existingMovement({ id: 'mov-2', sourceLineId: 'line-2', quantity: 2, variantId: 'var-2' }),
    ]);

    const result = await run(tx, []);

    expect(tx.stockMovement.delete).toHaveBeenCalledTimes(2);
    expect(inventoryDeltas(tx)).toEqual([
      { variantId: 'var-1', locationId: 'loc-1', delta: 3 },
      { variantId: 'var-2', locationId: 'loc-1', delta: 2 },
    ]);
    expect(result.deltas).toEqual([
      { sku: 'SKU-1', delta: 3 },
      { sku: 'SKU-1', delta: 2 },
    ]);
  });

  it('13 · il tenant è nel filtro di ogni lettura di movimenti', async () => {
    const tx = createTxMock();

    await run(tx, [line()]);

    for (const call of tx.stockMovement.findMany.mock.calls) {
      expect((call[0] as { where: { tenantId: string } }).where.tenantId).toBe(tenantId);
    }
  });

  it('14 · la causale non cambia parole rispetto al percorso precedente', () => {
    expect(
      buildUnloadMovementReason({
        documentType: DocumentType.sales_ddt,
        reference: 'DDT-0005',
        fallbackLabel: 'sales_ddt',
      }),
    ).toBe('DDT vendita DDT-0005');
    expect(
      buildUnloadMovementReason({
        documentType: DocumentType.invoice_accompanying,
        reference: 'FTA-0003',
        fallbackLabel: 'invoice_accompanying',
      }),
    ).toBe('Fattura accompagnatoria FTA-0003');
  });

  it('15 · il caso della schermata: da 3 a 2 resta una sola Vendita −2', async () => {
    // Riproduce esattamente il DDT-0005 che ha fatto emergere il difetto: nel
    // registro comparivano «Vendita −3» e «Carico +1 · rettifica scarico -1».
    const tx = createTxMock([existingMovement({ quantity: 3 })]);

    await run(tx, [line({ quantity: 2 })]);

    expect(tx.stockMovement.create).not.toHaveBeenCalled();
    expect(tx.stockMovement.delete).not.toHaveBeenCalled();
    const update = tx.stockMovement.update.mock.calls[0]![0] as {
      where: { id: string };
      data: { quantity: number; reason: string };
    };
    expect(update.where.id).toBe('mov-1');
    expect(update.data.quantity).toBe(2);
    expect(update.data.reason).toBe('DDT vendita DDT-0005');
  });

  // ── Origine e costo: i due parametri che aprono il sync alla Vendita al banco ──
  // Il tipo, la data, la causale e il filtro di riga c'erano gia'. Questi due no,
  // ed erano l'unica ragione per cui la cassa scriveva i movimenti per conto suo.

  it('16 · senza parametri: origine manual e nessun costo — i chiamanti storici non cambiano', async () => {
    const tx = createTxMock();

    await run(tx, [line()]);

    const created = tx.stockMovement.create.mock.calls[0]![0] as {
      data: { origin: string; unitCostMinor: number | null; totalCostMinor: number | null };
    };
    expect(created.data.origin).toBe(MovementOrigin.manual);
    expect(created.data.unitCostMinor).toBeNull();
    expect(created.data.totalCostMinor).toBeNull();
  });

  it('17 · con origin e costo: il movimento nuovo nasce vestiflow_pos col costo congelato', async () => {
    const tx = createTxMock();

    await syncUnloadLineMovements(tx as never, {
      tenantId,
      documentId,
      documentType: DocumentType.store_sale,
      locationId: 'loc-1',
      reason: 'Vendita al banco VB-0001',
      origin: MovementOrigin.vestiflow_pos,
      unitCostForNewLine: () => 500,
      lines: [line({ quantity: 3 })] as never,
      actor,
    });

    const created = tx.stockMovement.create.mock.calls[0]![0] as {
      data: { origin: string; unitCostMinor: number; totalCostMinor: number };
    };
    expect(created.data.origin).toBe(MovementOrigin.vestiflow_pos);
    expect(created.data.unitCostMinor).toBe(500);
    expect(created.data.totalCostMinor).toBe(1500);
  });

  it('18 · riga GIA presente: il costo unitario congelato non si rivaluta, il totale si rifa', async () => {
    // La distinzione decisa in `11` A2: rivalutare il costo di una riga vecchia
    // cambierebbe il margine di una vendita di marzo col costo di agosto.
    const tx = createTxMock([existingMovement({ quantity: 3, unitCostMinor: 500, totalCostMinor: 1500 })]);

    await syncUnloadLineMovements(tx as never, {
      tenantId,
      documentId,
      documentType: DocumentType.store_sale,
      locationId: 'loc-1',
      reason,
      origin: MovementOrigin.vestiflow_pos,
      // il costo corrente e' cambiato: NON deve entrare su una riga gia' presente
      unitCostForNewLine: () => 900,
      lines: [line({ quantity: 1 })] as never,
      actor,
    });

    expect(tx.stockMovement.create).not.toHaveBeenCalled();
    const update = tx.stockMovement.update.mock.calls[0]![0] as {
      data: { quantity: number; totalCostMinor: number; unitCostMinor?: number };
    };
    expect(update.data.quantity).toBe(1);
    expect(update.data.totalCostMinor).toBe(500);
    expect(update.data).not.toHaveProperty('unitCostMinor');
  });
});
