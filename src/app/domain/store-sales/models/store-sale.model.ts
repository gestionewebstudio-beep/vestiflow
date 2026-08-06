// Modelli della cassa negozio (fase 3 §7-§9): vendita immediata a carrello e
// reso collegato. Rispecchiano i contratti API `store-sales`.

import type { CurrencyCode, EntityId, IsoDateString } from '@core/models/common.model';
import type { FiscalPrintPayload } from '@domain/fiscal/models/fiscal-print.model';

export type StoreSalePaymentMethod = 'cash' | 'card' | 'other';

/**
 * Codice pagamento sul DOCUMENTO: i metodi della cassa più `mixed`, il
 * riepilogo di una vendita multi-tender (il dettaglio per metodo sta nelle
 * righe pagamento).
 */
export type StoreSaleDocumentPaymentCode = StoreSalePaymentMethod | 'mixed';

/** Pagamento della vendita, una voce per metodo (multi-tender). */
export interface StoreSalePaymentInput {
  readonly method: StoreSalePaymentMethod;
  /** Descrizione libera quando method = 'other' (es. «Assegno»). */
  readonly methodNote?: string;
  /** Quota LORDA del totale coperta da questo metodo (unità minori intere). */
  readonly amountMinor: number;
  /** Solo contanti: consegnato dal cliente, per il resto. Mai sotto la quota. */
  readonly tenderedMinor?: number;
}

/** Articolo trovato per il carrello: prezzo + quantità alla location (§8). */
export interface StoreSaleLookupItem {
  readonly variantId: EntityId;
  readonly sku: string;
  readonly barcode: string | null;
  readonly productName: string;
  readonly optionSummary: string;
  /** Prezzo di vendita NETTO dell'articolo: la cassa ci calcola sopra l'IVA. */
  readonly sellingPriceMinor: number;
  readonly currency: CurrencyCode;
  /** Aliquota % del Codice IVA risolto. */
  readonly vatRatePercent: number | null;
  readonly vatCodeId: EntityId | null;
  readonly vatCodeLabel: string | null;
  readonly onHand: number;
  readonly committed: number;
  readonly available: number;
}

export interface StoreSaleLineInput {
  readonly variantId: EntityId;
  readonly quantity: number;
  readonly unitPriceMinor: number;
  readonly discountPercent?: number;
  readonly vatCodeId?: EntityId;
}

export interface CreateStoreSalePayload {
  readonly locationId: EntityId;
  /** Pagamenti per metodo: la somma delle quote copre l'intero totale. */
  readonly payments?: readonly StoreSalePaymentInput[];
  /**
   * Metodo unico legacy: usato solo per la vendita a totale zero (omaggio
   * pieno), dove non c'è incasso da ripartire.
   */
  readonly paymentMethod?: StoreSalePaymentMethod;
  readonly paymentMethodNote?: string;
  readonly customerId?: EntityId;
  readonly notes?: string;
  readonly lines: readonly StoreSaleLineInput[];
}

export interface StoreReturnLineInput {
  readonly variantId: EntityId;
  readonly quantity: number;
  readonly restockable: boolean;
  readonly unitPriceMinor?: number;
}

export interface CreateStoreReturnPayload {
  readonly locationId: EntityId;
  readonly saleDocumentId?: EntityId;
  /** Causale obbligatoria: nessun carico silenzioso (§9). */
  readonly reason: string;
  /** Come viene rimborsato il cliente (default contanti lato server). */
  readonly refundMethod?: StoreSalePaymentMethod;
  readonly notes?: string;
  readonly lines: readonly StoreReturnLineInput[];
}

/** Esito della registrazione vendita/reso per la UI di cassa. */
export interface StoreSaleResult {
  readonly id: EntityId;
  readonly reference: string;
  readonly documentDate: IsoDateString;
  readonly totalMinor: number;
  readonly currency: CurrencyCode;
  readonly lines: readonly {
    readonly sku: string;
    readonly description: string;
    readonly quantity: number;
    readonly remainingAvailable: number;
  }[];
  /**
   * Sede con stampante fiscale abilitata: payload pronto da stampare (la
   * cassa emette subito e riporta l'esito). Null = sede non fiscale.
   */
  readonly fiscal: FiscalPrintPayload | null;
}

/** Vendita negozio recente, per collegare un reso alla vendita origine. */
export interface RecentStoreSale {
  readonly id: EntityId;
  readonly reference: string | null;
  readonly documentDate: IsoDateString;
  readonly totalMinor: number;
  readonly customerName: string | null;
  readonly lines: readonly {
    readonly variantId: EntityId | null;
    readonly sku: string | null;
    readonly description: string;
    readonly quantity: number;
    /** Prezzo unitario NETTO della riga venduta. */
    readonly unitPriceMinor: number;
    /** Aliquota della riga (dallo snapshot): per mostrare il prezzo ivato. */
    readonly vatRatePercent: number | null;
  }[];
}
