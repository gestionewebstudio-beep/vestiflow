import { describe, expect, it } from 'vitest';

import {
  buildFiscalPrintLines,
  buildFiscalPrintPayments,
  resolveDepartment,
} from './fiscal-print-payload.util';

const DEPARTMENTS = [
  { ratePercent: 22, department: 1 },
  { ratePercent: 10, department: 2 },
];

describe('fiscal-print-payload.util', () => {
  it('reparto dalla mappa del dispositivo; ripiego sul reparto 1', () => {
    expect(resolveDepartment(DEPARTMENTS, 22)).toBe(1);
    expect(resolveDepartment(DEPARTMENTS, 10)).toBe(2);
    // Aliquota non mappata, mappa assente o aliquota assente: reparto 1.
    expect(resolveDepartment(DEPARTMENTS, 4)).toBe(1);
    expect(resolveDepartment(null, 22)).toBe(1);
    expect(resolveDepartment(DEPARTMENTS, null)).toBe(1);
    // Voci malformate ignorate senza esplodere.
    expect(resolveDepartment([{ ratePercent: 22 }], 22)).toBe(1);
  });

  it('riga con lordo divisibile: quantità reale e prezzo unitario esatto', () => {
    const lines = buildFiscalPrintLines(
      [
        {
          description: 'Maglia cotone M',
          quantity: 2,
          lineGrossTotalMinor: 4856,
          vatSnapshot: { ratePercent: 22 },
        },
      ],
      DEPARTMENTS,
    );
    expect(lines).toEqual([
      { description: 'Maglia cotone M', quantity: 2, unitPriceGrossMinor: 2428, department: 1 },
    ]);
  });

  it('lordo non divisibile (sconti): una riga a quantità 1 col totale esatto', () => {
    const lines = buildFiscalPrintLines(
      [
        {
          description: 'Jeans slim',
          quantity: 3,
          lineGrossTotalMinor: 10000,
          vatSnapshot: { ratePercent: 22 },
        },
      ],
      DEPARTMENTS,
    );
    // 10000 / 3 non è intero: il totale stampato deve tornare al centesimo.
    expect(lines).toEqual([
      { description: 'Jeans slim x3', quantity: 1, unitPriceGrossMinor: 10000, department: 1 },
    ]);
  });

  it('pagamenti: etichette e tipi Epson per metodo, nota di «Altro» in stampa', () => {
    const payments = buildFiscalPrintPayments([
      { method: 'cash', methodNote: null, amountMinor: 3000 },
      { method: 'card', methodNote: null, amountMinor: 2980 },
      { method: 'other', methodNote: 'Buono regalo', amountMinor: 500 },
    ]);
    expect(payments).toEqual([
      { description: 'CONTANTI', amountMinor: 3000, epsonPaymentType: 0 },
      { description: 'CARTA', amountMinor: 2980, epsonPaymentType: 2 },
      { description: 'BUONO REGALO', amountMinor: 500, epsonPaymentType: 3 },
    ]);
  });
});
