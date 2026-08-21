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
  /**
   * Descrizione della riga, **solo quando l'operatore l'ha cambiata** (T2).
   *
   * ⛔ Contratto binario, come `vatCodeId`: assente su una riga esistente =
   * non modificata, e il server conserva quella persistita. Mandarla sempre
   * riscriverebbe la fotografia dell'operazione a ogni salvataggio.
   */
  readonly description?: string;
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
  /**
   * Metodo di pagamento, **facoltativo** (`11` A8).
   *
   * ⛔ Era obbligatorio per eredità della vecchia cassa, che un valore ce l'ha
   * sempre. La gestione Pagamenti della maschera nuova è **differita al blocco
   * Pagamenti/Tesoreria** e userà la struttura comune agli altri documenti:
   * fino ad allora non si manda niente, e non si inventa un predefinito.
   *
   * ⚠️ **Assente ≠ vuoto**: su un documento esistente il server lo legge come
   * «non modificato» e conserva quello persistito.
   */
  readonly paymentMethod?: StoreSalePaymentMethod;
  /** Testo libero quando paymentMethod = 'other' (es. «Assegno»). */
  readonly paymentMethodNote?: string;
  readonly customerId?: EntityId;
  /**
   * La data economica della vendita, scelta da chi registra (T2).
   *
   * ⚠️ **Letta solo alla CREAZIONE**: in modifica il server tiene quella
   * persistita, e non è una svista — il Registro Corrispettivi filtra e
   * raggruppa su di essa, e correggere una vendita di marzo ad agosto
   * cambierebbe due periodi invece di correggerne uno.
   */
  readonly documentDate?: IsoDateString;
  readonly notes?: string;
  readonly lines: readonly StoreSaleLineInput[];
}

export interface StoreReturnLineInput {
  /** Id della riga da RISALVARE (T1/T2). Assente = riga nuova. Stesso vincolo di `StoreSaleLineInput.id`. */
  readonly id?: EntityId;
  readonly variantId: EntityId;
  readonly quantity: number;
  /**
   * ⛔ **Nome del CONFINE, non un concetto del modello.** Nel dominio la spunta
   * di riga è `loadsStock`, esposta all'operatore come «Carica giacenze»
   * (`11` A11-ter): questo è solo come si chiama nel DTO, e non risale oltre il
   * mapper che costruisce questo payload.
   */
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
   * Sconto di riga, **come sulla Vendita** (T2, `11` A11): chi ha venduto
   * scontato e riprende il capo rende quello che ha incassato.
   */
  readonly discountPercent?: number;
  /**
   * Descrizione della riga, **solo quando l'operatore l'ha cambiata** (T2).
   * Stesso contratto binario di `StoreSaleLineInput.description`.
   */
  readonly description?: string;
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
  /**
   * ⚠️ **Campo storico, e non più obbligatorio** (`11` A11: la causale del Reso
   * è facoltativa). Resta perché la maschera legacy lo manda; il campo vero è
   * `causale`, che atterra su `Document.causalText` — una colonna, non un
   * prefisso dentro un commento da rileggere analizzando una stringa.
   *
   * @deprecated usa `causale`.
   */
  readonly reason?: string;
  /** La causale del reso, facoltativa: atterra su `Document.causalText`. */
  readonly causale?: string;
  /**
   * Cliente, **facoltativo come sulla Vendita** (`11` A13, che mette il campo
   * in testata senza distinguere i due modi).
   *
   * ⚠️ Non riapre il documento origine (`11` A11): il Reso resta autonomo — chi
   * rende la merce può essere noto, la vendita di partenza no.
   */
  readonly customerId?: EntityId;
  /**
   * La data economica del reso (T2). **Stesso contratto della Vendita**: letta
   * solo alla creazione, in modifica resta quella persistita.
   */
  readonly documentDate?: IsoDateString;
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
