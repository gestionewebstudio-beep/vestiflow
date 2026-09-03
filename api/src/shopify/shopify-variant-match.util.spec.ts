import { describe, expect, it } from 'vitest';

import {
  describeUnmatchedVariants,
  matchOrphanVariants,
  type LocalVariantForMatch,
  type RemoteVariantForMatch,
} from './shopify-variant-match.util';

/**
 * Le 18 varianti del DB di sviluppo col prodotto collegato ma senza
 * `shopifyVariantId` sono il caso reale: `productVariantsBulkUpdate` le
 * salterebbe in silenzio. Qui si decide che NON succede.
 */
function locale(over: Partial<LocalVariantForMatch> = {}): LocalVariantForMatch {
  return { id: 'loc-1', sku: null, barcode: null, optionValues: null, shopifyVariantId: null, ...over };
}

function remota(over: Partial<RemoteVariantForMatch> = {}): RemoteVariantForMatch {
  return {
    id: 'gid://shopify/ProductVariant/1',
    sku: null,
    barcode: null,
    inventoryItemId: 'gid://shopify/InventoryItem/11',
    selectedOptions: [],
    ...over,
  };
}

describe('matchOrphanVariants', () => {
  it('⭐ abbina per SKU quando è univoco, ignorando maiuscole e spazi', () => {
    const esito = matchOrphanVariants(
      [locale({ sku: ' mag-m ' })],
      [remota({ id: 'gid://shopify/ProductVariant/1', sku: 'MAG-M' }), remota({ id: 'gid://shopify/ProductVariant/2', sku: 'MAG-L' })],
    );

    expect(esito.nonAbbinate).toEqual([]);
    expect(esito.abbinate).toEqual([
      expect.objectContaining({ localId: 'loc-1', criterio: 'sku', remote: expect.objectContaining({ id: 'gid://shopify/ProductVariant/1' }) }),
    ]);
  });

  it('⭐ senza SKU abbina per barcode, e senza barcode per opzioni', () => {
    const perBarcode = matchOrphanVariants(
      [locale({ barcode: '8001' })],
      [remota({ id: 'gid://shopify/ProductVariant/1', barcode: '8001' }), remota({ id: 'gid://shopify/ProductVariant/2', barcode: '8002' })],
    );
    expect(perBarcode.abbinate[0]?.criterio).toBe('barcode');

    const perOpzioni = matchOrphanVariants(
      [locale({ optionValues: [{ name: 'Taglia', value: 'M' }, { name: 'Colore', value: 'Rosso' }] })],
      [
        remota({ id: 'gid://shopify/ProductVariant/1', selectedOptions: [{ name: 'Colore', value: 'rosso' }, { name: 'Taglia', value: 'm' }] }),
        remota({ id: 'gid://shopify/ProductVariant/2', selectedOptions: [{ name: 'Colore', value: 'Blu' }, { name: 'Taglia', value: 'M' }] }),
      ],
    );
    expect(perOpzioni.abbinate[0]?.criterio).toBe('opzioni');
    expect(perOpzioni.abbinate[0]?.remote.id).toBe('gid://shopify/ProductVariant/1');
  });

  /*
    ⛔ Due remote con lo stesso SKU: NON si passa al barcode per «sbloccare».
    «Univoco e verificabile» vuol dire che un solo dato deve bastare, e qui non
    basta. La variante resta scollegata e lo dice.
  */
  it('⛔ due corrispondenze sullo stesso criterio → ambigua, e non si prova il successivo', () => {
    const esito = matchOrphanVariants(
      [locale({ sku: 'MAG-M', barcode: '8001' })],
      [
        remota({ id: 'gid://shopify/ProductVariant/1', sku: 'MAG-M', barcode: '9999' }),
        remota({ id: 'gid://shopify/ProductVariant/2', sku: 'MAG-M', barcode: '8001' }),
      ],
    );

    expect(esito.abbinate).toEqual([]);
    expect(esito.nonAbbinate).toEqual([{ localId: 'loc-1', sku: 'MAG-M', esito: 'ambigua', candidate: 2 }]);
  });

  it('⛔ nessuna corrispondenza → resta scollegata, con esito «nessuna»', () => {
    const esito = matchOrphanVariants([locale({ sku: 'MAG-M' })], [remota({ sku: 'ALTRO' })]);

    expect(esito.abbinate).toEqual([]);
    expect(esito.nonAbbinate).toEqual([{ localId: 'loc-1', sku: 'MAG-M', esito: 'nessuna', candidate: 0 }]);
  });

  /*
    ⛔ Una remota già collegata a un'altra variante locale non è candidata:
    altrimenti due varianti VestiFlow finirebbero sulla stessa variante Shopify.
    Vale con l'id salvato in forma numerica, che è quella del REST.
  */
  it('⛔ una remota già collegata a un\'altra locale non è candidata', () => {
    const esito = matchOrphanVariants(
      [locale({ id: 'loc-collegata', sku: 'MAG-M', shopifyVariantId: '1' }), locale({ id: 'loc-orfana', sku: 'MAG-M' })],
      [remota({ id: 'gid://shopify/ProductVariant/1', sku: 'MAG-M' })],
    );

    expect(esito.abbinate).toEqual([]);
    expect(esito.nonAbbinate).toEqual([{ localId: 'loc-orfana', sku: 'MAG-M', esito: 'nessuna', candidate: 0 }]);
  });

  it('⛔ due orfane sulla stessa remota: la prima si collega, la seconda no', () => {
    const esito = matchOrphanVariants(
      [locale({ id: 'a', sku: 'MAG-M' }), locale({ id: 'b', sku: 'MAG-M' })],
      [remota({ id: 'gid://shopify/ProductVariant/1', sku: 'MAG-M' })],
    );

    expect(esito.abbinate.map((m) => m.localId)).toEqual(['a']);
    expect(esito.nonAbbinate.map((m) => m.localId)).toEqual(['b']);
  });

  it('le varianti già collegate non partecipano e non producono esiti', () => {
    const esito = matchOrphanVariants([locale({ shopifyVariantId: '7', sku: 'X' })], []);

    expect(esito.abbinate).toEqual([]);
    expect(esito.nonAbbinate).toEqual([]);
  });
});

describe('describeUnmatchedVariants', () => {
  it('nomina la variante per SKU e dice se è ambigua o senza corrispondenza', () => {
    const testo = describeUnmatchedVariants([
      { localId: 'a', sku: 'MAG-M', esito: 'ambigua', candidate: 2 },
      { localId: 'b', sku: null, esito: 'nessuna', candidate: 0 },
    ]);

    expect(testo).toBe('MAG-M: 2 varianti Shopify corrispondono; b: nessuna variante Shopify corrisponde');
  });
});
