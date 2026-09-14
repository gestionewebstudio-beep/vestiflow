import type {
  ShopifyLocationChoiceKind,
  ShopifySetupDirection,
  ShopifySetupStatus,
} from '@prisma/client';

/**
 * Il contratto della PRIMA CONNESSIONE verso il client (`docs/27`).
 *
 * ⚠️ Sono i tipi che il frontend rispecchia in `shopify-setup.dto.ts`: chi
 *    cambia una forma qui la cambia anche là, o il compilatore del client non
 *    se ne accorge (è un `fetch`, non un import).
 */

export interface ShopifySetupLocationDto {
  readonly shopifyLocationId: string;
  readonly name: string;
  readonly active: boolean;
  readonly choice: ShopifyLocationChoiceKind | null;
  readonly locationId: string | null;
  readonly locationName: string | null;
}

export interface ShopifySetupSedeVestiFlowDto {
  readonly id: string;
  readonly name: string;
  readonly code: string | null;
  /** Già collegata a UNA location Shopify (coppia attiva): non si può scegliere per un'altra. */
  readonly shopifyLocationId: string | null;
}

export interface ShopifySetupAmbiguoDto {
  readonly sku: string;
  readonly locale: { readonly productId: string; readonly nome: string };
  readonly remoto: { readonly shopifyProductId: string; readonly titolo: string };
}

export interface ShopifySetupQuantitaRigaDto {
  readonly sku: string | null;
  readonly articolo: string;
  readonly variante: string | null;
  readonly sede: string;
  /** Giacenza VestiFlow di adesso. */
  readonly attuale: number;
  /** Giacenza fisica di Shopify (`on_hand`), cioè la prevista dopo il trasferimento. */
  readonly prevista: number;
  readonly delta: number;
}

export interface ShopifySetupNonDeterminabileDto {
  readonly sku: string | null;
  readonly articolo: string;
  readonly sede: string;
  readonly motivo:
    'articolo_assente' | 'sede_non_stoccata' | 'quantita_assente' | 'lettura_fallita';
}

/** L'anteprima della fase 3, salvata: chi conferma vede questa. */
export interface ShopifySetupAnteprimaDto {
  readonly computedAt: string;
  readonly direction: ShopifySetupDirection;
  readonly catalogo: {
    readonly remoti: number;
    readonly locali: number;
    /** Articoli già collegati (identificativi remoti presenti): si conservano. */
    readonly collegati: number;
    /** Shopify → VestiFlow: prodotti remoti che verranno creati in VestiFlow. */
    readonly daImportare: number;
    /** Shopify → VestiFlow: prodotti remoti collegati che verranno aggiornati per campo. */
    readonly daAggiornare: number;
    /** VestiFlow → Shopify: articoli locali che verranno creati su Shopify. */
    readonly daPubblicare: number;
    readonly ambigui: readonly ShopifySetupAmbiguoDto[];
  };
  readonly sedi: {
    readonly collegate: readonly {
      readonly locationId: string;
      readonly nome: string;
      readonly shopifyLocationId: string;
      readonly shopifyName: string;
    }[];
    readonly lasciate: readonly {
      readonly shopifyLocationId: string;
      readonly shopifyName: string;
    }[];
    readonly daDecidere: readonly {
      readonly shopifyLocationId: string;
      readonly shopifyName: string;
    }[];
  };
  readonly quantita: {
    /** Coppie (variante collegata × sede collegata) considerate. */
    readonly coppie: number;
    /** Shopify → VestiFlow: le righe con quantità attuale e prevista (prime `righeMostrate`). */
    readonly righe: readonly ShopifySetupQuantitaRigaDto[];
    readonly righeTotali: number;
    readonly nonDeterminabili: readonly ShopifySetupNonDeterminabileDto[];
    /** Shopify → VestiFlow: articoli NUOVI, le cui quantità arrivano da Shopify e non hanno un «attuale». */
    readonly articoliNuovi: number;
  };
  /**
   * ⭐ Gli ordini ancora APERTI sul negozio (`docs/27` §5-bis): i soli che la
   *    partenza acquisisce, come impegni, all’attivazione. Niente storico. Chi
   *    non ha sede o è evaso in parte resta segnalato e fuori.
   */
  readonly ordini: ShopifySetupOrdiniDto;
  /** Ciò che impedisce di confermare, per esteso. Vuoto = si può confermare. */
  readonly blocchi: readonly string[];
}

