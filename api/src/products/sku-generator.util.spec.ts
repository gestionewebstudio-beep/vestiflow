import { describe, expect, it } from 'vitest';

import { buildSkuBase, slugifySkuSegment, withCollisionSuffix, withProgressive } from './sku-generator.util';

describe('sku-generator.util', () => {
  describe('slugifySkuSegment', () => {
    it('rimuove accenti e caratteri speciali, forza maiuscolo', () => {
      expect(slugifySkuSegment('Perché è così?!')).toBe('PERCHEECOSI');
    });

    it('tronca al massimo indicato', () => {
      expect(slugifySkuSegment('Borraccia', 3)).toBe('BOR');
    });

    it('lascia intatti numeri e lettere gia normalizzati', () => {
      expect(slugifySkuSegment('42')).toBe('42');
    });
  });

  describe('buildSkuBase — prodotto semplice (senza attributi variante)', () => {
    it('combina categoria + nome, esempio guida cliente (Maglia girocollo Basic / Maglie)', () => {
      const result = buildSkuBase({ productName: 'Maglia girocollo Basic', category: 'Maglie' });
      expect(result).toEqual({ base: 'MAG-BASIC', hasAttributeSegments: false });
    });

    it('senza categoria usa solo il nome', () => {
      const result = buildSkuBase({ productName: 'Borraccia termica', category: null });
      expect(result.hasAttributeSegments).toBe(false);
      expect(result.base).toMatch(/^[A-Z0-9-]+$/);
      expect(result.base.length).toBeGreaterThan(0);
    });

    it('nome e categoria vuoti ricadono su un prefisso di fallback prevedibile', () => {
      const result = buildSkuBase({ productName: '   ', category: '' });
      expect(result.base).toBe('ART');
      expect(result.hasAttributeSegments).toBe(false);
    });

    it('usa il codice modello quando presente invece di derivare dal nome', () => {
      const result = buildSkuBase({
        productName: 'Maglia girocollo Basic',
        category: 'Maglie',
        modelCode: 'GC100',
      });
      expect(result.base).toBe('MAG-GC100');
    });
  });

  describe('buildSkuBase — variante con attributi realmente presenti', () => {
    it('colore/taglia abbigliamento (MAG-BASIC-NER-S)', () => {
      const result = buildSkuBase({
        productName: 'Maglia girocollo Basic',
        category: 'Maglie',
        optionValues: [
          { name: 'Colore', value: 'Nero' },
          { name: 'Taglia', value: 'S' },
        ],
      });
      expect(result).toEqual({ base: 'MAG-BASIC-NER-S', hasAttributeSegments: true });
    });

    it('taglie numeriche (scarpe) non vengono troncate', () => {
      const result = buildSkuBase({
        productName: 'Sneaker running',
        category: 'Calzature',
        optionValues: [
          { name: 'Colore', value: 'Nero' },
          { name: 'Taglia', value: '42' },
        ],
      });
      expect(result.base.endsWith('-42')).toBe(true);
      expect(result.hasAttributeSegments).toBe(true);
    });

    it('funziona per tipologie non-abbigliamento con un solo attributo (formato integratori/cosmetici)', () => {
      const result = buildSkuBase({
        productName: 'Crema viso idratante',
        category: 'Cosmetici',
        optionValues: [{ name: 'Formato', value: '50ml' }],
      });
      expect(result.hasAttributeSegments).toBe(true);
      expect(result.base.startsWith('COS-')).toBe(true);
    });

    it('accessorio senza varianti resta un codice base senza attributi', () => {
      const result = buildSkuBase({ productName: 'Borraccia termica', category: 'Accessori' });
      expect(result).toEqual({ base: 'ACC-TERMIC', hasAttributeSegments: false });
    });
  });

  describe('normalizzazione caratteri speciali/accenti', () => {
    it('categoria e nome con accenti/apostrofi restano solo [A-Z0-9-]', () => {
      const result = buildSkuBase({ productName: "Bombolette d'aria compressa", category: 'Officina' });
      expect(result.base).toMatch(/^[A-Z0-9-]+$/);
    });
  });

  describe('progressivo e suffisso di collisione', () => {
    it('withProgressive produce 5 cifre zero-padded (esempio guida: MAG-BASIC-00125)', () => {
      expect(withProgressive('MAG-BASIC', 125)).toBe('MAG-BASIC-00125');
      expect(withProgressive('MAG-BASIC', 1)).toBe('MAG-BASIC-00001');
    });

    it('withCollisionSuffix produce 2 cifre zero-padded', () => {
      expect(withCollisionSuffix('MAG-BASIC-NER-S', 2)).toBe('MAG-BASIC-NER-S-02');
      expect(withCollisionSuffix('MAG-BASIC-NER-S', 11)).toBe('MAG-BASIC-NER-S-11');
    });
  });
});
