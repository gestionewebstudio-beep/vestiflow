import { describe, expect, it } from 'vitest';

import { CATALOGO_COLONNE, colonna } from './column-catalog';

describe('catalogo colonne', () => {
  it("prende l'etichetta dal catalogo quando non se ne passa una", () => {
    expect(colonna('location')).toEqual({ id: 'location', label: 'Sede' });
  });

  it('porta con sé il resto della dichiarazione', () => {
    expect(colonna('location', { defaultVisible: false, pinnable: true })).toEqual({
      id: 'location',
      label: 'Sede',
      defaultVisible: false,
      pinnable: true,
    });
  });

  it('la colonna del catalogo che è numerica lo resta senza doverlo ripetere', () => {
    expect(colonna('total')).toEqual({ id: 'total', label: 'Totale', numeric: true });
    expect(colonna('lineCount')).toEqual({ id: 'lineCount', label: 'Righe', numeric: true });
  });

  it("un'etichetta di elenco sovrascrive quella di serie, dove è permesso", () => {
    expect(colonna('counterparty', { label: 'Fornitore' }).label).toBe('Fornitore');
    expect(colonna('reference', { label: 'Numero' }).label).toBe('Numero');
  });

  /**
   * ⛔ **La riga sotto NON deve compilare**, ed è tutto il valore del catalogo:
   * la divergenza si ferma mentre si scrive, non con un controllo dopo.
   *
   * ```ts
   * colonna('location', { label: 'Magazzino' });
   * ```
   *
   * Falsificata il 30/08/2026 togliendo l'`overload` fisso: la riga compila e
   * questo test resta verde — è la ragione per cui la guardia di lint esiste
   * comunque, e verifica la stessa cosa da fuori.
   */
  it("«Sede» è l'unica parola per la sede, in tutto il catalogo", () => {
    expect(CATALOGO_COLONNE.location).toEqual({ label: 'Sede', fisso: true });
  });

  it('ogni voce fissa dichiara `fisso: true`, non una stringa vuota o assente', () => {
    for (const [id, voce] of Object.entries(CATALOGO_COLONNE)) {
      expect(voce.label, `«${id}» senza etichetta`).toBeTruthy();
      if ('fisso' in voce) expect(voce.fisso, `«${id}»`).toBe(true);
    }
  });

  it('nessuna voce del catalogo ripete la stessa etichetta di un altro id fisso', () => {
    const fisse = Object.entries(CATALOGO_COLONNE).filter(([, v]) => 'fisso' in v);
    const etichette = fisse.map(([, v]) => v.label);
    expect(new Set(etichette).size, `doppioni: ${etichette.join(' · ')}`).toBe(etichette.length);
  });
});