export interface ShopifySetupOrdinePendenteDto {
  readonly shopifyOrderId: string;
  readonly nome: string;
  readonly stato: 'aperto' | 'parziale';
  readonly righe: number;
  readonly sedeDeterminabile: boolean;
  readonly giaInVestiFlow: boolean;
}

export interface ShopifySetupOrdiniDto {
  readonly aperti: number;
  readonly parziali: number;
  readonly senzaSede: number;
  readonly giaInVestiFlow: number;
  /** Le prime righe, per l’operatore; il totale sta nei conteggi. */
  readonly elenco: readonly ShopifySetupOrdinePendenteDto[];
}

/**
 * Un caso che l’attivazione NON risolve, nominato: resta fuori e lo si legge
 * prima di attivare (`shopify-setup-irrisolti.util`).
 */
export interface ShopifySetupIrrisoltoDto {
  readonly tipo: 'articolo' | 'coppia' | 'ordine';
  readonly riferimento: string;
  readonly nome: string;
  readonly motivo: string;
}

export interface ShopifySetupEsclusoDto {
  readonly tipo: 'articolo' | 'coppia';
  readonly riferimento: string;
  readonly nome: string;
  readonly motivo: string;
  readonly dettaglio?: string;
}

/** L'avanzamento e l'esito del trasferimento, aggiornati a ogni passo. */
export interface ShopifySetupEsitoDto {
  readonly fase: 'catalogo' | 'quantita' | 'concluso';
  readonly startedAt: string;
  readonly finishedAt: string | null;
  /** Presente quando il trasferimento si è fermato prima della fine: MAI «completato». */
  readonly interruzione: { readonly at: string; readonly message: string } | null;
  readonly catalogo: {
    readonly imported: number;
    readonly updated: number;
    readonly skipped: number;
    readonly failed: number;
    readonly esclusiAmbigui: number;
  } | null;
  /** Shopify → VestiFlow. */
  readonly quantita: {
    readonly coppie: number;
    readonly scritte: number;
    readonly invariate: number;
    readonly giaScritte: number;
    readonly nonDeterminabili: number;
  } | null;
  /** VestiFlow → Shopify. */
  readonly allinea: ShopifySetupAllineaDto | null;
  readonly esclusi: readonly ShopifySetupEsclusoDto[];
  /** Scritto dall’ATTIVAZIONE: ordini pendenti acquisiti e base per coppia. */
  readonly attivazione?: {
    readonly ordini: {
      readonly totale: number;
      readonly acquisiti: number;
      readonly giaPresenti: number;
      readonly senzaSede: number;
      readonly parziali: number;
      readonly falliti: number;
    };
    readonly base: ShopifySetupAllineaDto;
    readonly ordersSinceId: string | null;
  };
}

/**
 * L'esito di un allineamento delle quantità — o il suo FERMO.
 *
 * ⛔ `fermo` presente = **nessuna coppia esaminata**: l'allineamento non è
 *    partito perché ci sono ordini di canale aperti senza sede (quindi senza
 *    impegno), e scrivere il Disponibile VestiFlow avrebbe alzato l'on_hand
 *    Shopify di pezzi già promessi (collaudo del 13/09/2026). Il motivo porta
 *    l'azione: collegare la location di quegli ordini, o attendere la
 *    spedizione. È separato dall'attivazione, che riesce comunque.
 */
export interface ShopifySetupAllineaDto {
  readonly totale: number;
  readonly allineate: number;
  readonly giaAllineate: number;
  readonly nonAllineate: number;
  readonly fermo?: { readonly motivo: string; readonly ordini: readonly string[] };
}

/**
 * ⭐ La SITUAZIONE ATTUALE (13/09/2026): i problemi ancora aperti, letti a ogni
 *    richiesta, ognuno con causa, conseguenza e azione. È DISTINTA dall'esito
 *    dell'ultimo tentativo (`esito`), che è una fotografia con la sua data.
 *    `docs/27` §4-bis.
 */
export type ShopifySetupProblemaTipo = 'ordine' | 'coppia' | 'articolo' | 'connessione';

