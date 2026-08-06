import { describe, expect, it } from 'vitest';

import { computeCashSessionTotals } from './cash-session-totals.util';

describe('computeCashSessionTotals', () => {
  it('sessione vuota: gli attesi sono il solo fondo cassa', () => {
    const totals = computeCashSessionTotals(5000, [], []);
    expect(totals.expectedCashMinor).toBe(5000);
    expect(totals.expectedCardMinor).toBe(0);
    expect(totals.expectedOtherMinor).toBe(0);
  });

  it('incassi per metodo: le vendite si sommano nel bucket giusto', () => {
    const totals = computeCashSessionTotals(
      5000,
      [
        { documentType: 'store_sale', method: 'cash', amountMinor: 3000 },
        { documentType: 'store_sale', method: 'cash', amountMinor: 2000 },
        { documentType: 'store_sale', method: 'card', amountMinor: 4990 },
        { documentType: 'store_sale', method: 'other', amountMinor: 1500 },
      ],
      [],
    );
    expect(totals.salesCashMinor).toBe(5000);
    expect(totals.salesCardMinor).toBe(4990);
    expect(totals.salesOtherMinor).toBe(1500);
    expect(totals.expectedCashMinor).toBe(10000);
    expect(totals.expectedCardMinor).toBe(4990);
    expect(totals.expectedOtherMinor).toBe(1500);
  });

  it('i rimborsi dei resi sottraggono dal metodo con cui sono stati resi', () => {
    const totals = computeCashSessionTotals(
      0,
      [
        { documentType: 'store_sale', method: 'cash', amountMinor: 10000 },
        { documentType: 'store_return', method: 'cash', amountMinor: 2500 },
        { documentType: 'store_return', method: 'card', amountMinor: 1000 },
      ],
      [],
    );
    expect(totals.refundsCashMinor).toBe(2500);
    expect(totals.refundsCardMinor).toBe(1000);
    expect(totals.expectedCashMinor).toBe(7500);
    expect(totals.expectedCardMinor).toBe(-1000);
  });

  it('versamenti e prelievi toccano SOLO i contanti attesi', () => {
    const totals = computeCashSessionTotals(
      5000,
      [{ documentType: 'store_sale', method: 'card', amountMinor: 3000 }],
      [
        { type: 'deposit', amountMinor: 1000 },
        { type: 'withdrawal', amountMinor: 4000 },
      ],
    );
    expect(totals.depositsMinor).toBe(1000);
    expect(totals.withdrawalsMinor).toBe(4000);
    expect(totals.expectedCashMinor).toBe(2000);
    expect(totals.expectedCardMinor).toBe(3000);
  });

  it('metodo sconosciuto: finisce in «altro», mai perso', () => {
    const totals = computeCashSessionTotals(
      0,
      [{ documentType: 'store_sale', method: 'voucher', amountMinor: 990 }],
      [],
    );
    expect(totals.salesOtherMinor).toBe(990);
    expect(totals.expectedOtherMinor).toBe(990);
  });
});
