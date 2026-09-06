import { describe, expect, it } from 'vitest';

import { documentSearchLaunchTerm } from './document-search-launch-term.util';

describe('documentSearchLaunchTerm', () => {
  it('su riga libera apre col testo che si sta scrivendo', () => {
    expect(documentSearchLaunchTerm({ linked: false, name: '  maglietta ros ' })).toBe(
      'maglietta ros',
    );
  });

  // ⛔ Il difetto: col nome modificabile, correggere la descrizione toglieva
  // l'unica via per aprire l'anagrafica dell'articolo collegato.
  it('su riga agganciata apre col codice, anche se il nome è stato riscritto', () => {
    expect(
      documentSearchLaunchTerm({
        linked: true,
        name: 'Rosso scuro, seconda scelta',
        sku: 'MAG-M-ROSSO',
        articleCode: '00036',
      }),
    ).toBe('MAG-M-ROSSO');
  });

  it('senza SKU ripiega sul codice articolo, poi sull’EAN', () => {
    expect(
      documentSearchLaunchTerm({ linked: true, name: 'x', articleCode: '00036', barcode: '801' }),
    ).toBe('00036');
    expect(documentSearchLaunchTerm({ linked: true, name: 'x', barcode: '801' })).toBe('801');
  });

  // Una riga agganciata senza nessun codice esiste: variante importata da un
  // canale che non li porta. Meglio il nome di una ricerca vuota.
  it('agganciata ma senza codici: il nome è meglio di niente', () => {
    expect(documentSearchLaunchTerm({ linked: true, name: 'Articolo senza codici' })).toBe(
      'Articolo senza codici',
    );
    expect(documentSearchLaunchTerm({ linked: true, name: 'x', sku: '   ' })).toBe('x');
  });
});
