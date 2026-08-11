import { describe, expect, it } from 'vitest';

import { compareDocumentLineValues } from './document-line-sort.util';

const EUR = 'EUR';

function ordina(
  valori: readonly (string | number)[],
  kind: Parameters<typeof compareDocumentLineValues>[2],
) {
  return [...valori].sort((a, b) => compareDocumentLineValues(a, b, kind, EUR));
}

describe('compareDocumentLineValues', () => {
  describe('testo', () => {
    it('ordina come lo leggerebbe un italiano: gli accenti non finiscono in fondo', () => {
      expect(ordina(['Zoccolo', 'Àlbero', 'albero', 'Borsa'], 'text')).toEqual([
        'Àlbero',
        'albero',
        'Borsa',
        'Zoccolo',
      ]);
    });

    it('non distingue maiuscole e minuscole', () => {
      expect(compareDocumentLineValues('MAGLIA', 'maglia', 'text', EUR)).toBe(0);
    });

    it('le celle vuote restano in cima in ordine crescente', () => {
      expect(ordina(['Borsa', '', 'Albero'], 'text')).toEqual(['', 'Albero', 'Borsa']);
    });
  });

  describe('numero', () => {
    it('confronta per valore, non per testo', () => {
      // Come testo «10» verrebbe prima di «9».
      expect(ordina([10, 9, 100], 'number')).toEqual([9, 10, 100]);
    });

    it('legge anche i numeri arrivati come testo', () => {
      expect(ordina(['10', '9', '100'], 'number')).toEqual(['9', '10', '100']);
    });

    it('ciò che non è un numero vale zero', () => {
      expect(compareDocumentLineValues('', 0, 'number', EUR)).toBe(0);
    });
  });

  describe('denaro', () => {
    // parseFloat('1.234,50') legge 1: il punto lo prende per decimale e si ferma
    // alla virgola. È il difetto che questo caso sorveglia.
    it('legge la virgola decimale italiana, non si ferma al separatore di migliaia', () => {
      expect(ordina(['1.234,50', '9,90', '99,00'], 'money')).toEqual(['9,90', '99,00', '1.234,50']);
    });

    it('le celle non compilate restano in fondo in ordine crescente', () => {
      expect(ordina(['0,00', '', '5,00'], 'money')).toEqual(['', '0,00', '5,00']);
    });

    it('accetta anche il valore già in unità minori', () => {
      expect(compareDocumentLineValues(500, 1000, 'money', EUR)).toBeLessThan(0);
    });
  });

  describe('percentuale', () => {
    it('confronta per valore', () => {
      expect(ordina(['22', '4', '10'], 'percent')).toEqual(['4', '10', '22']);
    });

    it('ignora il simbolo', () => {
      expect(compareDocumentLineValues('22%', '22', 'percent', EUR)).toBe(0);
    });

    it('di uno sconto a cascata legge la prima quota — è l’ordine che l’operatore vede', () => {
      expect(compareDocumentLineValues('4+10', '10', 'percent', EUR)).toBeLessThan(0);
    });
  });
});
