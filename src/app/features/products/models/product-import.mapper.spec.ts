import { describe, expect, it } from 'vitest';

import { mapProductImportPreview } from './product-import.mapper';

describe('product-import.mapper', () => {
  it('marca ready quando non ci sono issue', () => {
    const preview = mapProductImportPreview({
      summary: { total: 1, ready: 1, warnings: 0, errors: 0, alreadyImported: 0 },
      products: [
        {
          handle: 'maglietta',
          dto: { name: 'Maglietta', variants: [{}, {}] },
          issues: [],
          rowNumbers: [2, 3],
        },
      ],
    });

    expect(preview.products[0]?.status).toBe('ready');
    expect(preview.products[0]?.variantCount).toBe(2);
  });

  it('marca warning quando ci sono solo avvisi', () => {
    const preview = mapProductImportPreview({
      summary: { total: 1, ready: 0, warnings: 1, errors: 0, alreadyImported: 0 },
      products: [
        {
          handle: 'giacca',
          dto: { name: 'Giacca', variants: [{}] },
          issues: [{ level: 'warning', message: 'SKU duplicato' }],
          rowNumbers: [5],
        },
      ],
    });

    expect(preview.products[0]?.status).toBe('warning');
  });

  it('marca error quando c e almeno un errore', () => {
    const preview = mapProductImportPreview({
      summary: { total: 1, ready: 0, warnings: 1, errors: 1, alreadyImported: 0 },
      products: [
        {
          handle: 'invalid',
          dto: { name: 'Prodotto', variants: [] },
          issues: [
            { level: 'warning', message: 'Prezzo mancante' },
            { level: 'error', message: 'Nome obbligatorio', rowNumber: 10 },
          ],
          rowNumbers: [10],
        },
      ],
    });

    expect(preview.products[0]?.status).toBe('error');
  });
});
