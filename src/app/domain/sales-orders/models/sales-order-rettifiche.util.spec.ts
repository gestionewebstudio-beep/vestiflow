import { describe, expect, it } from 'vitest';

import type { SalesOrder, SalesOrderLine } from '@core/models/sales-order.model';

import { quantitaDelleRighe, rettificheDi, totaleAggiornato } from './sales-order-rettifiche.util';

const EUR = (amountMinor: number) => ({ amountMinor, currencyCode: 'EUR' });

describe('totaleAggiornato — letto dalla testata, in un posto solo', () => {
  it('⭐ #1014: la testata dice 1.499,90 (2.249,85 − 749,95, generato dal database)', () => {
    expect(totaleAggiornato({ total: EUR(224985), updatedTotal: EUR(149990) })).toEqual(
      EUR(149990),
    );
  });

  it('senza testata aggiornata vale il totale: nessuna rettifica nota, nessuna sottrazione', () => {
    expect(totaleAggiornato({ total: EUR(224985), updatedTotal: undefined })).toEqual(EUR(224985));
  });
});

describe('rettificheDi — le rettifiche nella forma del componente condiviso', () => {
  it('porta id, tipo, data, importo e nota; senza nota resta null', () => {
    const refunds: SalesOrder['refunds'] = [
      {
        id: 'r-1',
        kind: 'cancellation',
        occurredAt: '2026-09-13T13:11:58.000Z',
        total: EUR(74995),
        tax: EUR(0),
        note: 'test',
      },
      {
        id: 'r-2',
        kind: 'refund_only',
        occurredAt: '2026-09-14T09:00:00.000Z',
        total: EUR(500),
        tax: EUR(0),
      },
    ];

    expect(rettificheDi({ refunds })).toEqual([
      {
        id: 'r-1',
        kind: 'cancellation',
        occurredAt: '2026-09-13T13:11:58.000Z',
        total: EUR(74995),
        note: 'test',
      },
      {
        id: 'r-2',
        kind: 'refund_only',
        occurredAt: '2026-09-14T09:00:00.000Z',
        total: EUR(500),
        note: null,
      },
    ]);
  });

  it('un ordine senza rettifiche (campo assente) dà un elenco vuoto', () => {
    expect(rettificheDi({ refunds: undefined })).toEqual([]);
  });
});

describe('quantitaDelleRighe — ordinate, annullate, spedite', () => {
  const riga = (over: Partial<SalesOrderLine>) =>
    ({ id: 'l-1', title: 'The Hidden Snowboard', quantity: 3, ...over }) as SalesOrderLine;

  it('⭐ #1014: 3 ordinati · 1 annullato (dal canale) · 2 spediti', () => {
    expect(quantitaDelleRighe([riga({ cancelledQuantity: 1, shippedQuantity: 2 })])).toEqual([
      { id: 'l-1', description: 'The Hidden Snowboard', ordered: 3, cancelled: 1, shipped: 2 },
    ]);
  });

  it('⛔ annullati e spediti assenti valgono zero: mai «ordinati − spediti»', () => {
    expect(quantitaDelleRighe([riga({})])).toEqual([
      { id: 'l-1', description: 'The Hidden Snowboard', ordered: 3, cancelled: 0, shipped: 0 },
    ]);
  });
});
