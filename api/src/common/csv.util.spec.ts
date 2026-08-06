import { describe, expect, it } from 'vitest';

import { escapeCsvField, serializeCsv } from './csv.util';

describe('csv.util', () => {
  describe('escapeCsvField', () => {
    it('non modifica valori semplici', () => {
      expect(escapeCsvField('SKU-123')).toBe('SKU-123');
    });

    it('quoting per virgole, newline e doppi apici', () => {
      expect(escapeCsvField('val,ore')).toBe('"val,ore"');
      expect(escapeCsvField('riga\nnuova')).toBe('"riga\nnuova"');
      expect(escapeCsvField('say "hello"')).toBe('"say ""hello"""');
    });
  });

  describe('serializeCsv', () => {
    it('serializza header e righe con escape', () => {
      const csv = serializeCsv(['SKU', 'Nome'], [
        { SKU: 'A-1', Nome: 'Prodotto, speciale' },
        { SKU: 'B-2', Nome: 'Normale' },
      ]);

      expect(csv).toBe('SKU,Nome\nA-1,"Prodotto, speciale"\nB-2,Normale\n');
    });

    it('usa stringa vuota per celle mancanti', () => {
      const csv = serializeCsv(['A', 'B'], [{ A: 'x' }]);
      expect(csv).toBe('A,B\nx,\n');
    });
  });
});
