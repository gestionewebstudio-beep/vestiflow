import { describe, expect, it } from 'vitest';

import { DocumentLineSearchPanelStore } from './document-line-search-panel.store';

describe('DocumentLineSearchPanelStore', () => {
  it('parte chiuso, senza riga e senza termine', () => {
    const store = new DocumentLineSearchPanelStore();

    expect(store.isOpen()).toBe(false);
    expect(store.lineIndex()).toBeNull();
    expect(store.launchTerm()).toBe('');
  });

  it('apre dalla riga con il termine già digitato', () => {
    const store = new DocumentLineSearchPanelStore();

    store.openForLine(2, 'MAG-001');

    expect(store.isOpen()).toBe(true);
    expect(store.lineIndex()).toBe(2);
    expect(store.launchTerm()).toBe('MAG-001');
  });

  it('⭐ ogni apertura cambia la sequenza, anche sullo STESSO termine', () => {
    // Il pannello resta montato: senza un valore che cambia, riaprirlo sullo
    // stesso termine non reinizializzerebbe la query, e la seconda ricerca
    // ripartirebbe da dove era rimasta la prima.
    const store = new DocumentLineSearchPanelStore();

    store.openForLine(0, 'MAG-001');
    const prima = store.launchSeq();
    store.close();
    store.openForLine(0, 'MAG-001');

    expect(store.launchSeq()).toBeGreaterThan(prima);
  });

  it('l’apertura senza riga non ne nomina una', () => {
    const store = new DocumentLineSearchPanelStore();

    store.open('cappotto');

    expect(store.isOpen()).toBe(true);
    expect(store.lineIndex()).toBeNull();
    expect(store.launchTerm()).toBe('cappotto');
  });

  it('⭐ chiudere dimentica la riga', () => {
    // Lasciarla dietro farebbe applicare l'azione successiva («Crea articolo»,
    // l'aggancio della variante) a una riga che non ha aperto niente.
    const store = new DocumentLineSearchPanelStore();
    store.openForLine(3, 'X');

    store.close();

    expect(store.isOpen()).toBe(false);
    expect(store.lineIndex()).toBeNull();
  });
});
