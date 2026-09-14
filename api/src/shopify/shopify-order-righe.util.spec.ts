import { describe, expect, it } from 'vitest';

import { quantitaCorrentePerRiga, spedizioniDelPayload } from './shopify-order-righe.util';

describe('quantitaCorrentePerRiga', () => {
  it('senza rimborsi la corrente è la quantità ordinata', () => {
    const q = quantitaCorrentePerRiga({ line_items: [{ id: 1, quantity: 3 }] });
    expect(q.get('1')).toBe(3);
  });

  it('`current_quantity`, se presente, vince sul calcolo', () => {
    const q = quantitaCorrentePerRiga({
      line_items: [{ id: 1, quantity: 3, current_quantity: 2 }],
      // Un `cancel` da 3 contraddirebbe: il payload dice 2, e 2 resta.
      refunds: [{ refund_line_items: [{ line_item_id: 1, quantity: 3, restock_type: 'cancel' }] }],
    });
    expect(q.get('1')).toBe(2);
  });

  it('senza `current_quantity`, si sottraggono SOLO i `cancel` di quella riga', () => {
    const q = quantitaCorrentePerRiga({
      line_items: [
        { id: 1, quantity: 3 },
        { id: 2, quantity: 5 },
      ],
      refunds: [
        {
          refund_line_items: [
            { line_item_id: 1, quantity: 1, restock_type: 'cancel' },
            // Un reso dopo la spedizione NON riduce la quantità ordinata.
            { line_item_id: 2, quantity: 2, restock_type: 'return' },
            { line_item_id: 2, quantity: 1, restock_type: 'no_restock' },
          ],
        },
        { refund_line_items: [{ line_item_id: 1, quantity: 1, restock_type: 'cancel' }] },
      ],
    });
    expect(q.get('1')).toBe(1);
    expect(q.get('2')).toBe(5);
  });

  it('non scende sotto zero e tollera quantità non numeriche', () => {
    const q = quantitaCorrentePerRiga({
      line_items: [{ id: 1, quantity: 1 }, { id: 2, quantity: 'x' }, { quantity: 4 }],
      refunds: [{ refund_line_items: [{ line_item_id: 1, quantity: 5, restock_type: 'cancel' }] }],
    });
    expect(q.get('1')).toBe(0);
    expect(q.get('2')).toBe(0);
    // Riga senza id: la stessa chiave posizionale del connettore.
    expect(q.get('pos-2')).toBe(4);
  });
});

describe('spedizioniDelPayload', () => {
  it("un'evasione per fulfillment riuscito, nell'ordine del payload, con sede, data e righe", () => {
    const s = spedizioniDelPayload({
      fulfillments: [
        {
          id: 100,
          status: 'success',
          location_id: 11,
          created_at: '2026-09-12T10:00:00Z',
          line_items: [{ id: 1, quantity: 1 }],
        },
        {
          admin_graphql_api_id: 'gid://shopify/Fulfillment/101',
          status: 'success',
          location_id: 22,
          created_at: '2026-09-12T11:00:00Z',
          line_items: [
            { id: 1, quantity: 2 },
            { id: 2, quantity: 1 },
          ],
        },
      ],
    });
    expect(s).toEqual([
      {
        externalFulfillmentId: '100',
        shopifyLocationId: '11',
        createdAt: new Date('2026-09-12T10:00:00Z'),
        righe: [{ externalLineId: '1', quantity: 1 }],
      },
      {
        externalFulfillmentId: 'gid://shopify/Fulfillment/101',
        shopifyLocationId: '22',
        createdAt: new Date('2026-09-12T11:00:00Z'),
        righe: [
          { externalLineId: '1', quantity: 2 },
          { externalLineId: '2', quantity: 1 },
        ],
      },
    ]);
  });

  it("un'evasione annullata o fallita non conta; senza `status` si assume riuscita", () => {
    const s = spedizioniDelPayload({
      fulfillments: [
        { id: 1, status: 'cancelled', location_id: 11, line_items: [{ id: 1, quantity: 2 }] },
        { id: 2, status: 'failure', location_id: 11, line_items: [{ id: 1, quantity: 2 }] },
        { id: 3, location_id: 33, line_items: [{ id: 1, quantity: 1 }] },
      ],
    });
    expect(s.map((e) => e.externalFulfillmentId)).toEqual(['3']);
  });

  it('senza sede la spedizione resta (sede null); senza id o senza righe con quantità sparisce', () => {
    const s = spedizioniDelPayload({
      fulfillments: [
        { id: 1, status: 'success', location_id: null, line_items: [{ id: 1, quantity: 2 }] },
        { status: 'success', location_id: 11, line_items: [{ id: 1, quantity: 2 }] },
        {
          id: 3,
          status: 'success',
          location_id: 11,
          line_items: [{ id: 1, quantity: 0 }, { quantity: 4 }],
        },
      ],
    });
    expect(s).toEqual([
      {
        externalFulfillmentId: '1',
        shopifyLocationId: null,
        createdAt: null,
        righe: [{ externalLineId: '1', quantity: 2 }],
      },
    ]);
  });

  it('senza `fulfillments` è vuota', () => {
    expect(spedizioniDelPayload({})).toEqual([]);
  });
});
