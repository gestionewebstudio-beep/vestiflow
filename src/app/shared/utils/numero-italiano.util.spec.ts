import { describe, expect, it } from 'vitest';

import { numeroItaliano, sonoTuttiNumeri } from './numero-italiano.util';

/*
  ⚠️ **Ogni prova asserisce il VALORE, non solo il rifiuto.** Un lettore che
  tornasse sempre `0` supererebbe una prova che verifica solo «non è null», e
  l'ordinamento sarebbe di nuovo casuale — con tutti i test verdi.
*/
describe('numeroItaliano', () => {
  it('legge un importo con la valuta', () => {
    expect(numeroItaliano('6,33 €')).toBe(6.33);
    expect(numeroItaliano('732,00 €')).toBe(732);
  });

  it('⛔ il punto separa le MIGLIAIA, non i decimali', () => {
    expect(numeroItaliano('1.234,56')).toBe(1234.56);
    expect(numeroItaliano('1.234,56 €')).toBe(1234.56);
    // parseFloat qui direbbe 1.234, cioè mille volte meno.
    expect(numeroItaliano('12.500,00 €')).toBe(12500);
  });

  it('⛔ riconosce ENTRAMBI i segni di meno', () => {
    expect(numeroItaliano('-25,00 €')).toBe(-25);
    // U+2212, il meno tipografico che alcune formattazioni producono.
    expect(numeroItaliano('−25,00 €')).toBe(-25);
  });

  /*
    ⭐ **QUESTA È LA FORMA CHE ARRIVA DAVVERO DALLA CELLA.**

    ⚠️ `Intl.NumberFormat('it-IT', { style: 'currency' })` non separa l'importo dal
    simbolo con lo spazio da tastiera: mette uno **spazio unificatore** (U+00A0), e
    in alcune combinazioni uno spazio stretto (U+202F). Le prove qui sopra usano
    tutte lo spazio normale, quindi provano una stringa che nessuna cella produce.

    ⛔ Serve in particolare da quando il `.trim()` finale è stato tolto (era morto:
    `\\s` aveva già portato via ogni spazio): questa prova è ciò che lo dimostra
    invece di affermarlo.
  */
  it('⭐ legge lo spazio UNIFICATORE, che è quello che la cella contiene', () => {
    expect(numeroItaliano('6,33 €')).toBe(6.33);
    expect(numeroItaliano('1.234,56 €')).toBe(1234.56);
    expect(numeroItaliano('  42,00 € ')).toBe(42);
    expect(numeroItaliano('22 %')).toBe(22);
  });

  it('legge interi e percentuali', () => {
    expect(numeroItaliano('7')).toBe(7);
    expect(numeroItaliano('22 %')).toBe(22);
    expect(numeroItaliano('0,00 €')).toBe(0);
  });

  it('rifiuta ciò che non è un numero', () => {
    expect(numeroItaliano('Confermato')).toBeNull();
    expect(numeroItaliano('—')).toBeNull();
    expect(numeroItaliano('')).toBeNull();
    expect(numeroItaliano('OF-Mi-0020')).toBeNull();
    // Una data non è un numero, e va all'ordinamento delle date.
    expect(numeroItaliano('29/08/2026')).toBeNull();
  });

  /*
    ⭐ **La prova che vale davvero**: è l'ordine che il proprietario ha visto
    sbagliato nel filtro della colonna Totale, il 01/09/2026.
  */
  it('⭐ ordina come numeri ciò che l’ordine alfabetico mescolava', () => {
    const visti = ['0,00 €', '10,98 €', '3,66 €', '35,14 €', '4,88 €', '732,00 €', '-25,00 €'];
    const ordinati = [...visti].sort((a, b) => (numeroItaliano(a) ?? 0) - (numeroItaliano(b) ?? 0));

    expect(ordinati).toEqual([
      '-25,00 €',
      '0,00 €',
      '3,66 €',
      '4,88 €',
      '10,98 €',
      '35,14 €',
      '732,00 €',
    ]);
  });
});

describe('sonoTuttiNumeri', () => {
  it('sì quando lo sono tutti', () => {
    expect(sonoTuttiNumeri(['1,00 €', '-2,50 €', '30'])).toBe(true);
  });

  it('⛔ no con un solo valore non numerico: mescolerebbe due grammatiche', () => {
    expect(sonoTuttiNumeri(['1,00 €', 'Confermato'])).toBe(false);
  });

  it('no su un elenco vuoto: non c’è niente da ordinare come numero', () => {
    expect(sonoTuttiNumeri([])).toBe(false);
  });
});
