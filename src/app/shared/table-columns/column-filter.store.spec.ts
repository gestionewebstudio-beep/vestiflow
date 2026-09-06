import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { ColumnFilterStore } from './column-filter.store';
import { TableViewId } from './table-column.model';

const VISTA = TableViewId.SuppliersList;
const ALTRA = TableViewId.CustomersList;

describe('ColumnFilterStore', () => {
  let store: ColumnFilterStore;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    store = TestBed.inject(ColumnFilterStore);
  });

  it('parte spento e senza filtri', () => {
    expect(store.acceso(VISTA)()).toBe(false);
    expect(store.stato(VISTA)()).toEqual({});
    expect(store.conteggio(VISTA)()).toBe(0);
  });

  /*
    ⭐ **L'identità del segnale è STABILE anche prima della prima scrittura.**

    ⛔ Se leggere creasse un segnale nuovo ogni volta, chi legge in un `computed`
    resterebbe agganciato a un oggetto che nessuno aggiorna più: il badge
    «Filtri (n)» direbbe zero per sempre, senza fallire.
  */
  it('⭐ letto due volte restituisce lo STESSO segnale', () => {
    const primo = store.stato(VISTA);
    store.imposta(VISTA, { columnId: 'stato', value: { kind: 'text', text: 'x' } });
    expect(store.stato(VISTA)).toBe(primo);
    expect(primo()['stato']).toEqual({ kind: 'text', text: 'x' });
  });

  describe('lo spegnimento È l’azzeramento', () => {
    /*
      ⛔ **La regola sta qui, dove stanno i valori** (`14` §0.2). Su scrivania
      questo interruttore ha preso il posto di «Azzera filtri»: se spegnere non
      azzerasse, l'azzeramento non esisterebbe più da nessuna parte — e
      resterebbe un elenco ristretto senza un controllo a vista che dica perché.
    */
    it('⛔ spegnere cancella i filtri', () => {
      store.commuta(VISTA); // acceso
      store.imposta(VISTA, { columnId: 'stato', value: { kind: 'values', values: ['Bozza'] } });
      expect(store.conteggio(VISTA)()).toBe(1);

      store.commuta(VISTA); // spento
      expect(store.acceso(VISTA)()).toBe(false);
      expect(store.stato(VISTA)()).toEqual({});
    });

    it('accendere non tocca niente: è lo spegnimento a pulire', () => {
      store.imposta(VISTA, { columnId: 'stato', value: { kind: 'values', values: ['Bozza'] } });
      store.commuta(VISTA);
      expect(store.acceso(VISTA)()).toBe(true);
      expect(store.conteggio(VISTA)()).toBe(1);
    });
  });

  describe('imposta', () => {
    it('scrive il valore sulla colonna', () => {
      store.imposta(VISTA, { columnId: 'totale', value: { kind: 'range', min: 10 } });
      expect(store.stato(VISTA)()).toEqual({ totale: { kind: 'range', min: 10 } });
    });

    it('`null` toglie il filtro da quella colonna', () => {
      store.imposta(VISTA, { columnId: 'totale', value: { kind: 'range', min: 10 } });
      store.imposta(VISTA, { columnId: 'totale', value: null });
      expect(store.stato(VISTA)()).toEqual({});
    });

    /*
      ⚠️ **Un controllo svuotato non lascia una chiave inerte.** Il conteggio non
      la conterebbe — `isColumnFilterActive` è falso — ma `Object.keys` sì: chi
      legge lo stato per sapere «c'è un filtro su questa colonna?» avrebbe la
      risposta sbagliata.
    */
    it('⚠️ un valore che non restringe viene TOLTO, non memorizzato vuoto', () => {
      store.imposta(VISTA, { columnId: 'stato', value: { kind: 'values', values: [] } });
      expect(Object.keys(store.stato(VISTA)())).toEqual([]);
    });

    it('più colonne convivono', () => {
      store.imposta(VISTA, { columnId: 'stato', value: { kind: 'values', values: ['Bozza'] } });
      store.imposta(VISTA, { columnId: 'codice', value: { kind: 'text', text: 'FT' } });
      expect(store.conteggio(VISTA)()).toBe(2);
    });
  });

  /*
    ⭐ **Ogni vista ha i suoi filtri.** È la stessa chiave delle preferenze
    colonne: filtrare i Fornitori non deve restringere i Clienti.
  */
  it('⭐ le viste non si contaminano', () => {
    store.imposta(VISTA, { columnId: 'stato', value: { kind: 'text', text: 'x' } });
    expect(store.conteggio(ALTRA)()).toBe(0);
    expect(store.stato(ALTRA)()).toEqual({});
  });

  describe('le scelte di un filtro a valori', () => {
    it('senza registrazione non ne offre nessuna', () => {
      expect(store.opzioniDi(VISTA, 'stato')).toEqual([]);
    });

    it('le legge da chi le ha registrate', () => {
      store.registraOpzioni(VISTA, (columnId) => (columnId === 'stato' ? ['Bozza'] : []));
      expect(store.opzioniDi(VISTA, 'stato')).toEqual(['Bozza']);
      expect(store.opzioniDi(VISTA, 'codice')).toEqual([]);
    });
  });

  /*
    ⚠️ **Azzerare uno stato già vuoto non deve creare un oggetto nuovo**: sarebbe
    un'identità diversa a ogni chiamata, e ogni `computed` a valle — righe
    filtrate, totali, card — ricalcolerebbe per niente.
  */
  it('⚠️ azzerare due volte non cambia l’identità dello stato', () => {
    store.imposta(VISTA, { columnId: 'stato', value: { kind: 'text', text: 'x' } });
    store.azzera(VISTA);
    const vuoto = store.stato(VISTA)();
    store.azzera(VISTA);
    expect(store.stato(VISTA)()).toBe(vuoto);
  });
});
