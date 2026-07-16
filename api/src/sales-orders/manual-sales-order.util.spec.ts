import { describe, expect, it } from 'vitest';

import type { VatCodeWithNature } from '../vat/vat-codes.service';
import {
  cascadeDiscountMultiplier,
  computeManualOrderLines,
  computeManualOrderTotals,
  discountedUnitPriceMinor,
  isPersistableManualOrderLine,
} from './manual-sales-order.util';

function vatCode(overrides: Partial<VatCodeWithNature> = {}): VatCodeWithNature {
  return {
    id: 'vat-22',
    tenantId: 'tenant-1',
    code: '22',
    natureId: 'nat-1',
    ratePercent: 22,
    nonDeductiblePercent: 0,
    description: 'IVA 22%',
    notes: null,
    usageScope: 'both',
    calculationMode: 'standard',
    vatAffectsSupplierTotal: true,
    isDefault: true,
    isActive: true,
    isSystem: false,
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    nature: {
      id: 'nat-1',
      key: 'TAXABLE',
      officialCode: null,
      label: 'Imponibile',
      description: null,
      defaultUsageScope: 'both',
      defaultCalculationMode: 'standard',
      sortOrder: 0,
      isSystem: true,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    ...overrides,
  } as VatCodeWithNature;
}

describe('cascadeDiscountMultiplier', () => {
  it('sconto singolo: "10%" → 0.9', () => {
    expect(cascadeDiscountMultiplier('10%')).toBeCloseTo(0.9, 10);
  });

  it('cascata "4+10%": sequenza sul residuo, NON 14% totale', () => {
    // 0.96 × 0.90 = 0.864 → sconto effettivo 13,6%, mai arrotondato a 14%.
    expect(cascadeDiscountMultiplier('4+10%')).toBeCloseTo(0.864, 10);
  });

  it('cascata a tre livelli "2+5+8%"', () => {
    expect(cascadeDiscountMultiplier('2+5+8%')).toBeCloseTo(0.98 * 0.95 * 0.92, 10);
  });

  it('accetta decimali con virgola e ignora valori fuori range', () => {
    expect(cascadeDiscountMultiplier('2,5%')).toBeCloseTo(0.975, 10);
    expect(cascadeDiscountMultiplier('150%')).toBe(1);
    expect(cascadeDiscountMultiplier('abc')).toBe(1);
  });

  it('vuoto o null: nessuno sconto', () => {
    expect(cascadeDiscountMultiplier('')).toBe(1);
    expect(cascadeDiscountMultiplier(null)).toBe(1);
    expect(cascadeDiscountMultiplier(undefined)).toBe(1);
  });
});

describe('discountedUnitPriceMinor', () => {
  it('applica la cascata esatta e arrotonda al centesimo', () => {
    // 100,00 € con 4+10% → 86,40 €
    expect(discountedUnitPriceMinor(10000, '4+10%')).toBe(8640);
  });

  it('prezzo zero resta zero', () => {
    expect(discountedUnitPriceMinor(0, '10%')).toBe(0);
  });
});

describe('computeManualOrderLines / computeManualOrderTotals', () => {
  it('totale riga = quantità × prezzo scontato (senza IVA), IVA da snapshot', () => {
    const vatCodesById = new Map([['vat-22', vatCode()]]);
    const lines = computeManualOrderLines(
      [
        {
          variantId: 'var-1',
          sku: 'SKU-1',
          title: 'T-shirt',
          quantity: 3,
          unitPriceMinor: 10000,
          discount: '4+10%',
          vatCodeId: 'vat-22',
          commitsStock: true,
        },
      ],
      vatCodesById,
    );

    expect(lines[0]!.totalMinor).toBe(3 * 8640);
    expect(lines[0]!.lineVatTotalMinor).toBe(Math.round((3 * 8640 * 22) / 100));
    expect(lines[0]!.vatSnapshot).toMatchObject({ code: '22', ratePercent: 22 });

    const totals = computeManualOrderTotals(lines);
    expect(totals.subtotalMinor).toBe(25920);
    expect(totals.taxMinor).toBe(5702);
    expect(totals.totalMinor).toBe(25920 + 5702);
    // Sconto complessivo = lordo (30000) − imponibile scontato (25920).
    expect(totals.discountMinor).toBe(4080);
  });

  it('IVA non standard (reverse charge / informational) non concorre al totale', () => {
    const vatCodesById = new Map([
      ['vat-rc', vatCode({ id: 'vat-rc', calculationMode: 'reverse_charge' })],
    ]);
    const lines = computeManualOrderLines(
      [
        {
          title: 'Servizio sartoria',
          quantity: 1,
          unitPriceMinor: 5000,
          vatCodeId: 'vat-rc',
          commitsStock: false,
        },
      ],
      vatCodesById,
    );
    expect(lines[0]!.lineVatTotalMinor).toBe(0);
  });

  it('riga senza sconto: prezzo pieno', () => {
    const lines = computeManualOrderLines(
      [{ title: 'Cintura', quantity: 2, unitPriceMinor: 1500 }],
      new Map(),
    );
    expect(lines[0]!.totalMinor).toBe(3000);
    expect(lines[0]!.discount).toBeNull();
  });
});

describe('isPersistableManualOrderLine', () => {
  it('riga valida: prodotto + quantità > 0', () => {
    expect(
      isPersistableManualOrderLine({ variantId: 'var-1', title: 'X', quantity: 1 }),
    ).toBe(true);
  });

  it('quantità 0 o senza prodotto: non salvabile (regola Arrivo merce)', () => {
    expect(isPersistableManualOrderLine({ variantId: 'var-1', title: 'X', quantity: 0 })).toBe(
      false,
    );
    expect(isPersistableManualOrderLine({ title: '   ', quantity: 5 })).toBe(false);
  });
});
