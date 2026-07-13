import { describe, expect, it } from 'vitest';

import {
  buildVatSummary,
  computeVatLineAmounts,
  entryIncludesVat,
  grossFromNetMinor,
  netFromGrossMinor,
  type VatComputationInput,
} from './vat-line-calculation.util';

const VAT_22: VatComputationInput = {
  ratePercent: 22,
  nonDeductiblePercent: 0,
  calculationMode: 'standard',
  vatAffectsSupplierTotal: true,
};

const VAT_10: VatComputationInput = { ...VAT_22, ratePercent: 10 };

const VAT_22R: VatComputationInput = {
  ratePercent: 22,
  nonDeductiblePercent: 0,
  calculationMode: 'reverse_charge',
  vatAffectsSupplierTotal: false,
};

const VAT_E10: VatComputationInput = {
  ratePercent: 0,
  nonDeductiblePercent: 0,
  calculationMode: 'zero_rate',
  vatAffectsSupplierTotal: false,
};

describe('netFromGrossMinor / grossFromNetMinor', () => {
  it('scorpora IVA 22% da 122,00 → 100,00', () => {
    expect(netFromGrossMinor(12200, 22)).toBe(10000);
  });

  it('aggiunge IVA 22% a 100,00 → 122,00', () => {
    expect(grossFromNetMinor(10000, 22)).toBe(12200);
  });

  it('aliquota 0: valore invariato', () => {
    expect(netFromGrossMinor(12200, 0)).toBe(12200);
    expect(grossFromNetMinor(10000, 0)).toBe(10000);
  });
});

describe('computeVatLineAmounts — costi netti (§11.2, §15.1)', () => {
  it('costo 100,00 × 1 con IVA 22%: imponibile 100, IVA 22, totale 122', () => {
    const amounts = computeVatLineAmounts({
      enteredUnitCostMinor: 10000,
      costEntryMode: 'vat_excluded',
      quantity: 1,
      discountPercent: 0,
      vat: VAT_22,
    });
    expect(amounts.unitNetMinor).toBe(10000);
    expect(amounts.lineNetMinor).toBe(10000);
    expect(amounts.lineVatMinor).toBe(2200);
    expect(amounts.lineGrossMinor).toBe(12200);
    expect(amounts.supplierPayableMinor).toBe(12200);
    expect(amounts.reverseChargeVatMinor).toBe(0);
  });

  it('applica lo sconto riga prima dell\'IVA (§15)', () => {
    const amounts = computeVatLineAmounts({
      enteredUnitCostMinor: 10000,
      costEntryMode: 'vat_excluded',
      quantity: 2,
      discountPercent: 10,
      vat: VAT_22,
    });
    // 2 × 100,00 × 0,9 = 180,00 netto; IVA 39,60.
    expect(amounts.lineNetMinor).toBe(18000);
    expect(amounts.lineVatMinor).toBe(3960);
    expect(amounts.lineGrossMinor).toBe(21960);
  });
});

describe('computeVatLineAmounts — costi ivati (§11.3, §13.2)', () => {
  it('costo ivato 122,00 con IVA 22%: imponibile 100, IVA 22, totale 122', () => {
    const amounts = computeVatLineAmounts({
      enteredUnitCostMinor: 12200,
      costEntryMode: 'vat_included',
      quantity: 1,
      discountPercent: 0,
      vat: VAT_22,
    });
    expect(amounts.unitNetMinor).toBe(10000);
    expect(amounts.lineNetMinor).toBe(10000);
    expect(amounts.lineVatMinor).toBe(2200);
    expect(amounts.lineGrossMinor).toBe(12200);
  });

  it('cambio IVA su costo ivato invariato: 110,00 da 10% a 22% → 90,16 + 19,84 (§13.2)', () => {
    const before = computeVatLineAmounts({
      enteredUnitCostMinor: 11000,
      costEntryMode: 'vat_included',
      quantity: 1,
      discountPercent: 0,
      vat: VAT_10,
    });
    expect(before.lineNetMinor).toBe(10000);
    expect(before.lineVatMinor).toBe(1000);

    const after = computeVatLineAmounts({
      enteredUnitCostMinor: 11000,
      costEntryMode: 'vat_included',
      quantity: 1,
      discountPercent: 0,
      vat: VAT_22,
    });
    expect(after.lineNetMinor).toBe(9016);
    expect(after.lineVatMinor).toBe(1984);
    expect(after.lineGrossMinor).toBe(11000);
  });

  it('con aliquota 0 il valore digitato è già netto: nessuno scorporo', () => {
    const amounts = computeVatLineAmounts({
      enteredUnitCostMinor: 10000,
      costEntryMode: 'vat_included',
      quantity: 1,
      discountPercent: 0,
      vat: VAT_E10,
    });
    expect(amounts.lineNetMinor).toBe(10000);
    expect(amounts.lineVatMinor).toBe(0);
    expect(amounts.lineGrossMinor).toBe(10000);
  });
});

