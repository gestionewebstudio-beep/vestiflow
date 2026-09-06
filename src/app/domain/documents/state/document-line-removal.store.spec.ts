import { FormControl, FormGroup } from '@angular/forms';
import { describe, expect, it } from 'vitest';

import { DocumentLineRemovalStore, documentLineIsEmpty } from './document-line-removal.store';

/**
 * **La regola di eliminazione, una per tutti i documenti.**
 *
 * ⛔ Prima non c'era: in cinque maschere su sei il cestino cancellava al primo
 * tocco, e nella sesta — la Vendita al banco — non faceva niente.
 */
function riga(valori: Record<string, string> = {}): FormGroup {
  return new FormGroup({
    id: new FormControl(valori['id'] ?? ''),
    variantId: new FormControl(valori['variantId'] ?? ''),
    productName: new FormControl(valori['productName'] ?? ''),
    variantLabel: new FormControl(valori['variantLabel'] ?? ''),
    sku: new FormControl(valori['sku'] ?? ''),
    barcode: new FormControl(valori['barcode'] ?? ''),
    quantity: new FormControl(valori['quantity'] ?? '1'),
    unitPrice: new FormControl(valori['unitPrice'] ?? ''),
  });
}

describe('documentLineIsEmpty', () => {
  it('una riga appena nata e vuota', () => {
    expect(documentLineIsEmpty(riga())).toBe(true);
  });

  it('⛔ la QUANTITA non conta come contenuto', () => {
    // Una riga nasce con quantità 1: contarla renderebbe nessuna riga mai
    // vuota, e la conferma scatterebbe sempre — cioè non direbbe più niente.
    expect(documentLineIsEmpty(riga({ quantity: '7' }))).toBe(true);
  });

  it('con un articolo agganciato non è vuota', () => {
    expect(documentLineIsEmpty(riga({ variantId: 'v-1' }))).toBe(false);
  });

  it('basta un codice digitato a mano', () => {
    expect(documentLineIsEmpty(riga({ sku: 'MAG-001' }))).toBe(false);
  });

  it('basta un prezzo scritto', () => {
    expect(documentLineIsEmpty(riga({ unitPrice: '12,00' }))).toBe(false);
  });

  it('⭐ una riga GIA PERSISTITA non è mai vuota, anche se svuotata a mano', () => {
    // Al salvataggio sparirebbe dal documento: è un'eliminazione vera.
    expect(documentLineIsEmpty(riga({ id: 'line-1' }))).toBe(false);
  });

  it('gli spazi non sono contenuto', () => {
    expect(documentLineIsEmpty(riga({ productName: '   ' }))).toBe(true);
  });
});

describe('DocumentLineRemovalStore', () => {
  it('riga vuota: si elimina subito, nessuna conferma', () => {
    const store = new DocumentLineRemovalStore();
    expect(store.request(0, riga())).toBe(true);
    expect(store.confirmOpen()).toBe(false);
  });

  it('riga con contenuto: si apre la conferma e non si elimina', () => {
    const store = new DocumentLineRemovalStore();
    expect(store.request(2, riga({ productName: 'Maglietta' }))).toBe(false);
    expect(store.confirmOpen()).toBe(true);
  });

  it('⭐ la conferma NOMINA la riga, con la variante', () => {
    // Su venti righe, una conferma che non dice quale non è verificabile.
    const store = new DocumentLineRemovalStore();
    store.request(0, riga({ productName: 'Maglietta cotone', variantLabel: 'M / Rosso' }));
    expect(store.message()).toContain('Maglietta cotone, M / Rosso');
  });

  it('una riga persistita senza nome ha comunque un messaggio leggibile', () => {
    const store = new DocumentLineRemovalStore();
    store.request(0, riga({ id: 'line-1' }));
    expect(store.message()).toContain('La riga');
  });

  it('confermando restituisce l indice, e chiude', () => {
    const store = new DocumentLineRemovalStore();
    store.request(3, riga({ sku: 'X' }));
    expect(store.confirm()).toBe(3);
    expect(store.confirmOpen()).toBe(false);
  });

  it('annullando non restituisce niente', () => {
    const store = new DocumentLineRemovalStore();
    store.request(3, riga({ sku: 'X' }));
    store.dismiss();
    expect(store.confirmOpen()).toBe(false);
    expect(store.confirm()).toBeNull();
  });

  it('⛔ confermare senza una richiesta in attesa non elimina la riga zero', () => {
    // `null` e `0` sono due cose diverse, e confonderle qui cancellerebbe la
    // prima riga del documento a ogni conferma a vuoto.
    const store = new DocumentLineRemovalStore();
    expect(store.confirm()).toBeNull();
  });
});
