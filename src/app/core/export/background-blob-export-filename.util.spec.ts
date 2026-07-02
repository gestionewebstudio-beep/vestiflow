import { describe, expect, it } from 'vitest';

import { vestiflowExportFilename } from './background-blob-export-filename.util';

describe('vestiflowExportFilename', () => {
  it('genera nome file con prefisso, brand e estensione', () => {
    const filename = vestiflowExportFilename('prodotti', 'csv');
    expect(filename).toMatch(/^prodotti-vestiflow-\d{4}-\d{2}-\d{2}\.csv$/);
  });
});
