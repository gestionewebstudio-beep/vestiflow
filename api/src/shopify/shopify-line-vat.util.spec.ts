import { describe, expect, it } from 'vitest';

import { mapShopifyLineVat } from './shopify-line-vat.util';

describe('mapShopifyLineVat', () => {
  it('legge imposta e aliquota dichiarate dal canale', () => {
    // Riga reale di #1009: 60,00 € al 4%, imposta inclusa.
    expect(
      mapShopifyLineVat({
        price: '60.00',
        tax_lines: [{ rate: 0.04, price: '2.31', title: 'IT IVA' }],
      }),
    ).toEqual({ taxMinor: 231, snapshot: { ratePercent: 4, matched: false } });
  });

  it('il caso che rendeva il difetto invisibile: due aliquote nello stesso ordine', () => {
    // Su #1009 la ripartizione proporzionale scriveva 6,22 sulla riga al 4% e
    // 2,59 su quella al 22%. I valori veri sono questi, e vengono dal canale.
    const quattro = mapShopifyLineVat({ tax_lines: [{ rate: 0.04, price: '2.31' }] });
    const ventidue = mapShopifyLineVat({ tax_lines: [{ rate: 0.22, price: '4.51' }] });

    expect(quattro.taxMinor).toBe(231);
    expect(ventidue.taxMinor).toBe(451);
    expect(quattro.snapshot).toEqual({ ratePercent: 4, matched: false });
    expect(ventidue.snapshot).toEqual({ ratePercent: 22, matched: false });
    // Le due righe NON condividono un'aliquota media.
    expect(quattro.snapshot).not.toEqual(ventidue.snapshot);
  });

  it('lo snapshot non contiene un Codice IVA, e non deve', () => {
    // La corrispondenza con i Codici IVA del tenant è una decisione della
    // procedura di prima sincronizzazione: qui si conserva il dato osservato.
    const { snapshot } = mapShopifyLineVat({ tax_lines: [{ rate: 0.22, price: '1.00' }] });

    expect(snapshot).not.toHaveProperty('code');
    expect(snapshot).toMatchObject({ matched: false });
  });

  it('riga senza tax_lines: nessuna imposta e nessuno snapshot', () => {
    expect(mapShopifyLineVat({ price: '10.00' })).toEqual({ taxMinor: 0, snapshot: null });
    expect(mapShopifyLineVat({ tax_lines: [] })).toEqual({ taxMinor: 0, snapshot: null });
  });

  it('più aliquote sulla stessa riga: somma le imposte, tiene la prima aliquota', () => {
    // Fuori dai casi italiani ordinari. Inventare una ripartizione sarebbe
    // ricadere nell'errore da cui questa funzione nasce.
    expect(
      mapShopifyLineVat({
        tax_lines: [
          { rate: 0.22, price: '2.00' },
          { rate: 0.04, price: '0.50' },
        ],
      }),
    ).toEqual({ taxMinor: 250, snapshot: { ratePercent: 22, matched: false } });
  });

  it('aliquota assente o non numerica: imposta sì, aliquota no', () => {
    expect(mapShopifyLineVat({ tax_lines: [{ price: '1.00' }] })).toEqual({
      taxMinor: 100,
      snapshot: null,
    });
  });

  it('aliquota zero è un valore, non un dato mancante', () => {
    expect(mapShopifyLineVat({ tax_lines: [{ rate: 0, price: '0.00' }] })).toEqual({
      taxMinor: 0,
      snapshot: { ratePercent: 0, matched: false },
    });
  });
});
