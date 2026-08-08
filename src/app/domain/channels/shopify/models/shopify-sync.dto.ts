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

export interface ShopifySyncInventoryDto {
  readonly synced: true;
  readonly imported: number;
  readonly updated: number;
  readonly unchanged: number;
  readonly skipped: number;
  readonly linkedVariantCount: number;
  readonly linkedLocationCount: number;
  readonly remoteLevelCount: number;
  /** Disallineamenti rimasti in sospeso e ripubblicati in questa passata. */
  readonly republishedLevels?: number;
  /** Disallineamenti ancora in coda: falliti, oppure oltre il tetto per passata. */
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
