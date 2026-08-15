import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { findVatCodeForDerivedRate } from './vat-reverse-match.util';
import type { VatCodeWithNature } from './vat-codes.service';

function vatCode(overrides: Partial<VatCodeWithNature> & { code: string; ratePercent: number }) {
  return {
    id: `vat-${overrides.code}`,
    tenantId: 'tenant-1',
    natureId: 'nature-taxable',
    nonDeductiblePercent: new Prisma.Decimal(0),
    description: `Imponibile ${overrides.ratePercent}%`,
    notes: null,
    usageScope: 'both',
    calculationMode: 'standard',
    vatAffectsSupplierTotal: true,
    isActive: true,
    isDefault: false,
    sortOrder: 1,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
    ratePercent: new Prisma.Decimal(overrides.ratePercent),
    nature: {
      id: 'nature-taxable',
      tenantId: 'tenant-1',
      key: 'TAXABLE',
      officialCode: null,
      label: 'Imponibile',
      description: null,
      defaultUsageScope: 'both',
      defaultCalculationMode: 'standard',
      sortOrder: 1,
      isSystem: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  } as unknown as VatCodeWithNature;
}

const SEED = [
  vatCode({ code: '22', ratePercent: 22 }),
  vatCode({ code: '10', ratePercent: 10 }),
  vatCode({ code: '4', ratePercent: 4 }),
  vatCode({ code: 'X15', ratePercent: 0, calculationMode: 'zero_rate' }),
  vatCode({ code: 'FC', ratePercent: 0, calculationMode: 'zero_rate' }),
  vatCode({ code: 'E10', ratePercent: 0, calculationMode: 'zero_rate' }),
];

describe('findVatCodeForDerivedRate', () => {
  it('aliquota ordinaria: se il codice è uno solo, si aggancia', () => {
    // "Se entra 22 vuol dire che è 22%": sui casi normali la corrispondenza è
    // deterministica e non c'è motivo di rinunciarci.
    expect(findVatCodeForDerivedRate(22, SEED)?.code).toBe('22');
    expect(findVatCodeForDerivedRate(4, SEED)?.code).toBe('4');
  });

  it('aliquota estera: vale la stessa regola, appena il codice esiste', () => {
    // Vendita in Francia al 20%: finché il tenant non crea il codice al 20% la
    // riga resta senza classificazione — l'aliquota della vendita non cambia.
    expect(findVatCodeForDerivedRate(20, SEED)).toBeNull();

    const conFrancia = [...SEED, vatCode({ code: '20FR', ratePercent: 20 })];
    expect(findVatCodeForDerivedRate(20, conFrancia)?.code).toBe('20FR');
  });

  it('ZERO: non sceglie nessuna Natura, e prima ne sceglieva una a caso', () => {
    // ⚠️ È il difetto 3.13. Escluso art. 15, fuori campo ed esente condividono
    // lo 0% e sono cose diverse: la percentuale non li distingue. Prima vinceva
    // il primo che il database restituiva.
    expect(findVatCodeForDerivedRate(0, SEED)).toBeNull();
  });

  it('DUE codici alla stessa aliquota: nessuno dei due, non il primo', () => {
    // Stessa famiglia del ripiego alfabetico sulla sede (difetto 3.8): quando
    // la scelta non è determinata, sceglierne una è peggio che non sceglierla.
    const ambiguo = [...SEED, vatCode({ code: '22ART74', ratePercent: 22 })];

    expect(findVatCodeForDerivedRate(22, ambiguo)).toBeNull();
  });

  it('ignora i codici non attivi, di solo acquisto e non standard', () => {
    const soloAcquisto = [vatCode({ code: '22R', ratePercent: 22, usageScope: 'purchase' })];
    const disattivato = [vatCode({ code: '22', ratePercent: 22, isActive: false })];
    const reverseCharge = [
      vatCode({ code: '22RC', ratePercent: 22, calculationMode: 'reverse_charge' }),
    ];

    expect(findVatCodeForDerivedRate(22, soloAcquisto)).toBeNull();
    expect(findVatCodeForDerivedRate(22, disattivato)).toBeNull();
    expect(findVatCodeForDerivedRate(22, reverseCharge)).toBeNull();
  });

  it('un codice disattivato non rende ambiguo quello attivo', () => {
    const conStorico = [
      vatCode({ code: '22', ratePercent: 22 }),
      vatCode({ code: '22VECCHIO', ratePercent: 22, isActive: false }),
    ];

    expect(findVatCodeForDerivedRate(22, conStorico)?.code).toBe('22');
  });

  it('aliquota assente: nessun codice', () => {
    expect(findVatCodeForDerivedRate(null, SEED)).toBeNull();
  });
});
