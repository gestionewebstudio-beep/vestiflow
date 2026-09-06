import { describe, expect, it } from 'vitest';

import { senzaValore } from './segnaposto.util';

describe('senzaValore', () => {
  it('riconosce i tre trattini, che sono caratteri diversi', () => {
    expect(senzaValore('—')).toBe(true); // U+2014, quello che rendono le celle
    expect(senzaValore('–')).toBe(true); // U+2013
    expect(senzaValore('-')).toBe(true); // il meno da tastiera
  });

  it('riconosce «non disponibile» nelle due grafie in uso', () => {
    expect(senzaValore('N/D')).toBe(true);
    expect(senzaValore('n/d')).toBe(true);
  });

  it('riconosce il vuoto, anche di soli spazi', () => {
    expect(senzaValore('')).toBe(true);
    expect(senzaValore('   ')).toBe(true);
    expect(senzaValore(' — ')).toBe(true);
  });

  /*
    ⚠️ **La metà che conta.** Una guardia che riconosce solo le assenze si rompe
    restando verde: basta che cominci a dire «assente» anche su un valore vero, e
    nessuna prova se ne accorge. Ogni riga qui sotto è un valore che il gestionale
    mostra davvero, e che NON deve sparire dall'elenco di un filtro.
  */
  it('⚠️ e NON scambia per assenza un valore vero', () => {
    expect(senzaValore('0,00 €')).toBe(false); // zero è un importo
    expect(senzaValore('-25,00 €')).toBe(false); // comincia col meno, non è un meno
    expect(senzaValore('—25')).toBe(false); // trattino attaccato a una cifra
    expect(senzaValore('29/08/2026')).toBe(false);
    expect(senzaValore('Confermato')).toBe(false);
    expect(senzaValore('N/D 3')).toBe(false); // contiene il segnaposto, non lo è
    expect(senzaValore('ND')).toBe(false); // senza barra è un codice
  });
});
