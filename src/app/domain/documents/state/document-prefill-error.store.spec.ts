import { describe, expect, it } from 'vitest';

import { DocumentPrefillErrorStore } from './document-prefill-error.store';

describe('DocumentPrefillErrorStore', () => {
  it('parte in silenzio: se il precompilato arriva, non c’è niente da dire', () => {
    expect(new DocumentPrefillErrorStore().message()).toBeNull();
  });

  // Il punto del messaggio non è «è andata male»: è che salvando si crea la cosa
  // sbagliata. Senza quella frase l'avviso non aggiunge niente a una maschera
  // vuota, che l'operatore vede già.
  it('ogni origine dice cosa si creerebbe salvando lo stesso', () => {
    const conversione = new DocumentPrefillErrorStore();
    conversione.fail('convert');
    expect(conversione.message()).toContain('non la conversione');

    const conclusione = new DocumentPrefillErrorStore();
    conclusione.fail('include');
    expect(conclusione.message()).toContain('non conclude nessun ordine');

    const duplica = new DocumentPrefillErrorStore();
    duplica.fail('duplicate');
    expect(duplica.message()).toContain('non la copia');
  });

  it('la presa d’atto chiude il messaggio', () => {
    const store = new DocumentPrefillErrorStore();
    store.fail('convert');

    store.dismiss();

    expect(store.message()).toBeNull();
  });
});
