import { ProductStatus } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { productChannelFields } from './shopify-product-payload.util';

import type { ProductForChannel } from './shopify-product-payload.util';

/**
 * ⛔ **IL TIPO PRODOTTO SHOPIFY NON È LA CATEGORIA VESTIFLOW.**
 *
 * Fino all'11/09/2026 questa funzione scriveva `productType: product.category`,
 * cioè mandava sul canale la classificazione di magazzino. La matrice canonica
 * (`docs/24` §9.5) dice l'opposto, e in entrambe le direzioni: la categoria
 * VestiFlow «non viene inviata a Shopify e non viene sovrascritta da Shopify».
 *
 * ⚠️ La colonna `shopifyProductType` nasce **vuota per tutti** — decisione del
 *    proprietario dell'11/09/2026, nessuna copia dalla categoria interna. Ne
 *    discende il caso che conta di più qui sotto: **vuoto non vuol dire
 *    «cancella»**, o il primo invio dopo la separazione svuoterebbe il tipo
 *    prodotto di tutto il catalogo remoto.
 */
const BASE: ProductForChannel = {
  name: 'MAGL-COT-BLU',
  shopifyTitle: 'Maglia in cotone blu — collezione estate 2026',
  description: 'Maglia in cotone pettinato.',
  brand: 'Acme',
  shopifyProductType: null,
  tags: ['estate', 'donna'],
  status: ProductStatus.active,
};

describe('productChannelFields — il tipo prodotto Shopify', () => {
  it('⛔ campo NON ANCORA ACQUISITO: la chiave non entra nel payload', () => {
    const campi = productChannelFields({ ...BASE, shopifyProductType: null });

    // ⭐ `undefined` sparisce dalla serializzazione JSON, quindi Shopify non
    //    riceve nessun `product_type` e lascia quello che ha. Una stringa vuota
    //    sarebbe invece una cancellazione: è la differenza che questa prova
    //    tiene ferma.
    expect(campi.productType).toBeUndefined();
    expect(Object.keys(JSON.parse(JSON.stringify(campi)))).not.toContain('productType');
  });

  it('⭐ campo acquisito: esce col suo valore', () => {
    const campi = productChannelFields({ ...BASE, shopifyProductType: 'Maglieria' });

    expect(campi.productType).toBe('Maglieria');
  });

  it('⛔ la CATEGORIA INTERNA non esce mai, nemmeno sotto un altro nome', () => {
    // La categoria VestiFlow non è più nemmeno un campo di `ProductForChannel`:
    // un oggetto che la porti resta accettato per struttura, e deve restare
    // ignorato. È il difetto che si vuole rendere impossibile da rifare.
    const conCategoriaInterna = {
      ...BASE,
      shopifyProductType: null,
      category: 'Abbigliamento donna',
    } as ProductForChannel;

    const campi = productChannelFields(conCategoriaInterna);

    expect(campi.productType).toBeUndefined();
    expect(JSON.stringify(campi)).not.toContain('Abbigliamento donna');
  });

  it('⭐ i due campi sono indipendenti: il tipo prodotto esce, la categoria no', () => {
    const campi = productChannelFields({
      ...BASE,
      shopifyProductType: 'Maglieria',
      category: 'Abbigliamento donna',
    } as ProductForChannel);

    expect(campi.productType).toBe('Maglieria');
    expect(JSON.stringify(campi)).not.toContain('Abbigliamento donna');
  });
});

describe('productChannelFields — il resto del payload non cambia', () => {
  it('manda il Nome Shopify, non il nome interno', () => {
    expect(productChannelFields(BASE).title).toBe(
      'Maglia in cotone blu — collezione estate 2026',
    );
  });

  it('ripiega sul nome interno solo se il Nome Shopify non è mai stato inizializzato', () => {
    expect(productChannelFields({ ...BASE, shopifyTitle: null }).title).toBe('MAGL-COT-BLU');
  });

  it('senza tag la chiave non entra: elenco vuoto non è «togli i tag»', () => {
    expect(productChannelFields({ ...BASE, tags: [] }).tags).toBeUndefined();
  });

  it('il brand vuoto non diventa stringa vuota', () => {
    expect(productChannelFields({ ...BASE, brand: null }).vendor).toBeUndefined();
  });

  it('lo stato segue quello locale', () => {
    expect(productChannelFields({ ...BASE, status: ProductStatus.archived }).status).toBe(
      'ARCHIVED',
    );
  });
});
