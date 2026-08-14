import { describe, expect, it } from 'vitest';

import { mapShopifyRefunds } from './shopify-refund.util';

const FALLBACK = new Date('2026-08-14T10:00:00.000Z');

describe('mapShopifyRefunds', () => {
  it('ordine senza rimborsi non produce righe', () => {
    expect(mapShopifyRefunds({}, FALLBACK)).toEqual([]);
    expect(mapShopifyRefunds({ refunds: [] }, FALLBACK)).toEqual([]);
  });

  it('legge il reso misurato sul negozio di prova (#1006, prezzi ivati)', () => {
    // Payload reale ridotto: reso di una riga da 60,00 € con IVA 4% inclusa.
    const rows = mapShopifyRefunds(
      {
        taxes_included: true,
        refunds: [
          {
            id: 1049158746407,
            created_at: '2026-08-14T14:18:31+02:00',
            processed_at: '2026-08-14T14:18:31+02:00',
            note: 'Reso taglia sbagliata',
            order_adjustments: [],
            refund_line_items: [
              { line_item_id: 18048181797159, quantity: 1, subtotal: 60, total_tax: 2.31 },
            ],
          },
        ],
      },
      FALLBACK,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      externalRefundId: '1049158746407',
      subtotalMinor: 6000,
      taxMinor: 231,
      shippingMinor: 0,
      // Prezzi ivati: l'imposta è già dentro il subtotale, non si somma.
      totalMinor: 6000,
      note: 'Reso taglia sbagliata',
    });
    expect(rows[0]?.occurredAt.toISOString()).toBe('2026-08-14T12:18:31.000Z');
  });

  it('su prezzi netti somma l imposta al totale', () => {
    const [row] = mapShopifyRefunds(
      {
        taxes_included: false,
        refunds: [
          {
            id: 1,
            processed_at: '2026-08-14T00:00:00Z',
            refund_line_items: [{ subtotal: '100.00', total_tax: '22.00' }],
          },
        ],
      },
      FALLBACK,
    );

    expect(row).toMatchObject({ subtotalMinor: 10000, taxMinor: 2200, totalMinor: 12200 });
  });

  it('somma piu righe dello stesso rimborso', () => {
    const [row] = mapShopifyRefunds(
      {
        taxes_included: true,
        refunds: [
          {
            id: 7,
            processed_at: '2026-08-14T00:00:00Z',
            refund_line_items: [
              { subtotal: '10.00', total_tax: '0.38' },
              { subtotal: '25.50', total_tax: '0.98' },
            ],
          },
        ],
      },
      FALLBACK,
    );

    expect(row).toMatchObject({ subtotalMinor: 3550, taxMinor: 136, totalMinor: 3550 });
  });

  it('la spedizione resa arriva negativa e va sottratta, non aggiunta', () => {
    const [row] = mapShopifyRefunds(
      {
        taxes_included: true,
        refunds: [
          {
            id: 9,
            processed_at: '2026-08-14T00:00:00Z',
            refund_line_items: [{ subtotal: '60.00', total_tax: '2.31' }],
            order_adjustments: [{ kind: 'shipping_refund', amount: '-4.90', tax_amount: '-0.19' }],
          },
        ],
      },
      FALLBACK,
    );

    expect(row).toMatchObject({
      subtotalMinor: 6000,
      shippingMinor: 490,
      taxMinor: 231 + 19,
      totalMinor: 6490,
    });
  });

  it('senza data usa quella dell ordine, mai «adesso»', () => {
    const [row] = mapShopifyRefunds(
      { refunds: [{ id: 3, refund_line_items: [{ subtotal: '1.00' }] }] },
      FALLBACK,
    );

    expect(row?.occurredAt).toEqual(FALLBACK);
  });

  it('preferisce processed_at a created_at', () => {
    const [row] = mapShopifyRefunds(
      {
        refunds: [
          {
            id: 4,
            created_at: '2026-08-01T00:00:00Z',
            processed_at: '2026-08-09T00:00:00Z',
            refund_line_items: [],
          },
        ],
      },
      FALLBACK,
    );

    expect(row?.occurredAt.toISOString()).toBe('2026-08-09T00:00:00.000Z');
  });

  it('rimborso senza id viene ignorato: non avrebbe chiave di idempotenza', () => {
    expect(
      mapShopifyRefunds({ refunds: [{ refund_line_items: [{ subtotal: '5.00' }] }] }, FALLBACK),
    ).toEqual([]);
  });
});
