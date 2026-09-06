import { describe, expect, it } from 'vitest';

import type { Money } from '@core/models/money.model';

import {
  listinoMissingWarning,
  listinoRepricing,
  type ListinoRepricingLine,
} from './document-listino.util';

/**
 * ⭐ **Il comportamento del Listino, provato UNA volta.**
 *
 * ⛔ Era scritto due volte — nell'Ordine cliente e in DDT/Fatture — perché dalla
 * differenza tecnica nel *procurarsi* i dati era stato concluso che fossero due
 * logiche di dominio diverse. **Non lo sono**: il Listino stabilisce quale
 * prezzo dell'anagrafica diventa il prezzo proposto delle righe, e vale sia per
 * le righe nuove sia per quelle già inserite. Che una maschera chieda al
 * servizio e l'altra legga la memoria non è una differenza funzionale.
 *
 * ⚠️ **E il Listino non fa aritmetica.** Sceglie la sorgente del prezzo; la
 * conversione netto/ivato è un meccanismo separato, che vive nella maschera
 * perché dipende dalla modalità del suo documento.
 */
describe('listinoRepricing', () => {
  const euro = (amountMinor: number): Money => ({ amountMinor, currencyCode: 'EUR' });

  function riga(
    nome: string,
    prezzi: { vendita: number; l1?: number | null; l2?: number | null },
  ): ListinoRepricingLine {
    return {
      displayName: nome,
      variant: {
        productName: nome,
        variantLabel: '',
        sellingPrice: euro(prezzi.vendita),
        listinoPrices: {
          1: prezzi.l1 == null ? null : euro(prezzi.l1),
          2: prezzi.l2 == null ? null : euro(prezzi.l2),
          3: null,
        },
      },
    };
  }

  it('⭐ «Prezzo di vendita» propone il prezzo dell’articolo', () => {
    const esito = listinoRepricing([riga('Maglia', { vendita: 10_000, l1: 9_000 })], 'article');

    expect(esito.prices[0]).toEqual(euro(10_000));
    expect(esito.missing).toEqual([]);
  });

  it('⭐ scegliere un listino propone il prezzo di QUEL listino', () => {
    // 100,00 di listino, 90,00 col Listino 1: il Listino sceglie la sorgente,
    // non applica uno sconto — il 90,00 sta in anagrafica, non si calcola.
    const esito = listinoRepricing([riga('Maglia', { vendita: 10_000, l1: 9_000 })], 1);

    expect(esito.prices[0]).toEqual(euro(9_000));
  });

  it('⭐ e vale per TUTTE le righe già presenti, non solo per le nuove', () => {
    const esito = listinoRepricing(
      [
        riga('Maglia', { vendita: 10_000, l1: 9_000 }),
        riga('Pantalone', { vendita: 5_000, l1: 4_500 }),
      ],
      1,
    );

    expect(esito.prices).toEqual([euro(9_000), euro(4_500)]);
  });

  it('⛔ una riga senza prezzo per quel listino resta SENZA, e si segnala', () => {
    // ⚠️ Non si ripiega sul prezzo di vendita: un prezzo che nessuno ha deciso
    // non deve finire in un documento senza che si veda.
    const esito = listinoRepricing(
      [
        riga('Maglia', { vendita: 10_000, l1: 9_000 }),
        riga('Cintura', { vendita: 2_000, l1: null }),
      ],
      1,
    );

    expect(esito.prices[0]).toEqual(euro(9_000));
    expect(esito.prices[1]).toBeNull();
    expect(esito.missing).toEqual(['Cintura']);
  });

  it('⛔ una riga senza articolo non si tocca e non finisce fra i mancanti', () => {
    const esito = listinoRepricing(
      [{ displayName: '', variant: null }, riga('Maglia', { vendita: 10_000, l1: 9_000 })],
      1,
    );

    expect(esito.prices[0]).toBeNull();
    expect(esito.missing).toEqual([]);
  });

  it('⭐ senza il nome sulla riga, l’avviso lo compone dall’anagrafica', () => {
    // ⛔ Nome e variante si compongono ACCANTO, non dentro: il titolo del
    // riepilogo contiene già la variante, e nominarlo così direbbe taglia e
    // colore di una riga che non li ha.
    const esito = listinoRepricing(
      [
        {
          displayName: '   ',
          variant: {
            productName: 'Maglia',
            variantLabel: 'M · Rosso',
            sellingPrice: euro(10_000),
            listinoPrices: { 1: null, 2: null, 3: null },
          },
        },
      ],
      1,
    );

    expect(esito.missing).toEqual(['Maglia · M · Rosso']);
  });
});

describe('listinoMissingWarning', () => {
  it('⛔ senza mancanti non dice niente', () => {
    expect(listinoMissingWarning('Listino 1', [])).toBe('');
  });

  it('⭐ al singolare parla di UN articolo e di UNA riga', () => {
    expect(listinoMissingWarning('Ingrosso', ['Cintura'])).toBe(
      'Ingrosso: nessun prezzo per l’articolo Cintura. La riga è rimasta a zero.',
    );
  });

  it('⭐ al plurale li accorda entrambi', () => {
    expect(listinoMissingWarning('Ingrosso', ['Cintura', 'Sciarpa'])).toBe(
      'Ingrosso: nessun prezzo per gli articoli Cintura, Sciarpa. Le righe sono rimaste a zero.',
    );
  });

  it('⛔ e l’apostrofo è UNO SOLO, quello tipografico', () => {
    // ⚠️ Le due copie di questo messaggio divergevano proprio qui: `l'articolo`
    // dritto in una maschera, `l’articolo` tipografico nell'altra. Lo stesso
    // testo con due glifi diversi a seconda di dove si stava lavorando, e
    // nessun test lo vedeva.
    const messaggio = listinoMissingWarning('Ingrosso', ['Cintura']);

    expect(messaggio).toContain('l’articolo');
    expect(messaggio).not.toContain("l'articolo");
  });
});
