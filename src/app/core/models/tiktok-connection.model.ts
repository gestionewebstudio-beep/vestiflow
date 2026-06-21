import type { IsoDateString } from './common.model';

export const TikTokConnectionStatus = {
  NotConnected: 'not_connected',
  Connected: 'connected',
  ReauthRequired: 'reauth_required',
  Error: 'error',
} as const;

export type TikTokConnectionStatus =
  (typeof TikTokConnectionStatus)[keyof typeof TikTokConnectionStatus];

export interface TikTokConnectionError {
  readonly message: string;
  readonly occurredAt: IsoDateString;
  readonly code?: string;
}

/** Stato connessione TikTok Shop (read-only, nessun token). */
export interface TikTokConnection {
  readonly id: string;
  readonly tenantId: string;
  readonly status: TikTokConnectionStatus;
  readonly shopId?: string;
  readonly shopCipher?: string;
  readonly displayName?: string;
  readonly region?: string;
  readonly scopes?: readonly string[];
  readonly lastConnectedAt?: IsoDateString;
  readonly lastSyncAt?: IsoDateString;
  readonly lastError?: TikTokConnectionError;
  readonly createdAt: IsoDateString;
  readonly updatedAt: IsoDateString;
}
