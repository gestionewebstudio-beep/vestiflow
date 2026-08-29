import { describe, expect, it } from 'vitest';

import {
  SUPPLIER_ORDER_PREFILL_STATE_KEY,
  readSupplierOrderPrefill,
} from './supplier-order-prefill.model';

/** Lo stato di navigazione come lo scrive la Situazione magazzino. */
function stato(payload: unknown): unknown {
  return { [SUPPLIER_ORDER_PREFILL_STATE_KEY]: payload };
}

describe('readSupplierOrderPrefill', () => {
  it('⭐ legge fornitore e varianti da uno stato ben formato', () => {
    const letto = readSupplierOrderPrefill(
      stato({ supplierId: 'sup-1', variantIds: ['v1', 'v2', 'v3'] }),
    );

    expect(letto).toEqual({ supplierId: 'sup-1', variantIds: ['v1', 'v2', 'v3'] });
  });

  it('⭐ conserva l’ORDINE delle varianti: è l’ordine delle righe che l’operatore vedrà', () => {
    const letto = readSupplierOrderPrefill(stato({ supplierId: 's', variantIds: ['c', 'a', 'b'] }));

    expect(letto?.variantIds).toEqual(['c', 'a', 'b']);
  });

  it('scarta le voci non stringa o vuote, e tiene il resto', () => {
    const letto = readSupplierOrderPrefill(
      stato({ supplierId: 's', variantIds: ['v1', '', null, 42, 'v2', undefined] }),
    );

    expect(letto?.variantIds).toEqual(['v1', 'v2']);
  });

  it.each([
    ['stato assente', undefined],
    ['stato nullo', null],
    ['stato non oggetto', 'niente'],
    ['chiave assente', { altro: 1 }],
    ['payload nullo', stato(null)],
    ['fornitore mancante', stato({ variantIds: ['v1'] })],
    ['fornitore vuoto', stato({ supplierId: '', variantIds: ['v1'] })],
    ['fornitore non stringa', stato({ supplierId: 7, variantIds: ['v1'] })],
    ['varianti mancanti', stato({ supplierId: 's' })],
    ['varianti non array', stato({ supplierId: 's', variantIds: 'v1' })],
    ['varianti vuote', stato({ supplierId: 's', variantIds: [] })],
    ['varianti tutte scartate', stato({ supplierId: 's', variantIds: ['', null] })],
  ])('⛔ %s → nessun precompilato', (_nome, ingresso) => {
    // ⚠️ `null` e non un oggetto a metà: la maschera deve aprirsi VUOTA, non
    //    con un fornitore senza righe o con righe senza fornitore.
    expect(readSupplierOrderPrefill(ingresso)).toBeNull();
  });

  it('⛔ non si fida della navigazione ordinaria: aprire /orders/new a mano non precompila', () => {
    // È il caso normale — nessuno stato — e deve restare silenzioso.
    expect(readSupplierOrderPrefill({})).toBeNull();
  });
});
