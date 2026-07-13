import type { EntityId, IsoDateString, Money } from '@core/models/common.model';

/** Causale di carico Arrivo merce gestita per tenant (finestra "Gestione causali"). */
export interface GoodsReceiptCausal {
  readonly id: EntityId;
  /** Testo/modello causale, può contenere segnaposto {numero} e {data} (§11). */
  readonly label: string;
  /** Tipo documento fornitore associato: selezionare la causale imposta il tipo. */
  readonly externalDocumentTypeId?: EntityId;
  readonly sortOrder: number;
  readonly isDefault: boolean;
  readonly isActive: boolean;
}

/** Arrivo merce includibile in una Registrazione fattura (prompt §5.1). */
export interface LinkableGoodsReceipt {
  readonly id: EntityId;
  readonly number?: number;
  readonly reference?: string;
  readonly documentDate: IsoDateString;
  readonly causalText?: string;
  readonly internalComment?: string;
  readonly subtotal: Money;
  readonly tax: Money;
  readonly total: Money;
  readonly locationName?: string;
}
