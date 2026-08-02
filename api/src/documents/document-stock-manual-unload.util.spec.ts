import type { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  applyDocumentStockManualUnloads,
  reconcileDocumentStockManualUnload,
} from './document-stock-manual-unload.util';

/**
 * Lo scarico manuale è una DEROGA esplicita alla regola «ogni modifica
 * inventariale produce un movimento tracciabile»: agisce direttamente sulla
 * giacenza e non crea `StockMovement`.
 *
 * Questi test fissano la deroga, e in particolare che valga **allo stesso modo
 * per un cliente solo gestionale e per uno collegato a Shopify**: nel percorso
 * della giacenza non esiste alcuna condizione sul profilo canale. Il push verso
 * i canali è un fatto separato, post-commit, che legge la giacenza e non i
 * movimenti.
 */

/** Client di transazione minimo: registra le chiamate senza toccare un DB. */
function createTx() {
  const upsert = vi.fn().mockResolvedValue({});
  const updateMany = vi.fn().mockResolvedValue({ count: 1 });
  const findUnique = vi.fn().mockResolvedValue({ onHand: 100, available: 100 });
  const movementCreate = vi.fn().mockResolvedValue({});

  const tx = {
    inventoryLevel: { upsert, updateMany, findUnique },
    stockMovement: { create: movementCreate },
  } as unknown as Prisma.TransactionClient;

  return { tx, upsert, updateMany, findUnique, movementCreate };
}

function line(over: Partial<Record<string, unknown>> = {}) {
  return {
    variantId: 'var-1',
    sku: 'SKU-1',
    quantity: 3,
    loadsStock: true,
    ...over,
  } as never;
}

/** Somma i delta applicati a una variante su una location. */
function appliedDeltas(updateMany: ReturnType<typeof vi.fn>) {
  return updateMany.mock.calls.map(([arg]) => {
    const call = arg as {
      where: { variantId: string; locationId: string };
      data: { onHand?: { increment?: number } };
    };
    return {
      variantId: call.where.variantId,
      locationId: call.where.locationId,
      delta: call.data.onHand?.increment,
    };
  });
}

describe('applyDocumentStockManualUnloads', () => {
  let t: ReturnType<typeof createTx>;

  beforeEach(() => {
    t = createTx();
  });

  it('non crea MAI movimenti di magazzino', async () => {
    await applyDocumentStockManualUnloads(t.tx, {
      tenantId: 'tenant-1',
      locationId: 'loc-1',
      lines: [line()],
    });

    expect(t.movementCreate).not.toHaveBeenCalled();
  });

  it('sottrae la quantità dalla giacenza della location del documento', async () => {
    const result = await applyDocumentStockManualUnloads(t.tx, {
      tenantId: 'tenant-1',
      locationId: 'loc-1',
      lines: [line({ quantity: 3 })],
    });

    expect(appliedDeltas(t.updateMany)).toEqual([
      { variantId: 'var-1', locationId: 'loc-1', delta: -3 },
    ]);
    expect(result.deltas).toEqual([{ sku: 'SKU-1', delta: -3 }]);
  });

  it('accorpa più righe sulla stessa variante in un unico scarico', async () => {
    await applyDocumentStockManualUnloads(t.tx, {
      tenantId: 'tenant-1',
      locationId: 'loc-1',
      lines: [line({ quantity: 2 }), line({ quantity: 5 })],
    });

    expect(appliedDeltas(t.updateMany)).toEqual([
      { variantId: 'var-1', locationId: 'loc-1', delta: -7 },
    ]);
  });

  it('ignora le righe che non movimentano stock', async () => {
    await applyDocumentStockManualUnloads(t.tx, {
      tenantId: 'tenant-1',
      locationId: 'loc-1',
      lines: [
        line({ loadsStock: false }),
        line({ variantId: null, sku: 'SRV' }),
        line({ quantity: 0 }),
      ],
    });

    expect(t.updateMany).not.toHaveBeenCalled();
    expect(t.movementCreate).not.toHaveBeenCalled();
  });

  // Policy non bloccante: l'avviso su quantità oltre la giacenza è della UI,
  // il salvataggio non deve rifiutarla.
  it('ammette quantità superiori alla giacenza disponibile', async () => {
    t.findUnique.mockResolvedValue({ onHand: 2, available: 2 });

    await expect(
      applyDocumentStockManualUnloads(t.tx, {
        tenantId: 'tenant-1',
        locationId: 'loc-1',
        lines: [line({ quantity: 50 })],
      }),
    ).resolves.toBeDefined();
  });
});

