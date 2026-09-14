import { describe, expect, it } from 'vitest';

import { decidiCodiciImport, testoAnomalieImport } from './shopify-import-codici.util';

describe('decidiCodiciImport — SKU e barcode di Shopify: importati e segnalati, mai rifiutati', () => {
  it('SKU e barcode liberi passano come sono, senza anomalie', () => {
    const d = decidiCodiciImport(
      [{ id: 1, sku: 'MAG-M', barcode: '8001', title: 'M' }],
      new Set(),
      new Map(),
    );
    expect(d.perVariante.get(1)).toEqual({ sku: 'MAG-M', barcode: '8001' });
    expect(d.anomalie).toEqual([]);
  });

  it('⛔ D5 · barcode già su un’altra variante del tenant: la variante entra SENZA barcode e chi lo ha è nominato', () => {
    const d = decidiCodiciImport(
      [{ id: 7, sku: 'BOR-1', barcode: '8007777777770', title: 'Unica' }],
      new Set(),
      new Map([['8007777777770', '«CIN-1» di «Cintura pelle»']]),
    );
    expect(d.perVariante.get(7)).toEqual({ sku: 'BOR-1', barcode: null });
    expect(d.anomalie).toEqual([
      'Barcode «8007777777770» non assegnato a variante «Unica»: già su «CIN-1» di «Cintura pelle». Da risolvere in anagrafica; nessun barcode inventato.',
    ]);
  });

  it('barcode ripetuto DENTRO lo stesso prodotto: la prima lo tiene, la seconda no, e lo dice', () => {
    const d = decidiCodiciImport(
      [
        { id: 1, sku: 'A', barcode: '111', title: 'S' },
        { id: 2, sku: 'B', barcode: '111', title: 'M' },
      ],
      new Set(),
      new Map(),
    );
    expect(d.perVariante.get(1)?.barcode).toBe('111');
    expect(d.perVariante.get(2)?.barcode).toBeNull();
    expect(d.anomalie[0]).toMatch(/già su «A» di questo stesso articolo/);
  });

  it('SKU già preso → suffisso deterministico E segnalazione; SKU assente → SHOPIFY-<id> E segnalazione', () => {
    const d = decidiCodiciImport(
      [
        { id: 10, sku: 'DOPPIO', barcode: null, title: null },
        { id: 11, sku: null, barcode: null, title: 'Senza' },
      ],
      new Set(['doppio']),
      new Map(),
    );
    expect(d.perVariante.get(10)?.sku).toBe('DOPPIO-10');
    expect(d.perVariante.get(11)?.sku).toBe('SHOPIFY-11');
    expect(d.anomalie).toEqual([
      'SKU «DOPPIO» già presente: variante 10 importata come «DOPPIO-10»',
      'SKU assente su Shopify: variante «Senza» importata come «SHOPIFY-11»',
    ]);
  });

  it('gli SKU si riservano man mano: due varianti con lo stesso SKU nel payload non collidono', () => {
    const d = decidiCodiciImport(
      [
        { id: 1, sku: 'X', barcode: null },
        { id: 2, sku: 'X', barcode: null },
      ],
      new Set(),
      new Map(),
    );
    expect(d.perVariante.get(1)?.sku).toBe('X');
    expect(d.perVariante.get(2)?.sku).toBe('X-2');
  });

  it('non tocca ciò che non è suo: barcode con spazi si normalizza, vuoto resta nullo', () => {
    const d = decidiCodiciImport([{ id: 1, sku: 'A', barcode: '  ' }], new Set(), new Map());
    expect(d.perVariante.get(1)?.barcode).toBeNull();
    expect(d.anomalie).toEqual([]);
  });
});

describe('testoAnomalieImport', () => {
  it('unisce errore di categoria e anomalie; vuoto → null', () => {
    expect(testoAnomalieImport(null, [])).toBeNull();
    expect(testoAnomalieImport('Categoria non allineata', [])).toBe('Categoria non allineata');
    expect(testoAnomalieImport(null, ['a', 'b'])).toBe('a · b');
    expect(testoAnomalieImport('cat', ['a'])).toBe('cat · a');
  });
});