export type ShopifySetupProblemaCausa =
  | 'ordine_permesso_fulfillment_orders'
  | 'ordine_assegnazione_in_attesa'
  | 'ordine_location_non_collegata'
  | 'ordine_riga_divisa'
  | 'ordine_lettura_fallita'
  | 'ordine_sede_da_rileggere'
  | 'ordini_acquisizione_fallita'
  | 'coppia_senza_base'
  | 'coppia_non_stoccata'
  | 'coppia_lettura_fallita'
  | 'coppia_ferma_ordine_senza_sede'
  | 'articolo_sku_ambiguo'
  | 'articolo_import_fallito'
  | 'articolo_pubblicazione_fallita'
  | 'connessione_ambiti_mancanti'
  | 'connessione_webhook_mancanti';

/**
 * L'azione che chiude il caso, o `nessuna` con il perché. `riferimento`: l'id
 * dell'ordine/articolo da aprire, o il GID della location da collegare.
 */
export interface ShopifySetupProblemaAzione {
  readonly tipo:
    | 'apri_ordine'
    | 'apri_articolo'
    | 'sedi'
    | 'permessi'
    | 'allinea'
    | 'importa_ordini'
    | 'webhook'
    /**
     * ⭐ Da fare SU SHOPIFY (13/09/2026): ciò che VestiFlow non può fare ma che
     *    serve al risultato — distinto da `nessuna`, che vale solo dove non c'è
     *    davvero niente da fare. Un articolo non stoccato nella location può
     *    essere un'esclusione voluta o una correzione da fare là: lo decide chi
     *    legge, non una classificazione automatica.
     */
    | 'shopify'
    | 'nessuna';
  readonly etichetta: string;
  readonly riferimento: string | null;
}

export interface ShopifySetupProblemaDto {
  readonly tipo: ShopifySetupProblemaTipo;
  readonly causa: ShopifySetupProblemaCausa;
  /** Id dell'ordine VestiFlow, `variantId:locationId`, id del prodotto, o una chiave fissa. */
  readonly riferimento: string;
  readonly nome: string;
  readonly dettaglio: string | null;
  readonly sede: string | null;
  readonly conseguenza: string;
  readonly azione: ShopifySetupProblemaAzione;
  /** Il collegamento all'elemento (ordine, articolo), se ne ha uno. */
  readonly apri: ShopifySetupProblemaAzione | null;
  /**
   * Quando il problema è stato RILEVATO: l'ultima valutazione dell'ordine, o
   * l'ultimo tentativo per una coppia. `null` = letto adesso (permessi,
   * notifiche). Chi legge deve sapere se guarda un dato di oggi o una
   * fotografia (proprietario, 13/09/2026).
   */
  readonly rilevatoAt: string | null;
}

export interface ShopifySetupSituazioneDto {
  readonly calcolataAt: string;
  readonly problemi: readonly ShopifySetupProblemaDto[];
}

export interface ShopifySetupDto {
  /** `false` = nessun percorso per questa connessione (nata prima, o mai iniziato). */
  readonly presente: boolean;
  readonly status: ShopifySetupStatus | null;
  readonly direction: ShopifySetupDirection | null;
  readonly locations: readonly ShopifySetupLocationDto[];
  readonly sediVestiFlow: readonly ShopifySetupSedeVestiFlowDto[];
  readonly anteprima: ShopifySetupAnteprimaDto | null;
  readonly esito: ShopifySetupEsitoDto | null;
  readonly confirmedAt: string | null;
  readonly activatedAt: string | null;
  /** Ciò che impedisce l’attivazione adesso. Vuoto = si può attivare. */
  readonly blocchiAttivazione: readonly string[];
  /**
   * ⭐ I casi che l’attivazione NON risolve: si attivano solo le parti
   *    preparate, questi restano fuori e nominati — prima e dopo. Vuoto
   *    = nessun caso escluso; mai «pronto» con un elenco non vuoto.
   */
  readonly irrisolti: readonly ShopifySetupIrrisoltoDto[];
  readonly trasferimentoInCorso: boolean;
  /** ⭐ I problemi aperti ADESSO (13/09/2026), distinti dall'esito dell'ultimo tentativo. */
  readonly situazione: ShopifySetupSituazioneDto;
}
