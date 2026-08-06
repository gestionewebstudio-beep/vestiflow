import { UnprocessableEntityException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { loadStockLineVariantsOrThrow } from './document-line-variants.util';

function line(over: Partial<Record<string, unknown>> = {}) {
  return {
    variantId: 'var-1',
    quantity: 1,
    loadsStock: true,
    lineNumber: 1,
    ...over,
  } as never;
}

function txWith(variants: readonly { id: string; sku: string | null }[]) {
  const findMany = vi.fn().mockResolvedValue(variants);
  return { tx: { productVariant: { findMany } } as never, findMany };
}

describe('loadStockLineVariantsOrThrow', () => {
  it('non interroga il DB senza righe a stock', async () => {
    const { tx, findMany } = txWith([]);

    const result = await loadStockLineVariantsOrThrow(tx, 'tenant-1', [
      line({ loadsStock: false }),
      line({ quantity: 0, lineNumber: 2 }),
      line({ variantId: null, lineNumber: 3 }),
    ]);

    expect(result.size).toBe(0);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('legge tutte le varianti con una sola query, deduplicando gli id', async () => {
    const { tx, findMany } = txWith([{ id: 'var-1', sku: 'SKU-1' }]);

    await loadStockLineVariantsOrThrow(tx, 'tenant-1', [
      line({ lineNumber: 1 }),
      line({ lineNumber: 2 }),
      line({ lineNumber: 3 }),
    ]);

    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ['var-1'] }, tenantId: 'tenant-1' },
      }),
    );
  });

  it('restituisce una mappa id → variante', async () => {
    const { tx } = txWith([
      { id: 'var-1', sku: 'SKU-1' },
      { id: 'var-2', sku: null },
    ]);

    const result = await loadStockLineVariantsOrThrow(tx, 'tenant-1', [
      line({ variantId: 'var-1', lineNumber: 1 }),
      line({ variantId: 'var-2', lineNumber: 2 }),
    ]);

    expect(result.get('var-1')).toEqual({ id: 'var-1', sku: 'SKU-1' });
    expect(result.get('var-2')).toEqual({ id: 'var-2', sku: null });
  });

  it('solleva citando la PRIMA riga con variante mancante', async () => {
    const { tx } = txWith([{ id: 'var-1', sku: 'SKU-1' }]);

    await expect(
      loadStockLineVariantsOrThrow(tx, 'tenant-1', [
        line({ variantId: 'var-1', lineNumber: 1 }),
        line({ variantId: 'var-assente', lineNumber: 7 }),
        line({ variantId: 'var-pure-assente', lineNumber: 9 }),
      ]),
    ).rejects.toThrow('Variante non trovata per la riga 7.');
  });

  it('ignora le righe che non movimentano stock nella validazione', async () => {
    const { tx } = txWith([{ id: 'var-1', sku: 'SKU-1' }]);

    await expect(
      loadStockLineVariantsOrThrow(tx, 'tenant-1', [
        line({ variantId: 'var-1', lineNumber: 1 }),
        line({ variantId: 'var-assente', lineNumber: 2, loadsStock: false }),
      ]),
    ).resolves.toBeInstanceOf(Map);
  });

  it('l’errore è un UnprocessableEntityException', async () => {
    const { tx } = txWith([]);

    await expect(
      loadStockLineVariantsOrThrow(tx, 'tenant-1', [line()]),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });
});
