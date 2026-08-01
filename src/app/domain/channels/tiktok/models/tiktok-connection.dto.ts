import type { TikTokConnectionStatus } from '@core/models/tiktok-connection.model';
import type { IsoDateString } from '@core/models/common.model';

export interface TikTokConnectionErrorDto {
  readonly message: string;
  readonly occurredAt: IsoDateString;
  readonly code?: string;
}

export interface TikTokConnectionDto {
  readonly id: string;
  readonly tenantId: string;
  readonly status: TikTokConnectionStatus;
  readonly shopId?: string | null;
  readonly shopCipher?: string | null;
  readonly displayName?: string | null;
  readonly region?: string | null;
  readonly scopes?: readonly string[];
  readonly lastConnectedAt?: IsoDateString | null;
  readonly lastSyncAt?: IsoDateString | null;
  readonly lastError?: TikTokConnectionErrorDto | null;
  readonly createdAt: IsoDateString;
  readonly updatedAt: IsoDateString;
}

export interface TikTokClearErrorsDto {
  readonly cleared: true;
  readonly productsReset: number;
}
