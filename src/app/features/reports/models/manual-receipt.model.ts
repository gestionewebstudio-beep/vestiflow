import type { EntityId, IsoDateString } from '@core/models/common.model';

/**
 * Il **Corrispettivo manuale** (`docs/10` §12): una registrazione economica
 * autonoma che entra nel Registro Corrispettivi.
 *
 * ⚠️ Gli importi viaggiano in **unità minori** e **non sono interi**: il netto
 * canonico porta la coda dello scorporo, ed è quella coda a far tornare 70,00
 * ivati identici alla riapertura. Arrotondare qui — anche solo per comodità di
 * tipo — è il difetto che il legacy aveva per costruzione.
 */
export interface ManualReceiptLine {
  readonly id: EntityId;
  readonly lineNumber: number;
  readonly description: string;
  /** L'importo come fu digitato, nella modalità di allora. */
  readonly enteredAmountMinor: number;
  /**
   * Il netto CANONICO con la coda: la maschera ridisegna il campo da qui, mai
   * dal valore mostrato. È il meccanismo dell'Ordine fornitore, non quello della
   * maschera Fatture — che riconverte il valore già arrotondato e perde il
   * centesimo.
   */
  readonly netAmountMinor: number;
  readonly vatCodeId: EntityId | null;
  readonly netMinor: number;
  readonly vatMinor: number;
  readonly grossMinor: number;
}

export interface ManualReceipt {
  readonly id: EntityId;
  /** Progressivo nudo: 1, 2, 3 — nessun prefisso, nessuno zero di riempimento. */
  readonly number: number;
  readonly documentDate: IsoDateString;
  readonly locationId: EntityId;
  readonly locationName: string;
  readonly pricesIncludeVat: boolean;
  readonly notes: string | null;
  readonly currency: string;
  readonly subtotalMinor: number;
  readonly taxMinor: number;
  readonly totalMinor: number;
  readonly createdByName: string;
  readonly lines: readonly ManualReceiptLine[];
}

/** Una sede proponibile in testata. */
export interface ManualReceiptLocation {
  readonly id: EntityId;
  readonly name: string;
}

export interface SaveManualReceiptLineBody {
  readonly description: string;
  /** Nella modalità della testata: ivato se `pricesIncludeVat`, altrimenti netto. */
  readonly amountMinor: number;
  readonly vatCodeId?: string;
}

export interface SaveManualReceiptBody {
  readonly documentDate: string;
  readonly locationId: string;
  readonly pricesIncludeVat: boolean;
  readonly notes?: string;
  readonly lines: readonly SaveManualReceiptLineBody[];
}
