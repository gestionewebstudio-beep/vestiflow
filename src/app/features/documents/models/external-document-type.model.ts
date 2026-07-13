import type { EntityId } from '@core/models/common.model';

/**
 * Tipo documento fornitore per Arrivo merce (DDT, Fattura, Reso + tipi
 * personalizzati per tenant, prompt §3-4).
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
