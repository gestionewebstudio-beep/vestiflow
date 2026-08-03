import { describe, expect, it } from 'vitest';

import { CatalogOrigin } from '@core/models/catalog-origin.model';
import { ProductStatus } from '@core/models/product.model';
import { DEFAULT_CURRENCY } from '@core/utils/money.util';

import { OPTION_NAME_COLOR, OPTION_NAME_SIZE } from './product-form.model';
import {
  emptyProductFormDraft,
  ensureQuickModeDraft,
  generateVariantDrafts,
  productToFormDraft,
  toCreateProductDto,
} from './product-form.mapper';

describe('product-form.mapper', () => {
  describe('emptyProductFormDraft', () => {
    it('inizializza draft vuoto con assi Taglia e Colore', () => {
      const draft = emptyProductFormDraft();
      expect(draft.general.name).toBe('');
      expect(draft.general.status).toBe(ProductStatus.Draft);
      expect(draft.options.axes.map((a) => a.name)).toEqual([OPTION_NAME_SIZE, OPTION_NAME_COLOR]);
      expect(draft.variants).toEqual([]);
    });
  });

  describe('generateVariantDrafts', () => {
    it('preserva varianti esistenti con stessa combinazione', () => {
      const existing = [
        {
          key: 'old-key',
          id: 'var-1',
          optionValues: [
            { name: 'Taglia', value: 'M' },
            { name: 'Colore', value: 'Rosso' },
          ],
          sku: 'SKU-CUSTOM',
          sellingPrice: 49.99,
          shopifyPrice: 49.99,
          purchasePrice: 20,
          barcode: '123',
          included: true,
        },
      ];
      const options = {
        axes: [
          { name: 'Taglia', values: ['M', 'L'] },
          { name: 'Colore', values: ['Rosso'] },
        ],
      };

      const drafts = generateVariantDrafts(options, 'Maglietta', existing);
      const preserved = drafts.find((d) => d.sku === 'SKU-CUSTOM');
      expect(preserved?.sku).toBe('SKU-CUSTOM');
      expect(preserved?.sellingPrice).toBe(49.99);
      expect(preserved?.sellingPrice).toBe(49.99);
      expect(drafts.length).toBe(2);
    });
  });

  describe('ensureQuickModeDraft', () => {
    it('crea una variante unica con SKU vuoto: mai generato in automatico dal nome', () => {
      const draft = ensureQuickModeDraft({
        ...emptyProductFormDraft(),
        general: { ...emptyProductFormDraft().general, name: 'Maglietta Basic' },
      });

      expect(draft.variants).toHaveLength(1);
      expect(draft.variants[0]?.optionValues).toEqual([]);
      expect(draft.variants[0]?.sku).toBe('');
    });

    it('con preserveSku=true mantiene lo SKU gia presente (es. prefill esplicito)', () => {
      const withSku = {
        ...emptyProductFormDraft(),
        general: { ...emptyProductFormDraft().general, name: 'Maglietta Basic' },
        variants: [
          {
            key: '',
            optionValues: [],
            sku: 'PREFILL-001',
            sellingPrice: 0,
            shopifyPrice: 0,
            purchasePrice: null,
            barcode: '',
            included: true,
          },
        ],
      };

      const draft = ensureQuickModeDraft(withSku, true);

      expect(draft.variants[0]?.sku).toBe('PREFILL-001');
    });
  });

  describe('toCreateProductDto', () => {
    it('converte prezzi e tag, esclude varianti non incluse', () => {
      const draft = {
        ...emptyProductFormDraft(),
        general: {
          ...emptyProductFormDraft().general,
          name: '  Giacca  ',
          tags: 'primavera, cotone, primavera',
        },
        options: { axes: [{ name: 'Taglia', values: ['M'] }] },
        variants: [
          {
            key: 'k1',
            optionValues: [{ name: 'Taglia', value: 'M' }],
            sku: 'SKU-M',
            sellingPrice: 99.9,
            shopifyPrice: 99.9,
            purchasePrice: 40,
            barcode: '',
            included: true,
          },
          {
            key: 'k2',
            optionValues: [{ name: 'Taglia', value: 'L' }],
            sku: 'SKU-L',
            sellingPrice: 99.9,
            shopifyPrice: 99.9,
            purchasePrice: null,
            barcode: '',
            included: false,
          },
        ],
      };

      const dto = toCreateProductDto(draft);
      expect(dto.name).toBe('Giacca');
      expect(dto.tags).toEqual(['primavera', 'cotone']);
      expect(dto.variants).toHaveLength(1);
      expect(dto.variants[0]?.sellingPrice).toEqual({
        amountMinor: 9990,
        currencyCode: DEFAULT_CURRENCY,
      });
    });

    // Listini (§B): il backend distingue "azzera" da "non toccare" sul null.
    it('listini: valorizzato -> Money netto, vuoto -> null (azzera)', () => {
      const empty = emptyProductFormDraft();
      const draft = {
        ...empty,
        general: {
          ...empty.general,
          name: 'Giacca',
          listino1Price: 25,
          listino2Price: null,
        },
      };

      const dto = toCreateProductDto(draft, true);
      expect(dto.listino1Price).toEqual({ amountMinor: 2500, currencyCode: DEFAULT_CURRENCY });
      expect(dto.listino2Price).toBeNull();
      expect(dto.listino3Price).toBeNull();
      // La modalità viaggia solo per farsi ricordare: non è un dato dell'articolo.
      expect(dto.listinoPricesIncludeVat).toBe(true);
    });

    it('senza modalità indicata il payload non la menziona (nessuna preferenza da ricordare)', () => {
      const empty = emptyProductFormDraft();
      const dto = toCreateProductDto({
        ...empty,
        general: { ...empty.general, name: 'Giacca' },
      });

      expect(dto).not.toHaveProperty('listinoPricesIncludeVat');
    });

    it('codice articolo: vuoto -> undefined (progressivo dal backend), valorizzato -> MAIUSCOLO', () => {
      const empty = emptyProductFormDraft();
      const draftWithout = {
        ...empty,
        general: { ...empty.general, name: 'Solo nome' },
        variants: [
          {
            key: 'k1',
            optionValues: [],
            sku: '',
            sellingPrice: 10,
            shopifyPrice: 10,
            purchasePrice: null,
            barcode: '',
            included: true,
          },
        ],
      };
      expect(toCreateProductDto(draftWithout).articleCode).toBeUndefined();

      const draftWith = {
        ...draftWithout,
        general: { ...draftWithout.general, articleCode: ' abc001 ' },
      };
      expect(toCreateProductDto(draftWith).articleCode).toBe('ABC001');
    });

    it('SKU vuoto non viene inviato (undefined, mai stringa vuota): creazione senza SKU', () => {
      const draft = {
        ...emptyProductFormDraft(),
        general: { ...emptyProductFormDraft().general, name: 'Solo nome' },
        variants: [
          {
            key: 'k1',
            optionValues: [],
            sku: '  ',
            sellingPrice: 10,
            shopifyPrice: 10,
            purchasePrice: null,
            barcode: '',
            included: true,
          },
        ],
      };

      const dto = toCreateProductDto(draft);
      expect(dto.variants[0]?.sku).toBeUndefined();
    });
  });

  describe('productToFormDraft round-trip', () => {
    it('ricostruisce draft coerente con prodotto e varianti', () => {
      const product = {
        id: 'prod-1',
        tenantId: 'tenant-1',
        articleCode: '00007',
        name: 'Pantaloni',
        description: 'Descrizione',
        category: 'Abbigliamento',
        status: ProductStatus.Active,
        shopifySyncEnabled: true,
        catalogOrigin: CatalogOrigin.VestiFlow,
        options: [{ name: 'Taglia', values: ['M'] }],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      };
      const variants = [
        {
          id: 'var-1',
          productId: 'prod-1',
          sku: 'PANT-M',
          optionValues: [{ name: 'Taglia', value: 'M' }],
          sellingPrice: { amountMinor: 5990, currencyCode: DEFAULT_CURRENCY },
          purchasePrice: { amountMinor: 2500, currencyCode: DEFAULT_CURRENCY },
        },
      ];

      const draft = productToFormDraft(product, variants);
      const dto = toCreateProductDto(draft);

      expect(draft.general.articleCode).toBe('00007');
      expect(dto.articleCode).toBe('00007');
      expect(draft.general.name).toBe('Pantaloni');
      expect(draft.variants[0]?.sellingPrice).toBe(59.9);
      expect(dto.variants[0]?.sku).toBe('PANT-M');
      expect(dto.variants[0]?.sellingPrice.amountMinor).toBe(5990);
    });
  });
});
