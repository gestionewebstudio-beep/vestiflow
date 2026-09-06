import { describe, expect, it } from 'vitest';

import {
  allocateRetailReturn,
  NO_RETURNED_AMOUNTS,
  type ReturnedLineAmounts,
} from './retail-return-allocation.util';

const original: ReturnedLineAmounts = {
  quantity: 3,
  lineTotalMinor: 2997,
  lineVatTotalMinor: 659,
  lineGrossTotalMinor: 3656,
};

describe('ripartizione cumulativa degli importi originali', () => {
  it.each([[1, 1, 1], [1, 2], [2, 1], [3]])('esaurisce 36,56 EUR con resi %j', (...quantities) => {
    let previous = NO_RETURNED_AMOUNTS;
    const gross: number[] = [];
    for (const quantity of quantities) {
      const result = allocateRetailReturn(original, previous, quantity);
      expect(result.lineTotalMinor + result.lineVatTotalMinor).toBe(result.lineGrossTotalMinor);
      gross.push(result.lineGrossTotalMinor);
      previous = {
        quantity: previous.quantity + quantity,
        lineTotalMinor: previous.lineTotalMinor + result.lineTotalMinor,
        lineVatTotalMinor: previous.lineVatTotalMinor + result.lineVatTotalMinor,
        lineGrossTotalMinor: previous.lineGrossTotalMinor + result.lineGrossTotalMinor,
      };
    }
    expect(previous).toEqual(original);
    if (quantities.length === 3) expect(gross).toEqual([1219, 1218, 1219]);
  });

  it('le quote molto piccole non producono IVA negativa', () => {
    const tiny = { quantity: 3, lineTotalMinor: 1, lineVatTotalMinor: 1, lineGrossTotalMinor: 2 };
    const first = allocateRetailReturn(tiny, NO_RETURNED_AMOUNTS, 1);
    const second = allocateRetailReturn(tiny, { ...first, quantity: 1 }, 1);
    expect(first).toEqual({ lineTotalMinor: 1, lineVatTotalMinor: 0, lineGrossTotalMinor: 1 });
    expect(second).toEqual({ lineTotalMinor: 0, lineVatTotalMinor: 0, lineGrossTotalMinor: 0 });
  });

  it('considera gli importi effettivi di vecchi resi coerenti, senza riscriverli', () => {
    const previous = {
      quantity: 2,
      lineTotalMinor: 1998,
      lineVatTotalMinor: 440,
      lineGrossTotalMinor: 2438,
    };
    expect(allocateRetailReturn(original, previous, 1)).toEqual({
      lineTotalMinor: 999,
      lineVatTotalMinor: 219,
      lineGrossTotalMinor: 1218,
    });
  });

  it('rifiuta uno storico che non quadra invece di nasconderne lo scarto', () => {
    expect(() =>
      allocateRetailReturn(
        original,
        { quantity: 1, lineTotalMinor: 999, lineVatTotalMinor: 219, lineGrossTotalMinor: 1219 },
        1,
      ),
    ).toThrow(/storici/);
  });
});
