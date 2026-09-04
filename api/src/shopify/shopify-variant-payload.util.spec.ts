import { describe, expect, it } from 'vitest';

import {
  buildVariantsPayload,
  variantBulkInput,
  variantChannelFields,
} from './shopify-variant-payload.util';
import type { VariantForPayload } from './shopify-variant-payload.util';

function variante(over: Partial<VariantForPayload> = {}): VariantForPayload {
  return {
    sku: 'SKU-1',
    barcode: null,
    optionValues: [{ name: 'Taglia', value: 'M' }],
    shopifyPriceMinor: 5000,
    shopifyVariantId: null,
    ...over,
  };
}

describe('buildVariantsPayload', () => {
  /**
   * ⚠️ La prova che Luigi ha chiesto per nome, il 17/08.
   *
   * Su Shopify `compare_at_price = "0.00"` non è «nessun barrato»: è **un
   * barrato che vale zero**, e il cliente vedrebbe uno sconto inventato del
   * 100%. La chiave non deve proprio entrare nella riga.
   */
  describe('nessun barrato NON è un barrato a zero', () => {
    it('barrato null: la chiave non compare nella riga', () => {
      const { variantRows } = buildVariantsPayload([], [variante()], null);

      expect(variantRows[0]).not.toHaveProperty('compare_at_price');
    });

    it('barrato null: e non compare su NESSUNA variante', () => {
      const { variantRows } = buildVariantsPayload(
        [{ name: 'Taglia', values: ['S', 'M', 'L'] }],
        [
          variante({ optionValues: [{ name: 'Taglia', value: 'S' }] }),
          variante({ optionValues: [{ name: 'Taglia', value: 'M' }] }),
          variante({ optionValues: [{ name: 'Taglia', value: 'L' }] }),
        ],
        null,
      );

      expect(variantRows).toHaveLength(3);
      for (const row of variantRows) {
        expect(row).not.toHaveProperty('compare_at_price');
      }
    });

    it('barrato ZERO invece si manda: è una scelta, non un’assenza', () => {
      const { variantRows } = buildVariantsPayload([], [variante()], 0);

      expect(variantRows[0]).toMatchObject({ compare_at_price: '0.00' });
    });
  });

  describe('il barrato è un dato dell’articolo, replicato su ogni variante', () => {
    it('lo stesso valore finisce su tutte e tre', () => {
      const { variantRows } = buildVariantsPayload(
        [{ name: 'Taglia', values: ['S', 'M', 'L'] }],
        [
          variante({ optionValues: [{ name: 'Taglia', value: 'S' }] }),
          variante({ optionValues: [{ name: 'Taglia', value: 'M' }] }),
          variante({ optionValues: [{ name: 'Taglia', value: 'L' }] }),
        ],
        7000,
      );

      for (const row of variantRows) {
        expect(row['compare_at_price']).toBe('70.00');
      }
    });
  });

  describe('la coda decimale esce arrotondata a due, come vuole Shopify', () => {
    it('un barrato con la coda si pubblica a due decimali', () => {
      // 5737,704918 centesimi netti = i 70,00 ivati al 22% del caso reale.
      const { variantRows } = buildVariantsPayload([], [variante()], 5737.704918);

      expect(variantRows[0]!['compare_at_price']).toBe('57.38');
    });

    it('anche il prezzo del canale, che ha la stessa colonna a sei decimali', () => {
      const { variantRows } = buildVariantsPayload(
        [],
        [variante({ shopifyPriceMinor: 2049.180328 })],
        null,
      );

      expect(variantRows[0]!['price']).toBe('20.49');
    });
  });

  describe('il resto della riga', () => {
    it('senza opzioni la variante prende il Default Title di Shopify', () => {
      const { shopifyOptions, variantRows } = buildVariantsPayload([], [variante()], null);

      expect(shopifyOptions).toEqual([{ name: 'Title', values: ['Default Title'] }]);
      expect(variantRows[0]).toMatchObject({ option1: 'Default Title' });
    });

    it('la variante già pubblicata porta il suo id', () => {
      const { variantRows } = buildVariantsPayload(
        [],
        [variante({ shopifyVariantId: '123456' })],
        null,
      );

      expect(variantRows[0]).toMatchObject({ id: 123456 });
    });

    it('la variante nuova non porta id: Shopify glielo assegna', () => {
      const { variantRows } = buildVariantsPayload([], [variante()], null);

      expect(variantRows[0]).not.toHaveProperty('id');
    });
  });
});

describe('variantBulkInput — il percorso GraphQL omette le chiavi assenti', () => {
  const base = { sku: 'SKU-1', barcode: null, shopifyPriceMinor: 5000 };

  it('barrato null: `compareAtPrice` NON compare, e nemmeno `barcode` — non sono zero', () => {
    const input = variantBulkInput(
      'gid://shopify/ProductVariant/1',
      variantChannelFields(base, null),
    );
    expect(input).not.toHaveProperty('compareAtPrice');
    expect(input).not.toHaveProperty('barcode');
    expect(input).toMatchObject({
      id: 'gid://shopify/ProductVariant/1',
      price: '50.00',
      inventoryItem: { sku: 'SKU-1' },
    });
  });

  it('presenti, entrano con la grafia GraphQL', () => {
    const input = variantBulkInput(
      'gid://shopify/ProductVariant/1',
      variantChannelFields({ ...base, barcode: '8001234567890' }, 6000),
    );
    expect(input).toMatchObject({ compareAtPrice: '60.00', barcode: '8001234567890' });
  });
});
