import type { IsoDateString } from './common.model';

// Stato integrazione Shopify. NESSUN segreto/token nel frontend:
// qui vivono solo stato sync e identificativi pubblici (regole-sicurezza).

export const ShopifySyncStatus = {
  NotConnected: 'not_connected',
  Synced: 'synced',
  OutOfSync: 'out_of_sync',
  Syncing: 'syncing',
  Error: 'error',
} as const;
export type ShopifySyncStatus = (typeof ShopifySyncStatus)[keyof typeof ShopifySyncStatus];

/** Collegamento Shopify di una risorsa (prodotto, store). */
export interface ShopifyLink {
  readonly status: ShopifySyncStatus;
  /** Identificativo pubblico Shopify (non sensibile). */
  readonly shopifyId?: string;
  readonly lastSyncedAt?: IsoDateString;
  /** Messaggio dell'ultimo errore di sync (per debug admin). */
  readonly lastError?: string;
}
