import { describe, expect, it } from 'vitest';

import { DocumentType } from '@core/models/document.model';

import type { DocumentCounterView } from '../models/document-counter.model';

import { DocumentNumberingStore } from './document-numbering.store';

function counter(overrides: Partial<DocumentCounterView> = {}): DocumentCounterView {
  return {
    id: 'cnt-1',
    type: DocumentType.Transfer,
    series: null,
    locationId: null,
    locationName: null,
    isDefault: true,
    nextNumber: 42,
    documentCount: 41,
    ...overrides,
  };
}

/**
 * Testata finta: tiene numero, serie e lo stato «toccato» del numero.
 *
 * `ordine` registra la sequenza delle chiamate, perché fra scrivere il numero e
 * marcarlo l'ordine conta (vedi la prova «marca prima di scrivere»).
 */
function testata(options: { readonly isEdit?: boolean } = {}) {
  const stato = {
    number: null as number | null,
    series: '',
    dirty: false,
    programmatiche: 0,
    ordine: [] as string[],
  };
  const store = new DocumentNumberingStore({
    isEdit: () => options.isEdit ?? false,
    number: () => stato.number,
    setNumber: (value) => {
      stato.ordine.push('setNumber');
      stato.number = value;
    },
    series: () => stato.series,
    setSeries: (value) => {
      stato.ordine.push('setSeries');
      stato.series = value;
    },
    numberIsDirty: () => stato.dirty,
    markNumberDirty: () => {
      stato.ordine.push('markDirty');
      stato.dirty = true;
    },
    markNumberPristine: () => {
      stato.ordine.push('markPristine');
      stato.dirty = false;
    },
    asProgrammatic: (write) => {
      stato.programmatiche += 1;
      write();
    },
  });
  return { store, stato };
}

describe('DocumentNumberingStore', () => {
  it('propone serie e numero del contatore predefinito', () => {
    const { store, stato } = testata();

    store.applyProposal([counter({ series: 'A', nextNumber: 7 })], 'cnt-1');

    expect(stato.series).toBe('A');
    expect(stato.number).toBe(7);
    // La proposta è una scrittura programmatica: non sporca il form.
    expect(stato.programmatiche).toBe(1);
  });

  // La regola centrale: la proposta non torna indietro come imposizione.
  it('non manda il numero proposto: lo assegna il server', () => {
    const { store } = testata();

    store.applyProposal([counter({ nextNumber: 7 })], 'cnt-1');

    expect(store.isProposal()).toBe(true);
    expect(store.imposedNumber()).toBeUndefined();
  });

  it('manda il numero digitato dall’operatore', () => {
    const { store } = testata();
    store.applyProposal([counter({ nextNumber: 7 })], 'cnt-1');

    store.onNumberChange(3);

    expect(store.isProposal()).toBe(false);
    expect(store.imposedNumber()).toBe(3);
  });

  /**
   * ⚠️ L'ordine è la prova, non un dettaglio.
   *
   * È `setNumber` a emettere `valueChanges`, ed è quell'emissione a far
   * ricalcolare `numberIsProposal()` nelle maschere. Scrivendo per primo, la
   * ricalcolata avviene mentre il controllo è ancora pristine: il campo
   * continua a dichiararsi «proposta» dopo che l'operatore ha scelto, e il
   * numero digitato NON viaggia al salvataggio.
   *
   * Quattro maschere su cinque avevano l'ordine sbagliato prima della
   * migrazione allo store.
   */
  it('marca il numero PRIMA di scriverlo', () => {
    const { store, stato } = testata();

    store.onNumberChange(3);

    expect(stato.ordine).toEqual(['markDirty', 'setNumber']);
  });

  it('cambiando serie marca prima di scrivere, come sopra', () => {
    const { store, stato } = testata();
    store.setCounters([counter({ series: 'B', nextNumber: 100 })]);
    stato.ordine.length = 0;

    store.onSeriesChange('B');

    expect(stato.ordine).toEqual(['setSeries', 'markPristine', 'setNumber']);
  });

  it('su documento già salvato il numero è assegnato, non proposto', () => {
    const { store, stato } = testata({ isEdit: true });
    stato.number = 42;

    expect(store.isProposal()).toBe(false);
    expect(store.imposedNumber()).toBe(42);
  });

  it('non riscrive la proposta su un documento in modifica', () => {
    const { store, stato } = testata({ isEdit: true });
    stato.series = 'B';
    stato.number = 42;

    store.applyProposal([counter({ series: 'A', nextNumber: 7 })], 'cnt-1');

    expect(stato.series).toBe('B');
    expect(stato.number).toBe(42);
  });

  it('non riscrive la proposta su un numero già digitato', () => {
    const { store, stato } = testata();
    store.onNumberChange(3);

    store.applyProposal([counter({ series: 'A', nextNumber: 7 })], 'cnt-1');

    expect(stato.number).toBe(3);
  });

  describe('cambio serie', () => {
    it('su documento nuovo porta il progressivo della serie, come proposta', () => {
      const { store, stato } = testata();
      store.applyProposal(
        [
          counter({ id: 'cnt-1', series: '', nextNumber: 7 }),
          counter({ id: 'cnt-2', series: 'B', nextNumber: 100 }),
        ],
        'cnt-1',
      );

      store.onSeriesChange('B');

      expect(stato.number).toBe(100);
      // Resta proposta: a decidere è il server al momento del commit.
      expect(store.imposedNumber()).toBeUndefined();
    });

    // Il contrario del caso sopra, ed è la ragione per cui esiste il ramo:
    // ometterlo lascerebbe il documento col numero della serie vecchia.
    it('su documento salvato il numero della serie nuova va imposto', () => {
      const { store, stato } = testata({ isEdit: true });
      store.setCounters([counter({ id: 'cnt-2', series: 'B', nextNumber: 100 })]);

      store.onSeriesChange('B');

      expect(stato.number).toBe(100);
      expect(store.imposedNumber()).toBe(100);
    });

    it('serie sconosciuta: non tocca il numero', () => {
      const { store, stato } = testata();
      stato.number = 7;

      store.onSeriesChange('ignota');

      expect(stato.series).toBe('ignota');
      expect(stato.number).toBe(7);
    });
  });

  it('«Senza serie» è la voce delle serie nulle', () => {
    const { store } = testata();

    store.setCounters([counter({ series: null }), counter({ id: 'cnt-2', series: 'A' })]);

    expect(store.seriesOptions()).toEqual([
      { value: '', label: 'Senza serie' },
      { value: 'A', label: 'A' },
    ]);
  });

  it('l’elenco si aggiorna senza toccare la selezione', () => {
    const { store, stato } = testata();
    store.applyProposal([counter({ series: 'A', nextNumber: 7 })], 'cnt-1');

    store.setCounters([counter({ id: 'cnt-2', series: 'B', nextNumber: 100 })]);

    expect(stato.series).toBe('A');
    expect(stato.number).toBe(7);
  });
});
