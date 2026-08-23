import { describe, expect, it } from 'vitest';

import {
  inventoryImportKey,
  InventoryCsvParseError,
  parseCsvText,
  parseInventoryImportCsv,
  serializeInventoryLevelsCsv,
} from './inventory-csv.util';

describe('inventory-csv.util', () => {
  describe('parseCsvText', () => {
    it('parsa campi quotati con virgole interne', () => {
      const rows = parseCsvText('SKU,Location\n"SKU,1",Napoli\n');
      expect(rows).toEqual([
        ['SKU', 'Location'],
        ['SKU,1', 'Napoli'],
      ]);
    });
  });

  describe('inventoryImportKey', () => {
    it('normalizza SKU e location in chiave case-insensitive', () => {
      expect(inventoryImportKey(' SKU-1 ', ' Napoli ')).toBe('sku-1|napoli');
    });
  });

  // ⛔ `variantOptionValueLabels` e `buildVariantTitle` non stanno più qui:
  // vivevano in una util di IMPORT CSV, e quattro moduli che non volevano
  // dipendere dall'import CSV si erano riscritti la stessa composizione — con
  // esiti diversi. Ora è `common/variant-label.util`, e la sua spec copre i
  // casi che qui non c'erano (forma a mappa, sentinella Shopify).

  describe('parseInventoryImportCsv', () => {
    const SAMPLE = `SKU,Location,Disponibile,Soglia minima
SKU-RED-M,Napoli,10,2
SKU-RED-L,Milano,5,1
`;

    it('parsa righe con header italiani', () => {
      const rows = parseInventoryImportCsv(SAMPLE);
      expect(rows).toHaveLength(2);
      expect(rows[0]).toMatchObject({
        rowNumber: 2,
        sku: 'SKU-RED-M',
        locationName: 'Napoli',
        availableText: '10',
        minThresholdText: '2',
      });
    });

    it('accetta alias header inglesi', () => {
      const csv = `Variant SKU,Location,Available\nSKU-1,Warehouse,3\n`;
      const rows = parseInventoryImportCsv(csv);
      expect(rows[0]?.sku).toBe('SKU-1');
      expect(rows[0]?.availableText).toBe('3');
    });

    it('lancia InventoryCsvParseError se mancano colonne obbligatorie', () => {
      expect(() => parseInventoryImportCsv('SKU,Disponibile\nx,1\n')).toThrow(
        InventoryCsvParseError,
      );
    });

    it('lancia errore su CSV vuoto', () => {
      expect(() => parseInventoryImportCsv('')).toThrow(InventoryCsvParseError);
    });
  });

  describe('serializeInventoryLevelsCsv', () => {
    it('serializza export giacenze con header italiani', () => {
      const csv = serializeInventoryLevelsCsv([
        {
          Variante: 'Maglietta — M',
          SKU: 'SKU-M',
          Location: 'Napoli',
          Disponibile: '8',
          Fisico: '10',
          Impegnato: '2',
          'In arrivo': '0',
          'Soglia minima': '3',
        },
      ]);

      expect(csv.startsWith('Variante,SKU,Location,Disponibile,Fisico,Impegnato,In arrivo,Soglia minima\n')).toBe(
        true,
      );
      expect(csv).toContain('Maglietta — M');
    });
  });
});
