import { ProductStatus } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import type { ShopifyRemoteVariantConIdentita } from './shopify-graphql.client';
import {
  abbinaVariantiPerIdentita,
  buildProductSetCreateInput,
  buildVariantCreateInputs,
  conflittiDiCombinazione,
  IDENTITA_PRODOTTO,
  IDENTITA_VARIANTE,
} from './shopify-identita-catalogo.util';

/**
 * L'identità VestiFlow nel payload di creazione e nell'abbinamento (docs/30 §7.2-bis).
 * Il contratto con il negozio è provato altrove (G1–G7): qui si prova che il payload la
 * porti, e che l'abbinamento la usi — e non lo SKU.
 */
describe("shopify-identita-catalogo.util — l'identità nel payload e nell'abbinamento", () => {
  const OPZIONI = [{ name: 'Taglia', values: ['M', 'L'] }];
  const prodotto = {
    id: 'prod-1',
    name: 'Maglia',
    shopifyTitle: null,
    description: null,
    brand: 'Marca',
    shopifyProductType: null,
    tags: ['estate'],
    status: ProductStatus.active,
  };
  const varianti = [
    {
      id: 'var-M',
      sku: 'SKU-M',
      barcode: null,
      optionValues: [{ name: 'Taglia', value: 'M' }],
      shopifyPriceMinor: 2990,
      shopifyVariantId: null,
    },
    {
      id: 'var-L',
      sku: null,
      barcode: '8001234567890',
      optionValues: [{ name: 'Taglia', value: 'L' }],
      shopifyPriceMinor: 3190,
      shopifyVariantId: null,
    },
  ];
  const remota = (
    over: Partial<ShopifyRemoteVariantConIdentita>,
  ): ShopifyRemoteVariantConIdentita => ({
    id: 'gid://shopify/ProductVariant/1',
    sku: null,
    barcode: null,
    inventoryItemId: 'gid://shopify/InventoryItem/1',
    selectedOptions: [],
    title: 'M',
    price: '0.00',
    identita: null,
    ...over,
  });

  it("productSet in sola creazione: identità del prodotto, opzioni nell'ordine locale, e TUTTE le varianti con la loro identità nell'ordine locale", () => {
    const input = buildProductSetCreateInput(prodotto, OPZIONI, varianti, null);

    expect(input.metafields).toEqual([
      {
        namespace: IDENTITA_PRODOTTO.namespace,
        key: IDENTITA_PRODOTTO.key,
        type: 'id',
        value: 'prod-1',
      },
    ]);
    expect(input.productOptions).toEqual([
      { name: 'Taglia', values: [{ name: 'M' }, { name: 'L' }] },
    ]);
    expect(input.title).toBe('Maglia');
    expect(input.status).toBe('ACTIVE');
    // ⛔ Mai un id né un identifier: è una creazione.
    expect('id' in input).toBe(false);
    expect('identifier' in input).toBe(false);
    expect(input.variants.map((v) => v.optionValues)).toEqual([
      [{ optionName: 'Taglia', name: 'M' }],
      [{ optionName: 'Taglia', name: 'L' }],
    ]);
    expect(input.variants[0]).toMatchObject({
      price: '29.90',
      sku: 'SKU-M',
      inventoryItem: { tracked: true },
      metafields: [
        {
          namespace: IDENTITA_VARIANTE.namespace,
          key: IDENTITA_VARIANTE.key,
          type: 'id',
          value: 'var-M',
        },
      ],
    });
    // Una variante senza SKU è una riga come le altre; il barcode viaggia.
    expect(input.variants[1]).toMatchObject({
      barcode: '8001234567890',
      metafields: [{ value: 'var-L' }],
    });
    expect('sku' in input.variants[1]!).toBe(false);
  });

  it('senza opzioni il prodotto è a variante UNICA: opzione «Title» / «Default Title», come lo rappresenta Shopify (G11)', () => {
    const input = buildProductSetCreateInput(prodotto, [], [varianti[0]!], null);

    expect(input.productOptions).toEqual([{ name: 'Title', values: [{ name: 'Default Title' }] }]);
    expect(input.variants).toHaveLength(1);
    expect(input.variants[0]!.optionValues).toEqual([
      { optionName: 'Title', name: 'Default Title' },
    ]);
    expect(input.variants[0]!.metafields[0]!.value).toBe('var-M');
  });

  it('nessun limite né troncamento: tutte le varianti locali vanno nel payload', () => {
    const tante = Array.from({ length: 120 }, (_, i) => ({
      ...varianti[0]!,
      id: `var-${i}`,
      sku: `SKU-${i}`,
      optionValues: [{ name: 'Taglia', value: `T${i}` }],
    }));
    const opzioni = [{ name: 'Taglia', values: tante.map((_, i) => `T${i}`) }];

    const input = buildProductSetCreateInput(prodotto, opzioni, tante, null);

    expect(input.variants).toHaveLength(120);
    expect(input.productOptions[0]!.values).toHaveLength(120);
    expect(new Set(input.variants.map((v) => v.metafields[0]!.value)).size).toBe(120);
  });

  it('ogni riga di bulkCreate porta la PROPRIA identità, e lo SKU è facoltativo', () => {
    const righe = buildVariantCreateInputs(varianti, OPZIONI, null);

    expect(righe).toHaveLength(2);
    expect(righe[0]!.metafields).toEqual([
      {
        namespace: IDENTITA_VARIANTE.namespace,
        key: IDENTITA_VARIANTE.key,
        type: 'id',
        value: 'var-M',
      },
    ]);
    expect(righe[0]!.optionValues).toEqual([{ optionName: 'Taglia', name: 'M' }]);
    expect(righe[0]!.price).toBe('29.90');
    expect(righe[0]!.inventoryItem).toEqual({ tracked: true, sku: 'SKU-M' });
    // ⭐ Una variante senza SKU è una riga come le altre: l'identità non dipende dal codice.
    expect(righe[1]!.metafields![0]!.value).toBe('var-L');
    expect(righe[1]!.barcode).toBe('8001234567890');
  });

  it("il completamento traccia la giacenza ANCHE senza SKU, come la prima creazione: inventoryItem.tracked sempre true, lo SKU solo se c'è", () => {
    const righe = buildVariantCreateInputs(varianti, OPZIONI, null);
    const creazione = buildProductSetCreateInput(prodotto, OPZIONI, varianti, null);

    // ⛔ Qui la prova fissava `inventoryItem` ASSENTE senza SKU: cioè il difetto. Una
    //    variante senza codice deve nascere tracciata da entrambi i percorsi.
    expect(righe[1]!.inventoryItem).toEqual({ tracked: true });
    expect('sku' in righe[1]!.inventoryItem!).toBe(false);
    expect(righe.map((r) => r.inventoryItem?.tracked)).toEqual([true, true]);
    expect(creazione.variants.map((v) => v.inventoryItem?.tracked)).toEqual([true, true]);
  });

  it("l'abbinamento è PER IDENTITÀ: lo SKU uguale non basta, l'identità uguale basta anche senza SKU", () => {
    const remote = [
      // Stesso SKU della M locale ma senza identità: NON è nostra (variante iniziale o fatta a mano).
      remota({ id: 'gid://shopify/ProductVariant/10', sku: 'SKU-M' }),
      // Identità della L locale, senza SKU: è lei.
      remota({ id: 'gid://shopify/ProductVariant/11', identita: 'var-L', title: 'L' }),
      // Identità di una variante che localmente non esiste più.
      remota({ id: 'gid://shopify/ProductVariant/12', identita: 'var-X', title: 'X' }),
    ];

    const esito = abbinaVariantiPerIdentita(varianti, remote);

    expect(esito.abbinate).toEqual([{ varianteId: 'var-L', remota: remote[1] }]);
    expect(esito.localiSenzaRemota).toEqual(['var-M']);
    expect(esito.remoteSenzaIdentita).toEqual([remote[0]]);
  });

  describe('il conflitto di combinazione: una remota senza identità sulla stessa combinazione', () => {
    it('nomina la locale mancante la cui combinazione è occupata, e ignora le altre', () => {
      const remote = [
        // La iniziale «M», senza identità: occupa la combinazione della M locale.
        remota({
          id: 'gid://shopify/ProductVariant/10',
          selectedOptions: [{ name: 'Taglia', value: 'M' }],
        }),
        // Una remota CON identità sulla L: non è un conflitto, è nostra (si abbina altrove).
        remota({
          id: 'gid://shopify/ProductVariant/11',
          identita: 'var-L',
          selectedOptions: [{ name: 'Taglia', value: 'L' }],
        }),
      ];
      const senzaIdentita = remote.filter((r) => !r.identita);

      const conflitti = conflittiDiCombinazione(varianti, senzaIdentita, OPZIONI);

      expect(conflitti).toEqual([
        { varianteId: 'var-M', sku: 'SKU-M', combinazione: 'M', remota: remote[0] },
      ]);
    });

    it('lo SKU uguale NON è un conflitto e NON è un abbinamento: contano solo le opzioni', () => {
      const remote = [
        remota({
          id: 'gid://shopify/ProductVariant/12',
          sku: 'SKU-M',
          selectedOptions: [{ name: 'Taglia', value: 'XL' }],
        }),
      ];
      expect(conflittiDiCombinazione(varianti, remote, OPZIONI)).toEqual([]);
    });

    it('con più opzioni la combinazione è la sequenza intera, nell ordine del prodotto', () => {
      const opzioni = [
        { name: 'Taglia', values: ['M'] },
        { name: 'Colore', values: ['Rosso', 'Blu'] },
      ];
      const locale = {
        id: 'var-MB',
        sku: null,
        optionValues: [
          { name: 'Colore', value: 'Blu' },
          { name: 'Taglia', value: 'M' },
        ],
      };
      const occupata = remota({
        id: 'gid://shopify/ProductVariant/13',
        selectedOptions: [
          { name: 'Taglia', value: 'M' },
          { name: 'Colore', value: 'Blu' },
        ],
      });
      const libera = remota({
        id: 'gid://shopify/ProductVariant/14',
        selectedOptions: [
          { name: 'Taglia', value: 'M' },
          { name: 'Colore', value: 'Rosso' },
        ],
      });
      expect(conflittiDiCombinazione([locale], [libera], opzioni)).toEqual([]);
      expect(conflittiDiCombinazione([locale], [occupata], opzioni)[0]!.combinazione).toBe(
        'M / Blu',
      );
    });
  });

  // ⛔ Qui c'erano le prove di `titoloVarianteIniziale` e `varianteInizialeIntatta`: la
  //    variante iniziale di `productCreate` non esiste più con `productSet` (15/09/2026).
});
