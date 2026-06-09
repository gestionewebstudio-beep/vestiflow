import type { EntityId } from '@core/models/common.model';
import type { ShopifyConnection } from '@core/models/shopify-connection.model';
import { ShopifyConnectionStatus } from '@core/models/shopify-connection.model';

// Fixture mock della connessione Shopify (una per tenant). NESSUN token/secret:
// solo stato e identificativi pubblici. I lastError.message sono display-safe
// (testo per l'utente, non tecnico). Sono esposti tutti gli stati per UI/test
// futuri; il service serve il fixture "attivo" (vedi shopify-connection.service).

const TENANT_ID: EntityId = 'tenant-demo';

/** Connesso e operativo: dominio, scope, versione API e ultimo sync valorizzati.
 *  Esempio di link opzionale a uno store del gestionale. */
export const CONNECTION_CONNECTED: ShopifyConnection = {
  id: 'shopify-conn-demo',
  tenantId: TENANT_ID,
  status: ShopifyConnectionStatus.Connected,
  shopDomain: 'vestiflow-demo.myshopify.com',
  displayName: 'VestiFlow Demo Store',
  apiVersion: '2025-01',
  scopes: ['read_products', 'write_products', 'read_inventory', 'read_orders'],
  storeId: 'store-napoli',
  lastConnectedAt: '2026-05-20T08:00:00.000Z',
  lastSyncAt: '2026-06-09T07:30:00.000Z',
  createdAt: '2026-05-20T08:00:00.000Z',
  updatedAt: '2026-06-09T07:30:00.000Z',
};

/** Mai collegato: nessun dominio/scope/sync, nessun link a store. */
export const CONNECTION_NOT_CONNECTED: ShopifyConnection = {
  id: 'shopify-conn-demo',
  tenantId: TENANT_ID,
  status: ShopifyConnectionStatus.NotConnected,
  createdAt: '2026-05-01T09:00:00.000Z',
  updatedAt: '2026-05-01T09:00:00.000Z',
};

/** Connesso ma autorizzazione da rinnovare: ultimo sync presente, errore auth. */
export const CONNECTION_REAUTH_REQUIRED: ShopifyConnection = {
  id: 'shopify-conn-demo',
  tenantId: TENANT_ID,
  status: ShopifyConnectionStatus.ReauthRequired,
  shopDomain: 'vestiflow-demo.myshopify.com',
  displayName: 'VestiFlow Demo Store',
  apiVersion: '2025-01',
  scopes: ['read_products', 'read_inventory'],
  storeId: 'store-napoli',
  lastConnectedAt: '2026-05-20T08:00:00.000Z',
  lastSyncAt: '2026-06-05T07:30:00.000Z',
  lastError: {
    message:
      "L'autorizzazione a Shopify e' scaduta. Ricollega il negozio per riprendere la sincronizzazione.",
    occurredAt: '2026-06-08T06:00:00.000Z',
    code: 'reauth_required',
  },
  createdAt: '2026-05-20T08:00:00.000Z',
  updatedAt: '2026-06-08T06:00:00.000Z',
};

/** Connessione in errore: ultimo sync precedente all'errore corrente. */
export const CONNECTION_ERROR: ShopifyConnection = {
  id: 'shopify-conn-demo',
  tenantId: TENANT_ID,
  status: ShopifyConnectionStatus.Error,
  shopDomain: 'vestiflow-demo.myshopify.com',
  displayName: 'VestiFlow Demo Store',
  apiVersion: '2025-01',
  scopes: ['read_products', 'write_products', 'read_inventory', 'read_orders'],
  storeId: 'store-napoli',
  lastConnectedAt: '2026-05-20T08:00:00.000Z',
  lastSyncAt: '2026-06-07T07:30:00.000Z',
  lastError: {
    message:
      'Sincronizzazione non riuscita. Riprova piu\u0027 tardi: se il problema persiste verifica la connessione.',
    occurredAt: '2026-06-09T07:35:00.000Z',
    code: 'sync_failed',
  },
  createdAt: '2026-05-20T08:00:00.000Z',
  updatedAt: '2026-06-09T07:35:00.000Z',
};

/** Connessione "attiva" servita dal service per il tenant corrente.
 *  Cambiare scenario in sviluppo = cambiare questo riferimento. */
export const MOCK_SHOPIFY_CONNECTIONS: readonly ShopifyConnection[] = [CONNECTION_CONNECTED];
