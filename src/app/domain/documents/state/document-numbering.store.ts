import { computed, signal } from '@angular/core';

import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';

import type { DocumentCounterView } from '../models/document-counter.model';

/**
 * Le sole cose che DIFFERISCONO fra una maschera e l'altra nella numerazione.
 *
 * Tutto il resto — la proposta, la scelta della serie, cosa viaggia al
 * salvataggio, cosa si fa alla chiusura del pannello numerazioni — è identico
 * ovunque, e infatti era copiato cinque volte.
 */
export interface DocumentNumberingContract {
  /** Documento già salvato: il numero non è più una proposta, è assegnato. */
  readonly isEdit: () => boolean;
  /** Il numero in testata, e come si scrive. */
  readonly number: () => number | null;
  readonly setNumber: (value: number | null) => void;
  /** La serie in testata; stringa vuota = «Senza serie». */
  readonly series: () => string;
  readonly setSeries: (value: string) => void;
  /** L'operatore ha toccato il numero: da quel momento è una scelta da difendere. */
  readonly numberIsDirty: () => boolean;
  readonly markNumberDirty: () => void;
  readonly markNumberPristine: () => void;
  /**
   * Scrittura programmatica: la proposta iniziale non è una modifica
   * dell'operatore e non deve sporcare il form. Chi non ha bisogno di
   * distinguerlo può omettere questo gancio.
   */
  readonly asProgrammatic?: (write: () => void) => void;
}

/**
 * Numero e serie di un documento in testata: proposta, scelta della serie,
 * numero imposto, avviso di conflitto.
 *
 * **Perché sta qui.** Il blocco viveva in **cinque** maschere in copie quasi
 * identiche — Ordine cliente, Arrivo merce, Fattura acquisto, Trasferimento,
 * Rettifica —: 15-24 riferimenti ciascuna alle stesse otto voci. Copie di quel
 * tipo non divergono con un errore, divergono con una sfumatura: una maschera
 * impone il numero dopo un cambio di serie e un'altra no, e nessuno se ne
 * accorge finché un documento non esce con il numero della serie vecchia.
 *
 * **Le due decisioni che il blocco porta con sé**, e che sono la ragione per
 * cui non si può semplificare:
 *
 * 1. **La proposta non torna indietro come imposizione.** Su un documento nuovo
 *    il numero mostrato è il primo libero *in quel momento*: se nessuno lo
 *    tocca non viaggia al salvataggio, e ad assegnarlo è il server dentro la
 *    transazione che scrive. Due operatori che salvano insieme non si
 *    contendono niente. Se invece l'operatore l'ha digitato — il caso del buco
 *    da tappare — allora viaggia, e un conflitto è un'informazione che serve.
 * 2. **In modifica il numero è del documento.** Cambiando serie su un documento
 *    già salvato il numero mostrato *dev'essere* scritto: ometterlo lascerebbe
 *    il documento col numero della serie vecchia, e il campo direbbe una cosa
 *    diversa da quella salvata.
 *
 * Classe, non servizio iniettabile: ogni maschera ne vuole una propria, non una
 * condivisa con le altre schede aperte. Stesso stampo di
 * `DocumentLineFocusStore`.
 */
export class DocumentNumberingStore {
  private readonly _counters = signal<readonly DocumentCounterView[]>([]);

  constructor(private readonly contract: DocumentNumberingContract) {}

  /** I contatori disponibili per (tipo, sede): alimentano la tendina Serie. */
  readonly counters = this._counters.asReadonly();

  readonly seriesOptions = computed((): readonly SelectMenuOption[] =>
    this._counters().map((counter) => ({
      value: counter.series ?? '',
      label: counter.series ?? 'Senza serie',
    })),
  );

  /**
   * Il numero mostrato è una PROPOSTA, non un'assegnazione: su un documento
   * nuovo lo prende chi salva per primo, e finché nessuno lo tocca può ancora
   * cambiare. Su uno già salvato è assegnato.
   */
  isProposal(): boolean {
    return !this.contract.isEdit() && !this.contract.numberIsDirty();
  }

  /** Solo l'elenco, senza toccare la selezione: è la chiusura del pannello serie. */
  setCounters(counters: readonly DocumentCounterView[]): void {
    this._counters.set(counters);
  }

  /**
   * Elenco più proposta iniziale. Su documento in modifica, o con un numero già
   * digitato, la proposta non si applica: quel valore non si tocca.
   */
  applyProposal(counters: readonly DocumentCounterView[], proposedCounterId: string | null): void {
    this._counters.set(counters);
    if (this.contract.isEdit() || this.contract.numberIsDirty()) {
      return;
    }
    const proposed = counters.find((counter) => counter.id === proposedCounterId);
    if (!proposed) {
      return;
    }
    this.write(() => {
      this.contract.setSeries(proposed.series ?? '');
      this.contract.setNumber(proposed.nextNumber);
    });
  }

  /**
   * Numero digitato in testata: vuoto = «assegnalo tu».
   *
   * ⚠️ **Si marca PRIMA di scrivere, e l'ordine non è estetico.** È `setNumber`
   * a emettere `valueChanges`, ed è quell'emissione a far ricalcolare
   * `numberIsProposal()` nelle maschere. Scrivendo per primo, la ricalcolata
   * avviene mentre il controllo è ancora pristine: il campo continua a
   * dichiararsi «proposta» dopo che l'operatore ha già scelto, e `imposedNumber`
   * restituisce `undefined` — cioè **il numero digitato non viaggia al
   * salvataggio** finché qualcos'altro non tocca il form.
   *
   * Trovato migrando le maschere (12/08/2026): quattro su cinque scrivevano
   * prima e marcavano dopo, la Rettifica no e portava il commento che lo
   * spiegava. È la sfumatura tipica delle copie — nessuna sbaglia in modo
   * vistoso, e chi legge una sola maschera non ha modo di accorgersene.
   */
  onNumberChange(value: number | null): void {
    this.contract.markNumberDirty();
    this.contract.setNumber(value);
  }

  /** Serie scelta: il numero passa al progressivo di quel contatore. */
  onSeriesChange(value: string): void {
    this.contract.setSeries(value);
    const counter = this._counters().find((entry) => (entry.series ?? '') === value);
    if (!counter) {
      return;
    }
    // Stesso ordine e stessa ragione di `onNumberChange`: prima lo stato, poi
    // il valore che lo fa rileggere.
    //
    // Vedi la decisione 2 nel commento di classe: su documento nuovo il numero
    // della serie nuova resta una proposta, su documento salvato è un numero da
    // scrivere.
    if (this.contract.isEdit()) {
      this.contract.markNumberDirty();
    } else {
      this.contract.markNumberPristine();
    }
    this.contract.setNumber(counter.nextNumber);
  }

  /**
   * Il numero da mandare al server: SOLO quello scelto dall'operatore.
   * `undefined` = «assegnalo tu», ed è la risposta giusta per la proposta di un
   * documento nuovo (vedi decisione 1).
   */
  imposedNumber(): number | undefined {
    if (this.isProposal()) {
      return undefined;
    }
    return this.contract.number() ?? undefined;
  }

  private write(action: () => void): void {
    if (this.contract.asProgrammatic) {
      this.contract.asProgrammatic(action);
      return;
    }
    action();
  }
}
