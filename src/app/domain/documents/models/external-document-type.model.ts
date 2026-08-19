import type { EntityId } from '@core/models/common.model';

/**
 * Tipo del documento della controparte (DDT, Fattura, Reso + tipi personalizzati
 * per tenant). Lo porta ogni documento di VestiFlow, non solo l'Arrivo merce.
 *
 * Disattivare ed eliminare sono due gesti diversi:
 * - **disattivato** (`isActive = false`) esce dalle tendine ma resta nel
 *   pannello di gestione, con il suo badge, e si riattiva in un click;
 * - **eliminato** esce anche dal pannello e non torna piu' — la voce sparisce
 *   proprio da questa lista.
 *
 * In nessuno dei due casi i documenti gia' salvati perdono qualcosa: portano lo
 * snapshot dell'etichetta, che e' quello che si legge negli elenchi e in stampa.
 */
export interface ExternalDocumentType {
  readonly id: EntityId;
  /** Nome completo mostrato nella gestione (es. "Nota di consegna"). */
  readonly name: string;
  /** Etichetta breve per tendine e causale (es. "Nota consegna"). */
  readonly shortLabel: string;
  /** Modello causale con segnaposto {numero} e {data}. */
  readonly causalTemplate?: string;
  /** Voce iniziale creata da VestiFlow. */
  readonly isSystem: boolean;
  /** Disponibile nei nuovi documenti (lo storico conserva lo snapshot). */
  readonly isActive: boolean;
  readonly sortOrder: number;
}

/**
 * Quanti documenti portano un tipo. Serve alla conferma prima di eliminarlo:
 * se il totale e' zero la voce sparisce davvero, altrimenti resta appesa allo
 * storico e l'operatore ha diritto di saperlo prima di premere.
 */
export interface ExternalDocumentTypeUsage {
  readonly documents: number;
  readonly salesOrders: number;
  readonly supplierOrders: number;
  readonly total: number;
}