describe('reconcileDocumentStockManualUnload', () => {
  let t: ReturnType<typeof createTx>;

  beforeEach(() => {
    t = createTx();
  });

  const base = {
    tenantId: 'tenant-1',
    oldLocationId: 'loc-1',
    newLocationId: 'loc-1',
  };

  it('non crea movimenti nemmeno in modifica', async () => {
    await reconcileDocumentStockManualUnload(t.tx, {
      ...base,
      oldLines: [line({ quantity: 3 })],
      newLines: [line({ quantity: 5 })],
    });

    expect(t.movementCreate).not.toHaveBeenCalled();
  });

  it('quantità aumentata: scarica solo la differenza, non l’intero nuovo valore', async () => {
    // 3 → 5 deve scaricare 2, non 5: altrimenti doppia sottrazione.
    await reconcileDocumentStockManualUnload(t.tx, {
      ...base,
      oldLines: [line({ quantity: 3 })],
      newLines: [line({ quantity: 5 })],
    });

    expect(appliedDeltas(t.updateMany)).toEqual([
      { variantId: 'var-1', locationId: 'loc-1', delta: -2 },
    ]);
  });

  it('quantità diminuita: restituisce la differenza alla giacenza', async () => {
    // 5 → 3 ricarica 2.
    await reconcileDocumentStockManualUnload(t.tx, {
      ...base,
      oldLines: [line({ quantity: 5 })],
      newLines: [line({ quantity: 3 })],
    });

    expect(appliedDeltas(t.updateMany)).toEqual([
      { variantId: 'var-1', locationId: 'loc-1', delta: 2 },
    ]);
  });

  it('quantità invariata: nessun tocco alla giacenza', async () => {
    await reconcileDocumentStockManualUnload(t.tx, {
      ...base,
      oldLines: [line({ quantity: 4 })],
      newLines: [line({ quantity: 4 })],
    });

    expect(t.updateMany).not.toHaveBeenCalled();
  });

  it('riga rimossa: restituisce tutta la quantità scaricata', async () => {
    await reconcileDocumentStockManualUnload(t.tx, {
      ...base,
      oldLines: [line({ quantity: 6 })],
      newLines: [],
    });

    expect(appliedDeltas(t.updateMany)).toEqual([
      { variantId: 'var-1', locationId: 'loc-1', delta: 6 },
    ]);
  });

  it('cambio location: ripristina sulla vecchia e scarica sulla nuova', async () => {
    await reconcileDocumentStockManualUnload(t.tx, {
      tenantId: 'tenant-1',
      oldLocationId: 'loc-1',
      newLocationId: 'loc-2',
      oldLines: [line({ quantity: 3 })],
      newLines: [line({ quantity: 3 })],
    });

    expect(appliedDeltas(t.updateMany)).toEqual([
      { variantId: 'var-1', locationId: 'loc-1', delta: 3 },
      { variantId: 'var-1', locationId: 'loc-2', delta: -3 },
    ]);
  });

  it('cambio location con quantità diversa: intero ripristino e intero nuovo scarico', async () => {
    await reconcileDocumentStockManualUnload(t.tx, {
      tenantId: 'tenant-1',
      oldLocationId: 'loc-1',
      newLocationId: 'loc-2',
      oldLines: [line({ quantity: 3 })],
      newLines: [line({ quantity: 8 })],
    });

    expect(appliedDeltas(t.updateMany)).toEqual([
      { variantId: 'var-1', locationId: 'loc-1', delta: 3 },
      { variantId: 'var-1', locationId: 'loc-2', delta: -8 },
    ]);
  });

  it('variante sostituita: restituisce la vecchia e scarica la nuova', async () => {
    await reconcileDocumentStockManualUnload(t.tx, {
      ...base,
      oldLines: [line({ variantId: 'var-1', quantity: 2 })],
      newLines: [line({ variantId: 'var-2', sku: 'SKU-2', quantity: 4 })],
    });

    expect(appliedDeltas(t.updateMany)).toEqual(
      expect.arrayContaining([
        { variantId: 'var-1', locationId: 'loc-1', delta: 2 },
        { variantId: 'var-2', locationId: 'loc-1', delta: -4 },
      ]),
    );
  });
});
