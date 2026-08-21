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
  /**
   * Identità dell'**intento di creazione** (T15B): una per compilazione,
   * conservata attraverso timeout e reinvii.
   *
   * ⛔ **Obbligatoria in creazione** (`id` assente): il server rifiuta una
   * vendita nuova senza identità d'intento. Assente in modifica, dove non si
   * crea niente.
   */
  readonly creationIntentId?: string;
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
  /**
   * Prezzo unitario NETTO reso, in unità minori — **obbligatorio, come sulla
   * Vendita** (T4). Zero esplicito è valido; assente non è rappresentabile, e
   * il server rifiuta la richiesta invece di scriverci zero.
   *
   * ⚠️ Porta la coda decimale fino a 4 cifre di centesimo, e va rimandato
   * **tale e quale** quando la riga non si tocca: il banco tiene il netto
   * canonico nel signal e il campo ne MOSTRA solo l'ivato arrotondato.
   */
  readonly unitPriceMinor: number;
  /**
   * Codice IVA della riga, **come sulla Vendita** (T3). Assente su una riga
   * NUOVA = risolto da articolo/predefinito; assente su una riga ESISTENTE =
   * non modificato, e il server conserva id e snapshot persistiti.
   *
   * ⚠️ La maschera pos attuale non ha una colonna IVA nel Reso e non lo manda:
   * il contratto è completo per la maschera nuova, non per quella.
   */
  readonly vatCodeId?: EntityId;
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
  /** Intento di creazione (T15B), identico alla Vendita. */
  readonly creationIntentId?: string;
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
