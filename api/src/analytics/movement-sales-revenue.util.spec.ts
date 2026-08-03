import { DocumentType, StockMovementType } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import {
  movementRevenueMinor,
  onlineOriginalKey,
  type RevenueLineMaps,
  type SaleMovementLike,
} from './movement-sales-revenue.util';

const maps: RevenueLineMaps = {
  documentLineTotal: new Map([['doc-line-1', 2990]]),
  onlineSaleLineTotal: new Map([['online-line-1', 4500]]),
  onlineOriginalUnitPrice: new Map([[onlineOriginalKey('sale-9', 'var-1'), 1500]]),
};

function movement(overrides: Partial<SaleMovementLike>): SaleMovementLike {
  return {
    type: StockMovementType.sale,
    variantId: 'var-1',
    quantity: 1,
    sourceDocumentType: DocumentType.store_sale,
    sourceDocumentId: 'doc-1',
    sourceLineId: 'doc-line-1',
    ...overrides,
  };
}

describe('movementRevenueMinor', () => {
  it('vendita POS: ricavo dalla riga documento collegata', () => {
    expect(movementRevenueMinor(movement({}), maps)).toBe(2990);
  });

  it('vendita online: ricavo dalla riga OnlineSale collegata', () => {
    const revenue = movementRevenueMinor(
      movement({
        type: StockMovementType.online_sale,
        sourceDocumentType: DocumentType.online_sale,
        sourceLineId: 'online-line-1',
      }),
      maps,
    );
    expect(revenue).toBe(4500);
  });

  it('reso online (nessuna riga): prezzo vendita originale × quantità', () => {
    const revenue = movementRevenueMinor(
      movement({
        type: StockMovementType.return,
        sourceDocumentType: DocumentType.online_sale,
        sourceDocumentId: 'sale-9',
        sourceLineId: null,
        quantity: 2,
      }),
      maps,
    );
    expect(revenue).toBe(3000);
  });

  it('reso POS: dalla riga del documento di reso', () => {
    const revenue = movementRevenueMinor(
      movement({
        type: StockMovementType.return,
        sourceDocumentType: DocumentType.store_return,
        sourceLineId: 'doc-line-1',
      }),
      maps,
    );
    expect(revenue).toBe(2990);
  });

  it('riga non risolvibile → 0 (movimento storico senza documento)', () => {
    expect(
      movementRevenueMinor(movement({ sourceLineId: 'sconosciuta' }), maps),
    ).toBe(0);
    expect(
      movementRevenueMinor(
        movement({
          type: StockMovementType.return,
          sourceDocumentType: DocumentType.online_sale,
          sourceDocumentId: 'sale-ignoto',
          sourceLineId: null,
        }),
        maps,
      ),
    ).toBe(0);
  });
});
