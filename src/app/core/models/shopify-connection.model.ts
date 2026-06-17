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
  /** Negozio del gestionale collegato (multi-store), opzionale: non tutte le
   * connessioni sono legate a un singolo store. */
  readonly storeId?: EntityId;
  readonly lastConnectedAt?: IsoDateString;
  readonly lastSyncAt?: IsoDateString;
  readonly webhooksActivatedAt?: IsoDateString;
  readonly webhooksActiveCount?: number;
  /** Webhook attivi: ordini, clienti, prodotti e giacenze in tempo reale da Shopify. */
  readonly autoSyncEnabled?: boolean;
  readonly lastError?: ShopifyConnectionError;
}
