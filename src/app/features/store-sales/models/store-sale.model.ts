// Modelli della cassa negozio (fase 3 §7-§9): vendita immediata non fiscale
// a carrello e reso collegato. Rispecchiano i contratti API `store-sales`.

import type { CurrencyCode, EntityId, IsoDateString } from '@core/models/common.model';

export type StoreSalePaymentMethod = 'cash' | 'card' | 'other';

/** Articolo trovato per il carrello: prezzo + quantità alla location (§8). */
export interface StoreSaleLookupItem {
  readonly variantId: EntityId;
  readonly sku: string;
  readonly barcode: string | null;
  readonly productName: string;
  readonly optionSummary: string;
  readonly sellingPriceMinor: number;
  readonly currency: CurrencyCode;
  readonly vatRatePercent: number | null;
  readonly onHand: number;
  readonly committed: number;
  readonly available: number;
}

export interface StoreSaleLineInput {
  readonly variantId: EntityId;
  readonly quantity: number;
  readonly unitPriceMinor: number;
  readonly discountPercent?: number;
  readonly vatRatePercent?: number;
}

export interface CreateStoreSalePayload {
  readonly locationId: EntityId;
  readonly paymentMethod: StoreSalePaymentMethod;
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
    readonly unitPriceMinor: number;
  }[];
}
