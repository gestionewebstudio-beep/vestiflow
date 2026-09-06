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

// ⭐ La variante BASE: un prodotto semplice in VestiFlow ha UNA variante senza
//    opzioni, e su Shopify la stessa cosa si chiama «Default Title».
//    Senza questo criterio 12 prodotti su 18 del negozio di prova non si
//    sincronizzavano più: nessuno dei tre criteri aveva una chiave da confrontare.
describe('matchOrphanVariants — la variante base', () => {
  const nudaLocale = {
    id: 'var-1',
    sku: null,
    barcode: null,
    optionValues: [],
    shopifyVariantId: null,
  };
  const nudaRemota = {
    id: 'gid://shopify/ProductVariant/1',
    sku: null,
    barcode: null,
    inventoryItemId: 'gid://shopify/InventoryItem/9',
    selectedOptions: [{ name: 'Title', value: 'Default Title' }],
  };

  it('⭐ una locale nuda e una remota «Default Title» si collegano', () => {
    const esito = matchOrphanVariants([nudaLocale], [nudaRemota]);

    expect(esito.nonAbbinate).toHaveLength(0);
    expect(esito.abbinate).toEqual([
      { localId: 'var-1', remote: nudaRemota, criterio: 'base' },
    ]);
  });

  it('vale anche se la remota non ha proprio opzioni', () => {
    const esito = matchOrphanVariants([nudaLocale], [{ ...nudaRemota, selectedOptions: [] }]);

    expect(esito.abbinate).toHaveLength(1);
    expect(esito.abbinate[0]?.criterio).toBe('base');
  });

  it('⛔ due locali libere: non si applica, e il push si ferma', () => {
    const esito = matchOrphanVariants(
      [nudaLocale, { ...nudaLocale, id: 'var-2' }],
      [nudaRemota],
    );

    expect(esito.abbinate).toHaveLength(0);
    expect(esito.nonAbbinate).toHaveLength(2);
  });

  it('⛔ due remote libere: non si applica', () => {
    const esito = matchOrphanVariants(
      [nudaLocale],
      [nudaRemota, { ...nudaRemota, id: 'gid://shopify/ProductVariant/2' }],
    );

    expect(esito.abbinate).toHaveLength(0);
    expect(esito.nonAbbinate[0]?.esito).toBe('nessuna');
  });

  it('⛔ un identificativo presente da una parte sola: sono varianti diverse, non si indovina', () => {
    const conSku = matchOrphanVariants([{ ...nudaLocale, sku: 'SKU-1' }], [nudaRemota]);
    const remotaConBarcode = matchOrphanVariants(
      [nudaLocale],
      [{ ...nudaRemota, barcode: '8001' }],
    );

    expect(conSku.abbinate).toHaveLength(0);
    expect(remotaConBarcode.abbinate).toHaveLength(0);
  });

  it('⛔ SKU presenti ma DISCORDANTI: non si applica nemmeno con una per lato', () => {
    const esito = matchOrphanVariants(
      [{ ...nudaLocale, sku: 'SKU-1' }],
      [{ ...nudaRemota, sku: 'SKU-2' }],
    );

    expect(esito.abbinate).toHaveLength(0);
    expect(esito.nonAbbinate[0]?.esito).toBe('nessuna');
  });

  it('⛔ un\'opzione commerciale VERA non è «Default Title»: non si applica', () => {
    const esito = matchOrphanVariants(
      [{ ...nudaLocale, optionValues: [{ name: 'Taglia', value: 'M' }] }],
      [{ ...nudaRemota, selectedOptions: [{ name: 'Taglia', value: 'L' }] }],
    );

    expect(esito.abbinate).toHaveLength(0);
  });

  it('⛔ la REMOTA con un’opzione commerciale vera: la locale è nuda, ma non è la stessa variante', () => {
    const esito = matchOrphanVariants(
      [nudaLocale],
      [{ ...nudaRemota, selectedOptions: [{ name: 'Taglia', value: 'M' }] }],
    );

    expect(esito.abbinate).toHaveLength(0);
    expect(esito.nonAbbinate[0]?.esito).toBe('nessuna');
  });

  it('⛔ e una remota già collegata a un\'altra locale non è libera', () => {
    const esito = matchOrphanVariants(
      [nudaLocale, { ...nudaLocale, id: 'var-2', shopifyVariantId: '1' }],
      [nudaRemota],
    );

    expect(esito.abbinate).toHaveLength(0);
    expect(esito.nonAbbinate[0]?.localId).toBe('var-1');
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
