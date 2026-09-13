import { describe, expect, it } from 'vitest';

import { annullatePerRiga, speditePerRiga } from './sales-order-rettifiche.util';

/**
 * I numeri di #1014 del collaudo reale (13/09/2026): 3 ordinati, 1 annullato
 * prima della spedizione, 2 spediti in due evasioni; 2.249,85 − 749,95 = 1.499,90.
 */
describe('sales-order-rettifiche', () => {
  const rimborsi = [
    {
      totalMinor: 74995,
      lines: [{ salesOrderLineId: 'riga-1', quantity: 1, restockType: 'cancel' }],
    },
  ];

  it('le ANNULLATE vengono dalle righe «cancel» del canale, non da ordinate − spedite', () => {
    // Evasione parziale senza annullamento: 1 spedito su 3, niente annullato — il
    // residuo (2) è ancora da spedire, e «ordinate − spedite» lo direbbe annullato.
    expect(annullatePerRiga([]).get('riga-1')).toBeUndefined();
    expect(speditePerRiga([{ salesOrderLineId: 'riga-1', quantity: 1 }]).get('riga-1')).toBe(1);
    // Con l'annullamento del canale: 1, e i resi (`return`) non contano come annullati.
    expect(
      annullatePerRiga([
        ...rimborsi,
        {
          totalMinor: 100,
          lines: [{ salesOrderLineId: 'riga-1', quantity: 1, restockType: 'return' }],
        },
      ]).get('riga-1'),
    ).toBe(1);
    // Una riga rimborsata senza riga d'ordine (riga sparita) non si attribuisce a nessuno.
    expect(
      annullatePerRiga([
        { totalMinor: 1, lines: [{ salesOrderLineId: null, quantity: 5, restockType: 'cancel' }] },
      ]).size,
    ).toBe(0);
  });

  it('le SPEDITE sommano le spedizioni della stessa riga', () => {
    expect(
      speditePerRiga([
        { salesOrderLineId: 'riga-1', quantity: 1 },
        { salesOrderLineId: 'riga-1', quantity: 1 },
        { salesOrderLineId: 'riga-2', quantity: 4 },
      ]),
    ).toEqual(
      new Map([
        ['riga-1', 2],
        ['riga-2', 4],
      ]),
    );
  });
});
