import { TikTokConnectionStatus } from '@core/models/tiktok-connection.model';
import type { BadgeTone } from '@shared/components/badge/badge.component';

const STATUS_LABELS: Record<TikTokConnectionStatus, string> = {
  [TikTokConnectionStatus.NotConnected]: 'Non connesso',
  [TikTokConnectionStatus.Connected]: 'Connesso',
  [TikTokConnectionStatus.ReauthRequired]: 'Riautorizzazione richiesta',
  [TikTokConnectionStatus.Error]: 'Errore connessione',
};

const STATUS_TONES: Record<TikTokConnectionStatus, BadgeTone> = {
  [TikTokConnectionStatus.NotConnected]: 'neutral',
  [TikTokConnectionStatus.Connected]: 'success',
  [TikTokConnectionStatus.ReauthRequired]: 'warning',
  [TikTokConnectionStatus.Error]: 'error',
};

export function tiktokConnectionStatusLabel(status: TikTokConnectionStatus): string {
  return STATUS_LABELS[status];
}

export function tiktokConnectionStatusTone(status: TikTokConnectionStatus): BadgeTone {
  return STATUS_TONES[status];
}
