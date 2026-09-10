import type { IsoDateString } from '@core/models/common.model';

export interface ShopifySyncLocationsDto {
  readonly synced: true;
  readonly autoLicensed?: boolean;
  readonly matchedCount: number;
  readonly importedCount: number;
  readonly totalCount: number;
}

export interface ShopifySyncWebhooksDto {
  readonly synced: true;
  readonly registered: readonly string[];
  readonly skipped: readonly string[];
  readonly failed: readonly { readonly topic: string; readonly message: string }[];
}

export interface ShopifyDisableWebhooksDto {
  readonly disabled: true;
  readonly deletedCount: number;
  readonly failed: readonly { readonly id: number; readonly message: string }[];
}

/**
 * Esito di «Verifica ora»: cosa risulta su Shopify adesso.
 *
 * E' una lettura, non una sincronizzazione: niente viene registrato o cancellato sul
 * negozio. I `| null` distinguono «non confrontabile» da «sbagliato», e vanno mantenuti
 * distinti anche nella schermata.
 */
export interface ShopifyWebhookCheckDto {
  readonly checkedAt: IsoDateString;
  readonly shopDomain: string;
  readonly configuredAddress: string | null;
  readonly observedAddress: string | null;
  readonly addressMatchesConfigured: boolean | null;
  readonly addressComparable: boolean;
  readonly topics: readonly string[];
  readonly missingTopics: readonly string[];
  readonly unexpectedTopics: readonly string[];
  readonly otherAddresses: readonly { readonly address: string; readonly topicCount: number }[];
  readonly totalSubscriptions: number;
}

export interface ShopifyClearErrorsDto {
  readonly cleared: true;
  readonly productsReset: number;
  readonly locationsReset: number;
}

export interface ShopifySyncProductsDto {
  readonly synced: true;
  readonly imported: number;
  readonly updated: number;
  readonly skipped: number;
  readonly remoteProductCount: number;
  readonly failed: readonly { readonly shopifyProductId: string; readonly message: string }[];
}

/** Perché una coppia non risulta allineata. Gli stessi nomi del server. */
export type MotivoNonAllineataDto =
  | 'livello_non_disponibile'
  | 'collegamento_escluso'
  | 'base_non_stabilita'
  | 'richiesta_rifiutata'
  | 'divergenza_accertata'
  | 'errore_di_lettura'
  | 'scrittura_esito_incerto'
  | 'negozio_non_connesso'
  | 'permesso_mancante'
  | 'sincronizzazione_spenta'
  | 'variante_non_collegata'
  | 'sede_non_collegata'
  | 'stato_cambiato'
  | 'rinvio_attivo';

/** Una riga dell’elenco finale: articolo, variante, sede e motivo. */
export interface CoppiaNonAllineataDto {
  readonly variantId: string;
  readonly locationId: string;
  readonly articolo: string;
  readonly codiceArticolo: string | null;
  readonly variante: string;
  readonly sku: string | null;
  readonly sede: string;
  readonly motivo: MotivoNonAllineataDto;
  readonly dettaglio: string;
}

/** Dove il blocco si è fermato: si ripassa per avere il successivo. */
export interface PosizioneAllineamentoDto {
  readonly locationId: string;
  readonly variantId: string;
}

/** La risposta di UN blocco del controllo. */
export interface ShopifyAlignBloccoDto {
  readonly aligned: true;
  readonly totale: number;
  readonly esaminate: number;
  readonly allineate: number;
  readonly giaAllineate: number;
  readonly nonAllineate: readonly CoppiaNonAllineataDto[];
  readonly prossimo: PosizioneAllineamentoDto | null;
  readonly fine: boolean;
}

/**
 * L’avanzamento del controllo, aggiornato dopo OGNI blocco.
 *
 * ⛔ **`completo` è vero solo quando il perimetro è stato attraversato tutto.**
 *    Se la catena dei blocchi si interrompe — rete caduta, scheda chiusa, un
 *    blocco in errore — l’ultimo avanzamento resta con `completo: false`, e
 *    l’elenco che porta è **parziale**. Va detto a chi guarda, non lasciato
 *    intendere: un elenco parziale scambiato per finale è la bugia peggiore
 *    che questo comando possa raccontare.
 */
export interface AvanzamentoAllineamentoDto {
  readonly totale: number;
  readonly esaminate: number;
  readonly allineate: number;
  readonly giaAllineate: number;
  readonly nonAllineate: readonly CoppiaNonAllineataDto[];
  readonly completo: boolean;
}

export interface ShopifySyncInventoryDto {
  readonly synced: true;
  readonly imported: number;
  readonly updated: number;
  readonly unchanged: number;
  readonly skipped: number;
  readonly linkedVariantCount: number;
  readonly linkedLocationCount: number;
  readonly remoteLevelCount: number;
  /** ⭐ Disallineamenti la cui quantità è stata DAVVERO ripubblicata. */
  readonly republishedLevels?: number;
  /** Rifiutati dallo storico: il collegamento non è utilizzabile. */
  readonly refusedLevels?: number;
  /** Falliti: il canale ha rifiutato o non ha risposto. */
  readonly failedLevels?: number;
  /** Disallineamenti ancora da risolvere dopo la passata. */
  readonly pendingMismatches?: number;
}

export interface ShopifySyncCustomersDto {
  readonly synced: true;
  readonly imported: number;
  readonly updated: number;
  readonly skipped: number;
  readonly remoteCustomerCount: number;
  readonly failed: readonly { readonly shopifyCustomerId: string; readonly message: string }[];
}

export interface ShopifySyncOrdersDto {
  readonly synced: true;
  readonly imported: number;
  readonly updated: number;
  readonly skipped: number;
  readonly remoteOrderCount: number;
  readonly failed: readonly { readonly shopifyOrderId: string; readonly message: string }[];
  /** Ordini che su Shopify non risultano più: segnalati, mai rimossi da soli. */
  readonly missingOnChannel?: number;
  /** Fra quelli, i non evasi di cui sono stati liberati gli impegni. */
  readonly reservationsReleased?: number;
  /** Perché il controllo sugli ordini spariti non ha concluso, se è successo. */
  readonly missingCheckInconclusive?: string;
}
