import { describe, expect, it } from 'vitest';

import { SalesOrderSource, type SalesOrder } from '@core/models/sales-order.model';
import { formatMoney } from '@core/utils/money.util';

import {
  buildSalesOrderListCsv,
  buildSalesOrderListPrintHtml,
} from './sales-order-list-export.util';

const EUR = (amountMinor: number) => ({ amountMinor, currencyCode: 'EUR' });

/** #1014 del collaudo reale: 2.249,85 ordinati, 749,95 annullati dal canale, evaso. */
const ORDINE_1014 = {
  id: 'o-1014',
  orderNumber: '#1014',
  source: SalesOrderSource.Online,
  customerName: 'Karine Ruby',
  placedAt: '2026-09-13T13:11:06.000Z',
  financialStatus: 'partially_refunded',
  fulfillmentStatus: 'fulfilled',
  locationName: 'Shop location',
  subtotal: EUR(224985),
  tax: EUR(0),
  total: EUR(224985),
  refundTotal: EUR(74995),
  updatedTotal: EUR(149990),
  refundCount: 1,
  lines: [],
} as unknown as SalesOrder;

/** Un ordine manuale, senza rettifiche: le due colonne nuove non gli aggiungono niente. */
const ORDINE_MANUALE = {
  id: 'o-12',
  orderNumber: 'OC-0012',
  source: SalesOrderSource.Manual,
  customerName: 'Cliente di prova',
  placedAt: '2026-09-10T08:00:00.000Z',
  financialStatus: 'pending',
  fulfillmentStatus: 'unfulfilled',
  locationName: 'Negozio Roma',
  subtotal: EUR(10000),
  tax: EUR(2200),
  total: EUR(12200),
  lines: [],
} as unknown as SalesOrder;

function righeCsv(csv: string): string[][] {
  return csv
    .replace(/^\uFEFF/, '')
    .split('\r\n')
    .map((riga) => riga.split(';'));
}

describe('buildSalesOrderListCsv — le rettifiche entrano col segno e il totale aggiornato è la differenza', () => {
  it('⭐ #1014: Totale 2249,85 · Rettifiche −749,95 · Totale aggiornato 1499,90', () => {
    const [intestazione, riga] = righeCsv(buildSalesOrderListCsv([ORDINE_1014]));

    expect(intestazione?.slice(-3)).toEqual(['Totale', 'Rettifiche', 'Totale aggiornato']);
    expect(riga?.slice(-3)).toEqual(['2249,85', '-749,95', '1499,90']);
  });

  it('un ordine senza rettifiche porta 0,00 e il totale aggiornato uguale al totale', () => {
    const [, riga] = righeCsv(buildSalesOrderListCsv([ORDINE_MANUALE]));

    expect(riga?.slice(-3)).toEqual(['122,00', '0,00', '122,00']);
  });

  it('la riga totali somma le tre colonne una volta sola', () => {
    const righe = righeCsv(buildSalesOrderListCsv([ORDINE_1014, ORDINE_MANUALE]));
    const totali = righe[righe.length - 1];

    expect(totali?.[0]).toBe('Totale');
    expect(totali?.[1]).toBe('2 ordini');
    expect(totali?.slice(-3)).toEqual(['2371,85', '-749,95', '1621,90']);
  });
});

describe('buildSalesOrderListPrintHtml — le stesse tre colonne, con «—» dove non c’è rettifica', () => {
  it('porta intestazioni, valori di #1014 e la riga totali', () => {
    const html = buildSalesOrderListPrintHtml([ORDINE_1014, ORDINE_MANUALE]);

    expect(html).toContain('<th class="num">Rettifiche</th><th class="num">Totale aggiornato</th>');
    expect(html).toContain(`<td class="num">− ${formatMoney(EUR(74995))}</td>`);
    expect(html).toContain(`<td class="num">${formatMoney(EUR(149990))}</td>`);
    // L'ordine manuale: nessuna rettifica, totale aggiornato = totale.
    expect(html).toContain(`<td class="num">—</td><td class="num">${formatMoney(EUR(12200))}</td>`);
    // La riga totali.
    expect(html).toContain(
      `<td class="num">− ${formatMoney(EUR(74995))}</td>\n  <td class="num">${formatMoney(EUR(237185 - 74995))}</td>`,
    );
  });
});
