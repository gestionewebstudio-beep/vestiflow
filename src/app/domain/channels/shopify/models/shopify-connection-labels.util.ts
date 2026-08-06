// Etichette e toni display per lo stato connessione Shopify (it-IT).

import { ShopifyConnectionStatus } from '@core/models/shopify-connection.model';
import type { BadgeTone } from '@shared/components/badge/badge.component';

const STATUS_LABELS: Record<ShopifyConnectionStatus, string> = {
  [ShopifyConnectionStatus.NotConnected]: 'Non connesso',
  [ShopifyConnectionStatus.Connected]: 'Connesso',
  [ShopifyConnectionStatus.ReauthRequired]: 'Riautorizzazione richiesta',
  [ShopifyConnectionStatus.Error]: 'Errore connessione',
};

const STATUS_TONES: Record<ShopifyConnectionStatus, BadgeTone> = {
  [ShopifyConnectionStatus.NotConnected]: 'neutral',
  [ShopifyConnectionStatus.Connected]: 'success',
  [ShopifyConnectionStatus.ReauthRequired]: 'warning',
  [ShopifyConnectionStatus.Error]: 'error',
};

export function shopifyConnectionStatusLabel(status: ShopifyConnectionStatus): string {
  return STATUS_LABELS[status];
}

export function shopifyConnectionStatusTone(status: ShopifyConnectionStatus): BadgeTone {
  return STATUS_TONES[status];
}
