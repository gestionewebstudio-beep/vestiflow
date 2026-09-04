import { describe, expect, it } from 'vitest';

import {
  quantityExceedsAvailability,
  variantAvailabilityHint,
  variantEffectiveAvailable,
} from './variant-availability.util';

/**
 * ⭐ **L'avviso di disponibilità, provato in un posto solo.**
 *
 * ⛔ La regola: l'insufficienza di stock **avvisa e non blocca mai**. Escluso il
 * blocco, l'avviso è l'unico presidio — e queste prove esistono perché la
 * Fattura accompagnatoria scaricava **senza avvisare**, mentre i suoi due gemelli
 * di scarico avvisavano.
 */
describe('variantEffectiveAvailable', () => {
  const articolo = { kind: 'product', managesStock: true, stockAvailable: 8 } as never;

  it('⭐ un articolo a magazzino porta la sua disponibilità', () => {
    expect(variantEffectiveAvailable(articolo)).toBe(8);
  });

  it('⛔ `null` NON è zero: un servizio non ha disponibilità, quindi non avvisa mai', () => {
    // ⚠️ La distinzione è il punto: `0` avvisa, `null` no. Confonderli farebbe
    //   avvisare ogni riga di servizio come se fosse fuori giacenza.
    expect(variantEffectiveAvailable({ kind: 'service' } as never)).toBeNull();
    expect(variantEffectiveAvailable({ kind: 'product', managesStock: false } as never)).toBeNull();
    expect(variantEffectiveAvailable(null)).toBeNull();
    expect(variantEffectiveAvailable(undefined)).toBeNull();
  });

  it('⭐ un articolo che gestisce magazzino senza notizie vale ZERO, e quello avvisa', () => {
    expect(
      variantEffectiveAvailable({
        kind: 'product',
        managesStock: true,
        stockAvailable: null,
      } as never),
    ).toBe(0);
  });

  it('⭐ l’impegno del documento stesso si riaggiunge, o si avviserebbe da solo', () => {
    // ⚠️ Un documento che si riapre in modifica ha già prenotato la sua quantità:
    //   senza riaggiungerla, si vedrebbe avvisare per la propria prenotazione.
    expect(variantEffectiveAvailable(articolo, 5)).toBe(13);
  });
});

describe('variantAvailabilityHint', () => {
  it('⭐ entro il disponibile non dice niente', () => {
    expect(variantAvailabilityHint(8, 8)).toBeNull();
    expect(variantAvailabilityHint(8, 3)).toBeNull();
  });

  it('⛔ oltre il disponibile avvisa, e dice QUANTO ce n’è', () => {
    expect(variantAvailabilityHint(8, 12)).toBe('disponibili solo 8');
  });

  it('⛔ e con disponibilità negativa non dice «solo -4»: dice zero', () => {
    // ⚠️ La giacenza PUÒ essere negativa — è la regola. Ma «disponibili solo -4»
    //   si legge come un numero di pezzi, e non lo è.
    expect(variantAvailabilityHint(-4, 1)).toBe('disponibili solo 0');
  });

  it('⛔ dove la disponibilità non si applica, nessun avviso a nessuna quantità', () => {
    expect(variantAvailabilityHint(null, 9999)).toBeNull();
    expect(quantityExceedsAvailability(null, 9999)).toBe(false);
  });

  it('⭐ il testo è UNO: due copie divergono, e si vede tardi', () => {
    // ⚠️ È già successo su un altro messaggio di questo progetto: due copie che
    //   differivano su un apostrofo, e nessun test le confrontava.
    expect(variantAvailabilityHint(0, 1)).toBe('disponibili solo 0');
  });
});
