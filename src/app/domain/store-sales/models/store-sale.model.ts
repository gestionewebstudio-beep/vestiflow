// Modelli della vendita al banco (fase 3 §7-§9): vendita immediata non fiscale
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
  /**
   * Id della riga da RISALVARE (T1/T2). Assente = riga nuova. Deve essere un
   * id del SERVER (`DocumentLine.id`): mai un identificativo di sessione —
   * vedi `DocumentLineDraft` in `store-sale-register.component.ts`.
   */
  readonly id?: EntityId;
  readonly variantId: EntityId;
  readonly quantity: number;
  readonly unitPriceMinor: number;
  readonly discountPercent?: number;
  readonly vatCodeId?: EntityId;
}

export interface CreateStoreSalePayload {
  /** Id della vendita da RISALVARE (T1/T2). Assente = vendita nuova. */
  readonly id?: EntityId;
  readonly locationId: EntityId;
  readonly paymentMethod: StoreSalePaymentMethod;
  /** Testo libero quando paymentMethod = 'other' (es. «Assegno»). */
  readonly paymentMethodNote?: string;
  readonly customerId?: EntityId;
  readonly notes?: string;
  readonly lines: readonly StoreSaleLineInput[];
}

export interface StoreReturnLineInput {
  /** Id della riga da RISALVARE (T1/T2). Assente = riga nuova. Stesso vincolo di `StoreSaleLineInput.id`. */
  readonly id?: EntityId;
  readonly variantId: EntityId;
  readonly quantity: number;
  readonly restockable: boolean;
  readonly unitPriceMinor?: number;
}

/**
 * ⛔ Nessun documento origine (`11` A11): la vendita reale puo' essere stata
 * battuta su una cassa esterna e non esistere in VestiFlow. Il Reso e' autonomo
 * — niente collegamento, niente tetto sulla quantita' venduta, niente prezzo o
 * costo ripresi da una vendita precedente.
 */
export interface CreateStoreReturnPayload {
  /** Id del reso da RISALVARE (T1/T2). Assente = reso nuovo. */
  readonly id?: EntityId;
  readonly locationId: EntityId;
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
