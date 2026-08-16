import { describe, expect, it } from 'vitest';

import type { TenantFeatureSettings } from '@domain/tenant/models/tenant-feature-settings.model';
import type { VariantSummary } from '@domain/products/models/variant-summary.model';

import {
  listinoSelectOptions,
  listinoUnitPrice,
  parseListinoChoice,
} from './document-listino.util';

const SETTINGS: TenantFeatureSettings = {
  salesPricesIncludeVat: true,
  lotsEnabled: false,
  serialsEnabled: false,
  variantsEnabled: true,
  barcodeScannerEnabled: true,
  supplierOrdersEnabled: true,
  goodsReceiptEnabled: true,
  warehouseValuationEnabled: true,
  allowNegativeInventory: false,
  warnNegativeInventory: true,
  blockNegativeInventory: false,
  defaultUnitOfMeasure: 'pz',
  defaultVatCodeId: null,
  listino1Name: 'Ingrosso',
  listino1Active: true,
  listino2Name: null,
  listino2Active: false,
  listino3Name: 'Outlet',
  listino3Active: true,
};

const VARIANT = {
  sellingPrice: { amountMinor: 2990, currencyCode: 'EUR' },
  listinoPrices: {
    1: { amountMinor: 1990, currencyCode: 'EUR' },
    2: null,
    3: null,
  },
} satisfies Pick<VariantSummary, 'sellingPrice' | 'listinoPrices'>;

describe('listinoSelectOptions', () => {
  it('offre il prezzo di vendita e i soli listini attivi, col nome del tenant', () => {
    expect(listinoSelectOptions(SETTINGS)).toEqual([
      { value: 'article', label: 'Prezzo di vendita' },
      { value: '1', label: 'Ingrosso' },
      { value: '3', label: 'Outlet' },
    ]);
  });

  it('senza impostazioni resta il solo prezzo di vendita', () => {
    expect(listinoSelectOptions(null)).toEqual([{ value: 'article', label: 'Prezzo di vendita' }]);
  });
});

describe('parseListinoChoice', () => {
  it('legge le tre posizioni, tutto il resto è il prezzo di vendita', () => {
    expect(parseListinoChoice('1')).toBe(1);
    expect(parseListinoChoice('3')).toBe(3);
    expect(parseListinoChoice('article')).toBe('article');
    expect(parseListinoChoice(null)).toBe('article');
    expect(parseListinoChoice('9')).toBe('article');
  });
});

describe('listinoUnitPrice', () => {
  it('il prezzo di vendita è il comportamento di sempre', () => {
    expect(listinoUnitPrice(VARIANT, 'article')).toEqual({
      amountMinor: 2990,
      currencyCode: 'EUR',
    });
  });

  it('un listino valorizzato vince sul prezzo di vendita', () => {
    expect(listinoUnitPrice(VARIANT, 1)).toEqual({ amountMinor: 1990, currencyCode: 'EUR' });
  });

  // La regola che conta: senza valore NON si ripiega sul prezzo di vendita. Chi
  // chiama mette la riga a zero e lo segnala, perché un documento non deve
  // uscire a un prezzo che nessuno ha deciso.
  it('un listino non valorizzato non ripiega: nessun prezzo', () => {
    expect(listinoUnitPrice(VARIANT, 2)).toBeNull();
    expect(listinoUnitPrice(VARIANT, 3)).toBeNull();
  });

  it('una variante senza listini non ripiega, per nessuna posizione', () => {
    const senzaListini = { sellingPrice: VARIANT.sellingPrice };
    expect(listinoUnitPrice(senzaListini, 1)).toBeNull();
    expect(listinoUnitPrice(senzaListini, 'article')).toEqual(VARIANT.sellingPrice);
  });
});
