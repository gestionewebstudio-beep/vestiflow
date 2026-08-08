import type { EntityId, IsoDateString, TenantScoped, Timestamped } from './common.model';

// Stato della CONNESSIONE del negozio a Shopify (livello integrazione/account).
// DISTINTO da ShopifyLink (shopify.model.ts), che rappresenta il sync di una
// singola risorsa (prodotto, store, vendita). Qui si descrive l'account: se e
// come il tenant e' collegato a Shopify. Una connessione per tenant.
// NESSUN token/secret nel frontend: solo stato e identificativi pubblici
// (regole-sicurezza). Modello read-only: il gestionale legge, non muta.

/** Stato della connessione dell'account a Shopify. */
export const ShopifyConnectionStatus = {
  NotConnected: 'not_connected',
  Connected: 'connected',
  /** Connesso ma token/scope da rinnovare (richiede ri-autorizzazione). */
  ReauthRequired: 'reauth_required',
  /** Connessione presente ma in errore (es. webhook/API). */
  Error: 'error',
} as const;
export type ShopifyConnectionStatus =
  (typeof ShopifyConnectionStatus)[keyof typeof ShopifyConnectionStatus];

/**
 * Ultimo errore di connessione. `message` e' display-safe (testo per l'utente,
 * non stack/tecnico); `code` e' un identificativo pubblico per debug admin.
 */
export interface ShopifyConnectionError {
  readonly message: string;
  readonly occurredAt: IsoDateString;
  readonly code?: string;
}

export interface ShopifyScopeDiagnostics {
  readonly requested: readonly string[];
  readonly granted: readonly string[];
  readonly missingFromGrant: readonly string[];
  readonly missingForCatalogImport: readonly string[];
  readonly catalogImportBlockedReason: 'none' | 'not_requested' | 'not_granted';
}

/** Connessione Shopify del tenant (una per tenant). */
export interface ShopifyConnection extends TenantScoped, Timestamped {
  readonly id: EntityId;
  readonly status: ShopifyConnectionStatus;
  /** Dominio myshopify pubblico, presente quando connesso. */
  readonly shopDomain?: string;
  /** Nome visualizzato dello shop (display). */
  readonly displayName?: string;
  /** Versione API Shopify in uso (es. '2025-01'). */
  readonly apiVersion?: string;
  /** Scope concessi (pubblici), es. 'read_products'. */
  readonly scopes?: readonly string[];
  readonly scopeDiagnostics?: ShopifyScopeDiagnostics;
  /** Negozio del gestionale collegato (multi-store), opzionale: non tutte le
   * connessioni sono legate a un singolo store. */
  readonly storeId?: EntityId;
  readonly lastConnectedAt?: IsoDateString;
  readonly lastSyncAt?: IsoDateString;
  readonly webhooksActivatedAt?: IsoDateString;
  readonly webhooksActiveCount?: number;
  /** Indirizzo a cui le sottoscrizioni risultano registrate. `null` = mai osservato. */
  readonly webhookAddress?: string | null;
  /**
   * `false` = le sottoscrizioni consegnano a un indirizzo diverso da quello in uso.
   * `null` = non confrontabile. **Mai trattare `null` come `false`**: sarebbe un allarme
   * dato per ignoranza, ed e' il difetto che questa parte serve a togliere.
   */
  readonly webhookAddressMatchesConfigured?: boolean | null;
  /**
   * `false` = da questo ambiente il confronto sull'indirizzo non e' possibile, perche'
   * quello configurato qui non e' uno a cui Shopify potrebbe consegnare (es. `localhost`).
   * Va **detto a schermo**: un controllo spento in silenzio e' peggio del falso allarme.
   */
  readonly webhookAddressComparable?: boolean;
  /** I topic osservati. Vuoto NON vuol dire «nessuno»: guarda `webhookTopicsKnown`. */
  readonly webhookTopics?: readonly string[];
  /** `false` = nessuna osservazione e' mai stata fatta. Distingue «non lo sappiamo» da «zero». */
  readonly webhookTopicsKnown?: boolean;
  /** Attesi meno osservati, coi nomi. Sempre vuoto se `webhookTopicsKnown` e' `false`. */
  readonly webhookMissingTopics?: readonly string[];
  /** Osservati che non sono piu' attesi: residui di versioni precedenti. */
  readonly webhookUnexpectedTopics?: readonly string[];
  /** Quando l'elenco e' stato osservato. Senza data non si sa quando era vero. */
  readonly webhooksCheckedAt?: IsoDateString | null;
  /**
   * Ultimo evento webhook **accolto** da Shopify. Distinto da `lastSyncAt`, che si muove
   * anche quando qualcuno preme un pulsante: e' l'unica cosa che separa «non e' cambiato
   * niente» da «non arriva piu' niente».
   */
  readonly lastWebhookEventAt?: IsoDateString | null;
  /** Webhook attivi: ordini, clienti, prodotti e giacenze in tempo reale da Shopify. */
  readonly autoSyncEnabled?: boolean;
  readonly lastError?: ShopifyConnectionError;
}
