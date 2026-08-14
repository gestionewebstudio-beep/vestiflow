import { describe, expect, it } from 'vitest';

import { mapShopifyRefunds } from './shopify-refund.util';

const FALLBACK = new Date('2026-08-14T10:00:00.000Z');

describe('mapShopifyRefunds', () => {
  it('ordine senza rimborsi non produce righe', () => {
    expect(mapShopifyRefunds({}, FALLBACK)).toEqual([]);
    expect(mapShopifyRefunds({ refunds: [] }, FALLBACK)).toEqual([]);
  });

  it('reso pieno misurato su #1006 (prezzi ivati)', () => {
    const [row] = mapShopifyRefunds(
      {
        taxes_included: true,
        refunds: [
          {
            id: 1049158746407,
            processed_at: '2026-08-14T14:18:31+02:00',
            note: 'Reso taglia sbagliata',
            order_adjustments: [],
            refund_line_items: [
              {
                quantity: 1,
                subtotal: 60,
                total_tax: 2.31,
                restock_type: 'return',
                line_item: { tax_lines: [{ rate: 0.04, price: '2.31' }] },
              },
            ],
          },
        ],
      },
      FALLBACK,
    );

    expect(row).toMatchObject({
      externalRefundId: '1049158746407',
      kind: 'return',
      subtotalMinor: 6000,
      taxMinor: 231,
      shippingMinor: 0,
      adjustmentMinor: 0,
      // Prezzi ivati: l'imposta è già dentro il subtotale, non si somma.
      totalMinor: 6000,
      note: 'Reso taglia sbagliata',
    });
    expect(row?.taxLines).toEqual([{ ratePercent: 4, taxableMinor: 5769, taxMinor: 231 }]);
  });

  describe('#1008 — il caso che ha smentito la prima versione', () => {
    // Payload reale del 14/08/2026: riga al 4% resa + spedizione al 22% resa.
    const primoRimborso = {
      taxes_included: true,
      refunds: [
        {
          id: 1049183420711,
          processed_at: '2026-08-14T19:17:45+02:00',
          refund_line_items: [
            {
              quantity: 1,
              subtotal: 54,
              total_tax: 2.08,
              restock_type: 'return',
              line_item: { tax_lines: [{ rate: 0.04, price: '2.08' }] },
            },
          ],
          order_adjustments: [{ kind: 'shipping_refund', amount: '-21.32', tax_amount: '-4.69' }],
        },
      ],
    };

    it('la spedizione arriva NETTA e va sommata con la sua imposta', () => {
      const [row] = mapShopifyRefunds(primoRimborso, FALLBACK);

      // 21,32 netto + 4,69 imposta = 26,01 lordo. Trattare `amount` come lordo
      // — la regola delle righe — dava 75,32 invece di 80,01.
      expect(row?.shippingMinor).toBe(2601);
      expect(row?.totalMinor).toBe(8001);
      expect(row?.taxMinor).toBe(677);
      expect(row?.subtotalMinor).toBe(5400);
      expect(row?.adjustmentMinor).toBe(0);
    });

    it('tiene separate le due aliquote invece di fonderle in un totale', () => {
      const [row] = mapShopifyRefunds(primoRimborso, FALLBACK);

      expect(row?.taxLines).toEqual([
        // La spedizione non dichiara l'aliquota: resta muta, non indovinata.
        { ratePercent: null, taxableMinor: 2132, taxMinor: 469 },
        { ratePercent: 4, taxableMinor: 5192, taxMinor: 208 },
      ]);
    });

    it('il rimborso a importo libero non è una spedizione', () => {
      const [row] = mapShopifyRefunds(
        {
          taxes_included: true,
          refunds: [
            {
              id: 1049185059111,
              processed_at: '2026-08-14T19:30:28+02:00',
              refund_line_items: [],
              order_adjustments: [
                { kind: 'refund_discrepancy', amount: '-5.00', tax_amount: '0.00' },
              ],
            },
          ],
        },
        FALLBACK,
      );

      expect(row).toMatchObject({
        kind: 'refund',
        subtotalMinor: 0,
        shippingMinor: 0,
        adjustmentMinor: 500,
        totalMinor: 500,
        taxMinor: 0,
      });
      // Shopify stesso avverte che senza righe l'imposta non è attribuibile.
      expect(row?.taxLines).toEqual([{ ratePercent: null, taxableMinor: 500, taxMinor: 0 }]);
    });
  });

  describe('natura della rettifica', () => {
    const conRighe = (types: readonly string[]) => ({
      refunds: [
        {
          id: 1,
          processed_at: '2026-08-14T00:00:00Z',
          refund_line_items: types.map((restock_type) => ({
            subtotal: '10.00',
            total_tax: '0',
            restock_type,
          })),
        },
      ],
    });

    it('tutte le righe «cancel» ⇒ annullamento, non reso', () => {
      expect(mapShopifyRefunds(conRighe(['cancel', 'cancel']), FALLBACK)[0]?.kind).toBe(
        'cancellation',
      );
    });

    it('una sola riga con rientro fisico ⇒ reso', () => {
      expect(mapShopifyRefunds(conRighe(['no_restock', 'return']), FALLBACK)[0]?.kind).toBe(
        'return',
      );
      expect(mapShopifyRefunds(conRighe(['legacy_restock']), FALLBACK)[0]?.kind).toBe('return');
    });

    it('nessun rientro dichiarato ⇒ rimborso e basta', () => {
      expect(mapShopifyRefunds(conRighe(['no_restock']), FALLBACK)[0]?.kind).toBe('refund');
    });

    it('senza righe ⇒ rimborso, mai annullamento', () => {
      const senzaRighe = mapShopifyRefunds(
        { refunds: [{ id: 2, processed_at: '2026-08-14T00:00:00Z', refund_line_items: [] }] },
        FALLBACK,
      );
      expect(senzaRighe[0]?.kind).toBe('refund');
    });
  });

  it('su prezzi netti somma l imposta di riga al totale', () => {
    const [row] = mapShopifyRefunds(
      {
        taxes_included: false,
        refunds: [
          {
            id: 1,
            processed_at: '2026-08-14T00:00:00Z',
            refund_line_items: [
              {
                subtotal: '100.00',
                total_tax: '22.00',
                restock_type: 'return',
                line_item: { tax_lines: [{ rate: 0.22 }] },
              },
            ],
          },
        ],
      },
      FALLBACK,
    );

    expect(row).toMatchObject({ subtotalMinor: 10000, taxMinor: 2200, totalMinor: 12200 });
    expect(row?.taxLines).toEqual([{ ratePercent: 22, taxableMinor: 10000, taxMinor: 2200 }]);
  });

  it('due righe alla stessa aliquota fanno una voce sola', () => {
    const [row] = mapShopifyRefunds(
      {
        taxes_included: true,
        refunds: [
          {
            id: 7,
            processed_at: '2026-08-14T00:00:00Z',
            refund_line_items: [
              { subtotal: '10.00', total_tax: '0.38', line_item: { tax_lines: [{ rate: 0.04 }] } },
              { subtotal: '25.50', total_tax: '0.98', line_item: { tax_lines: [{ rate: 0.04 }] } },
            ],
          },
        ],
      },
      FALLBACK,
    );

    expect(row).toMatchObject({ subtotalMinor: 3550, taxMinor: 136, totalMinor: 3550 });
    expect(row?.taxLines).toEqual([{ ratePercent: 4, taxableMinor: 3414, taxMinor: 136 }]);
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

  it('nota vuota diventa nulla, non stringa vuota', () => {
    const [row] = mapShopifyRefunds(
      { refunds: [{ id: 5, note: '', processed_at: '2026-08-14T00:00:00Z' }] },
      FALLBACK,
    );

    expect(row?.note).toBeNull();
  });
});
