import type { EntityId, IsoDateString } from '@core/models/common.model';
import type { ShopifyConnectionStatus } from '@core/models/shopify-connection.model';

// DTO di lettura della connessione Shopify (esposto dal backend NestJS).
// Forma "wire": il backend popola tenantId e i timestamp. Read-only: nessun DTO
// di scrittura (connect/disconnect non avvengono dal gestionale in questa fase).
// NESSUN token/secret: solo stato e identificativi pubblici (regole-sicurezza).

export interface ShopifyConnectionErrorDto {
  readonly message: string;
  readonly occurredAt: IsoDateString;
  readonly code?: string;
}

export interface ShopifyScopeDiagnosticsDto {
  readonly requested: readonly string[];
  readonly granted: readonly string[];
  readonly missingFromGrant: readonly string[];
  readonly missingForCatalogImport: readonly string[];
  readonly catalogImportBlockedReason: 'none' | 'not_requested' | 'not_granted';
  /** Ambiti publication mancanti (canali di vendita, Tranche 2A). */
  readonly missingForPublications: readonly string[];
  readonly publicationsBlockedReason: 'none' | 'not_requested' | 'not_granted';
}

export interface ShopifyConnectionDto {
  readonly id: EntityId;
  readonly tenantId: EntityId;
  readonly status: ShopifyConnectionStatus;
  readonly shopDomain?: string;
  readonly displayName?: string;
  readonly apiVersion?: string;
  readonly scopes?: readonly string[];
  readonly scopeDiagnostics?: ShopifyScopeDiagnosticsDto;
  readonly storeId?: EntityId;
  readonly lastConnectedAt?: IsoDateString;
  readonly lastSyncAt?: IsoDateString;
  readonly webhooksActivatedAt?: IsoDateString;
  readonly webhooksActiveCount?: number;
  // I `| null` qui sotto non sono pedanteria: `null` significa «non lo sappiamo» e deve
  // restare distinguibile da `false` e da un elenco vuoto fino alla schermata. Il resto
  // del file usa il solo `?` perche' li' la differenza non cambia cosa si mostra.
  readonly webhookAddress?: string | null;
  readonly webhookAddressMatchesConfigured?: boolean | null;
  readonly webhookAddressComparable?: boolean;
  readonly webhookTopics?: readonly string[];
  readonly webhookTopicsKnown?: boolean;
  readonly webhookMissingTopics?: readonly string[];
  readonly webhookUnexpectedTopics?: readonly string[];
  readonly webhooksCheckedAt?: IsoDateString | null;
  readonly lastWebhookEventAt?: IsoDateString | null;
  readonly autoSyncEnabled?: boolean;
  readonly lastError?: ShopifyConnectionErrorDto;
  readonly createdAt: IsoDateString;
  readonly updatedAt: IsoDateString;
}
