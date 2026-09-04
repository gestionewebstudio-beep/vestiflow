export interface VariantSummaryDto {
  readonly variantId: string;
  readonly productId: string;
  readonly sku: string;
  /** Codice articolo del prodotto (identificatore anagrafico interno VestiFlow). */
  readonly articleCode: string;
  readonly productName: string;
  readonly title: string;
  /**
   * L'etichetta della sola VARIANTE: «M / Rosso». Vuota se l'articolo non ha
   * opzioni (compreso il «Default Title» che Shopify assegna ai prodotti
   * semplici).
   *
   * ⛔ La compone il SERVER, con la funzione unica. Il client non la ricava
   * sottraendo il nome prodotto dal titolo — lo faceva, ed era una sottrazione
   * di stringhe che si rompeva appena il titolo non cominciava col nome.
   */
  readonly variantLabel: string;
  readonly barcode?: string | null;
  readonly sellingPrice: {
    readonly amountMinor: number;
    readonly currencyCode: string;
  };
  /**
   * Prezzo del canale Shopify della variante. **Distinto** dal prezzo al
   * pubblico e mai sincronizzato con esso oltre alla politica dell'anagrafica.
   * Serve alle maschere che lo mostrano: senza, la colonna nascerebbe vuota e
   * l'operatore scriverebbe su un campo di cui non vede il valore corrente.
   */
  readonly shopifyPrice?: {
    readonly amountMinor: number;
    readonly currencyCode: string;
  } | null;
  readonly purchasePrice?: {
    readonly amountMinor: number;
    readonly currencyCode: string;
  } | null;
  readonly compareAtPrice?: {
    readonly amountMinor: number;
    readonly currencyCode: string;
  } | null;
  readonly supplierSku?: string | null;
  readonly stockOnHand?: number | null;
  /**
   * Disponibile = Giacenza − Impegnata (con locationId: della sola sede;
   * senza: totale multi-sede). Null se la variante non ha righe giacenza.
   */
  readonly stockAvailable?: number | null;
  /** Soglia minima di riordino (della sede richiesta se passata, altrimenti somma multi-sede); per colorare la disponibilità. */
  readonly stockMinThreshold?: number | null;
  /** URL della prima immagine del prodotto (miniatura nella ricerca); null se il prodotto non ha immagini. */
  readonly imageUrl?: string | null;
  readonly category?: string | null;
  readonly unitOfMeasure?: string | null;
  readonly defaultVatCodeId?: string | null;
  /** False = prodotto non gestito a magazzino: le righe documento non caricano giacenza. */
  readonly managesStock?: boolean;
  /** Tipo prodotto (Articolo/Servizio): default della spunta "Impegna magazzino". */
  readonly kind?: 'article' | 'service';
}
