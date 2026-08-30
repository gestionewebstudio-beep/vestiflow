import { describe, expect, it, vi } from 'vitest';

import { CATALOGO_COMANDI, comando } from './list-action-catalog';

/**
 * ⛔ **Perché questo catalogo esiste.** Misurata la deriva il 30/08/2026: lo
 * stesso comando dichiarato in forme diverse — «Stampa» ghost su una pagina e
 * secondary su quattro, «CSV» con tre icone, «Esporta» con due etichette.
 *
 * Queste prove tengono ferme le due proprietà che la tolgono: la forma viene dal
 * catalogo, e la pagina può cambiare solo ciò che è davvero suo.
 */
describe('comando — la forma viene dal catalogo', () => {
  it('⭐ etichetta, icona, variante e requisito arrivano dal catalogo', () => {
    const azione = comando('delete', { run: vi.fn() });

    expect(azione).toMatchObject({
      id: 'delete',
      label: 'Elimina',
      icon: 'pi-trash',
      variant: 'danger',
      requires: 'oneOrMore',
    });
  });

  it('⭐ la pagina passa il GESTORE, e viene chiamato', () => {
    const gestore = vi.fn();
    const azione = comando('print', { run: gestore });

    azione.run?.({ scope: 'filtered' });

    expect(gestore).toHaveBeenCalledTimes(1);
  });

  it('⭐ la pagina può sovrascrivere ciò che è suo: motivo, occupato, etichetta', () => {
    const azione = comando('delete', {
      disabled: true,
      disabledReason: 'La selezione contiene documenti collegati.',
      run: vi.fn(),
    });

    expect(azione.disabled).toBe(true);
    expect(azione.disabledReason).toContain('collegati');
    // ⚠️ ma quello che NON sovrascrive resta del catalogo
    expect(azione.icon).toBe('pi-trash');
  });

  it('⭐ un comando può aprire un MENU invece di fare una cosa', () => {
    const azione = comando('export', {
      items: [{ id: 'csv', label: 'CSV (.csv)', run: vi.fn() }],
    });

    expect(azione.items).toHaveLength(1);
    expect(azione.label).toBe('Esporta');
  });

  /**
   * ⛔ **Stampa, Excel ed Esporta sono TRE comandi**, non uno con tre formati
   * (`14` §5.2). PDF e CSV non sono comandi: sono **voci** del menu Esporta —
   * deciso dal proprietario il 30/08/2026.
   */
  it('⛔ PDF e CSV non sono comandi del catalogo: stanno dentro Esporta', () => {
    expect(Object.keys(CATALOGO_COMANDI)).not.toContain('pdf');
    expect(Object.keys(CATALOGO_COMANDI)).not.toContain('csv');
    expect(Object.keys(CATALOGO_COMANDI)).toContain('export');
  });

  /**
   * ⚠️ Il requisito è una proprietà del COMANDO, non della pagina: «Duplica»
   * pretende una riga sola ovunque, e «Elimina» ne pretende almeno una.
   */
  it.each([
    ['new', 'none'],
    ['print', 'none'],
    ['excel', 'none'],
    ['export', 'none'],
    ['detail', 'one'],
    ['edit', 'one'],
    ['duplicate', 'one'],
    ['labels', 'one'],
    ['attachments', 'one'],
    ['delete', 'oneOrMore'],
  ] as const)('%s pretende «%s», e lo pretende ovunque', (id, atteso) => {
    expect(CATALOGO_COMANDI[id].requires).toBe(atteso);
  });
});