describe('computeVatLineAmounts — reverse charge (§3.5, §4.3)', () => {
  it('IVA calcolata a parte, totale fornitore = netto', () => {
    const amounts = computeVatLineAmounts({
      enteredUnitCostMinor: 10000,
      costEntryMode: 'vat_excluded',
      quantity: 1,
      discountPercent: 0,
      vat: VAT_22R,
    });
    expect(amounts.lineNetMinor).toBe(10000);
    expect(amounts.lineVatMinor).toBe(2200);
    expect(amounts.reverseChargeVatMinor).toBe(2200);
    expect(amounts.supplierPayableMinor).toBe(10000);
    expect(amounts.lineGrossMinor).toBe(10000);
  });

  it('in modalità ivati il reverse charge NON scorpora: il fornitore non espone IVA', () => {
    expect(entryIncludesVat('vat_included', VAT_22R)).toBe(false);
    const amounts = computeVatLineAmounts({
      enteredUnitCostMinor: 10000,
      costEntryMode: 'vat_included',
      quantity: 1,
      discountPercent: 0,
      vat: VAT_22R,
    });
    expect(amounts.lineNetMinor).toBe(10000);
    expect(amounts.reverseChargeVatMinor).toBe(2200);
    expect(amounts.supplierPayableMinor).toBe(10000);
  });
});

describe('computeVatLineAmounts — IVA indetraibile (§3.3)', () => {
  it('50% indetraibile: quota calcolata senza cambiare il totale fornitore', () => {
    const amounts = computeVatLineAmounts({
      enteredUnitCostMinor: 10000,
      costEntryMode: 'vat_excluded',
      quantity: 1,
      discountPercent: 0,
      vat: { ...VAT_22, nonDeductiblePercent: 50 },
    });
    expect(amounts.lineVatMinor).toBe(2200);
    expect(amounts.nonDeductibleVatMinor).toBe(1100);
    expect(amounts.supplierPayableMinor).toBe(12200);
  });
});

describe('buildVatSummary (§10.2)', () => {
  it('raggruppa per Codice IVA e ordina per aliquota', () => {
    const summary = buildVatSummary([
      {
        vatCodeId: 'id22',
        code: '22',
        ratePercent: 22,
        description: 'Imponibile 22%',
        lineNetMinor: 10000,
        lineVatMinor: 2200,
        lineGrossMinor: 12200,
        reverseChargeVatMinor: 0,
        nonDeductibleVatMinor: 0,
      },
      {
        vatCodeId: 'id10',
        code: '10',
        ratePercent: 10,
        description: 'Imponibile 10%',
        lineNetMinor: 5000,
        lineVatMinor: 500,
        lineGrossMinor: 5500,
        reverseChargeVatMinor: 0,
        nonDeductibleVatMinor: 0,
      },
      {
        vatCodeId: 'id22',
        code: '22',
        ratePercent: 22,
        description: 'Imponibile 22%',
        lineNetMinor: 20000,
        lineVatMinor: 4400,
        lineGrossMinor: 24400,
        reverseChargeVatMinor: 0,
        nonDeductibleVatMinor: 0,
      },
    ]);
    expect(summary).toHaveLength(2);
    expect(summary[0]?.code).toBe('10');
    expect(summary[1]?.code).toBe('22');
    expect(summary[1]?.netMinor).toBe(30000);
    expect(summary[1]?.vatMinor).toBe(6600);
    expect(summary[1]?.grossMinor).toBe(36600);
  });
});
