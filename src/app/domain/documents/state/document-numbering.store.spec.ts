import { describe, expect, it } from 'vitest';

import { of } from 'rxjs';

import { DocumentType } from '@core/models/document.model';

import type { DocumentCounterView } from '../models/document-counter.model';

import { DocumentNumberConflictStore } from './document-number-conflict.store';
import { DocumentNumberingStore } from './document-numbering.store';
import type { DocumentNumberingCountersSource } from './document-numbering.store';

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
function testata(options: { readonly isEdit?: boolean; readonly countersSource?: unknown } = {}) {
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
    ...(options.countersSource
      ? { countersSource: options.countersSource as DocumentNumberingCountersSource }
      : {}),
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
   * **Cambio sede col numero già digitato.** L'elenco delle serie cambia con la
   * sede — un contatore legato a una sede vale solo lì (§1-bis) — e la serie
   * selezionata può sparirci da sotto.
   *
   * Il numero resta: è dell'operatore. La serie no: tenerla ferma salverebbe il
   * documento sotto una serie che in quella sede non esiste, mentre la tendina
   * intanto si è aggiornata e sembra coerente.
   */
  it('numero digitato: la serie sparita dall’elenco cede a quella proposta', () => {
    const { store, stato } = testata();
    store.applyProposal([counter({ id: 'nap', series: 'NAP', nextNumber: 7 })], 'nap');
    expect(stato.series).toBe('NAP');

    store.onNumberChange(3);
    // Cambio sede: NAP non è più disponibile, arriva MI.
    store.applyProposal([counter({ id: 'mi', series: 'MI', nextNumber: 12 })], 'mi');

    expect(stato.series).toBe('MI');
    // Il numero digitato non si tocca, e continua a viaggiare.
    expect(store.imposedNumber()).toBe(3);
  });

  it('numero digitato: la serie che è ancora disponibile non si tocca', () => {
    const { store, stato } = testata();
    store.applyProposal(
      [counter({ id: 'a', series: 'A', nextNumber: 7 }), counter({ id: 'b', series: 'B' })],
      'a',
    );
    store.onNumberChange(3);

    store.applyProposal(
      [counter({ id: 'a', series: 'A', nextNumber: 9 }), counter({ id: 'b', series: 'B' })],
      'b',
    );

    expect(stato.series).toBe('A');
    expect(store.imposedNumber()).toBe(3);
  });

  /**
   * **«Senza serie» è una scelta, non un'assenza** (§1-bis).
   *
   * Le maschere mandavano `series: … || undefined`, cioè omettevano la chiave —
   * e il server legge l'assenza come «usa il predefinito». Chi sceglieva «Senza
   * serie» otteneva quindi l'esatto contrario di quello che aveva chiesto.
   */
  it('serie non toccata: non viaggia, la sceglie il server', () => {
    const { store } = testata();
    store.applyProposal([counter({ series: 'A', nextNumber: 7 })], 'cnt-1');

    expect(store.chosenSeries()).toBeUndefined();
  });

  it('«Senza serie» scelta dall’operatore viaggia come stringa vuota', () => {
    const { store } = testata();
    store.applyProposal(
      [counter({ id: 'a', series: 'A' }), counter({ id: 'nessuna', series: null })],
      'a',
    );

    store.onSeriesChange('');

    expect(store.chosenSeries()).toBe('');
  });

  it('serie scelta dall’operatore viaggia col suo nome', () => {
    const { store } = testata();
    store.applyProposal(
      [counter({ id: 'a', series: 'A' }), counter({ id: 'b', series: 'B' })],
      'a',
    );

    store.onSeriesChange('B');

    expect(store.chosenSeries()).toBe('B');
  });

  // In modifica la serie è del documento: ometterla dopo un cambio lo
  // lascerebbe con quella vecchia.
  it('in modifica la serie viaggia sempre, anche non toccata', () => {
    const { store, stato } = testata({ isEdit: true });
    stato.series = 'A';

    expect(store.chosenSeries()).toBe('A');
  });

  // Elenco vuoto = richiesta fallita o in volo. Non è la prova che la serie sia
  // sparita, e cancellarla su un errore di rete sarebbe il modo peggiore di
  // scoprire che la rete è caduta.
  it('numero digitato: un elenco vuoto non cancella la serie scelta', () => {
    const { store, stato } = testata();
    store.applyProposal([counter({ id: 'a', series: 'A', nextNumber: 7 })], 'a');
    store.onNumberChange(3);

    store.applyProposal([], null);

    expect(stato.series).toBe('A');
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

/**
 * Il **giro dei contatori** (E-6) e la presa d'atto del conflitto (E-7):
 * stavano copiati in sette maschere, e la divergenza fra copie era già
 * successa due volte in questi stessi gestori.
 */
describe('DocumentNumberingStore — il giro dei contatori', () => {
  function sorgente(proposedCounterId: string | null = 'cnt-1') {
    const chiamate: { type: unknown; locationId: unknown; documentDate: unknown }[] = [];
    const countersSource = {
      service: {
        available: (type: unknown, locationId: unknown, documentDate: unknown) => {
          chiamate.push({ type, locationId, documentDate });
          return of({ counters: [counter({ nextNumber: 42 })], proposedCounterId });
        },
      },
      destroyRef: { onDestroy: () => () => undefined },
      documentType: () => DocumentType.Transfer,
      locationId: () => 'loc-1',
      documentDate: () => '2026-08-21',
    };
    return { chiamate, countersSource };
  }

  it('riproponi: chiede i contatori di (tipo, sede, DATA) e applica la proposta', () => {
    // ⛔ La data non è un extra: il primo libero si calcola su di lei, e senza
    // il server risponderebbe per oggi.
    const { chiamate, countersSource } = sorgente();
    const { store, stato } = testata({ countersSource });

    store.refreshProposal();

    expect(chiamate).toEqual([
      { type: DocumentType.Transfer, locationId: 'loc-1', documentDate: '2026-08-21' },
    ]);
    expect(stato.number).toBe(42);
  });

  it('ricarica: aggiorna l’elenco e NON tocca la selezione', () => {
    // È la chiusura del pannello numerazioni: chi ha appena aggiunto una serie
    // deve vederla, ma non deve trovarsi il numero cambiato sotto le mani.
    const { countersSource } = sorgente();
    const { store, stato } = testata({ countersSource });

    store.reloadCounters();

    expect(store.counters()).toHaveLength(1);
    expect(stato.number).toBeNull();
  });

  it('senza sorgente non fa niente, invece di esplodere', () => {
    const { store } = testata();

    expect(() => {
      store.refreshProposal();
      store.reloadCounters();
    }).not.toThrow();
  });

  it('⭐ presa d’atto del conflitto: scrive il numero E lo marca come scelto', () => {
    // Marcarlo è parte dello scriverlo: senza, il numero nuovo sarebbe
    // scambiato per una proposta e OMESSO al salvataggio successivo.
    const { store, stato } = testata();
    const dialogo = new DocumentNumberConflictStore();
    dialogo.open({ code: 'document_number_taken', number: 41, nextAvailable: 42, series: null });

    store.acknowledgeConflict(dialogo);

    expect(stato.number).toBe(42);
    expect(store.imposedNumber()).toBe(42);
    expect(dialogo.isOpen()).toBe(false);
  });

  it('⭐ chi RESTA aperto dopo il salvataggio ricomincia: la serie torna non scelta', () => {
    // Il banco conclude una vendita e prepara la successiva sulla STESSA
    // istanza: senza azzeramento manderebbe al server una serie scelta per il
    // documento prima, come se l'operatore l'avesse detta per questo.
    const { store } = testata();
    store.setCounters([counter({ series: 'B' })]);
    store.onSeriesChange('B');
    expect(store.chosenSeries()).toBe('B');

    store.resetChoice();

    expect(store.chosenSeries()).toBeUndefined();
  });
});
