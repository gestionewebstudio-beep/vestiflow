import type { TikTokConnection, TikTokConnectionError } from '@core/models/tiktok-connection.model';

import type { TikTokConnectionDto, TikTokConnectionErrorDto } from './tiktok-connection.dto';

function errorFromDto(dto: TikTokConnectionErrorDto): TikTokConnectionError {
  return {
    message: dto.message,
    occurredAt: dto.occurredAt,
    code: dto.code,
  };
}

export function tiktokConnectionFromDto(dto: TikTokConnectionDto): TikTokConnection {
  return {
    id: dto.id,
    tenantId: dto.tenantId,
    status: dto.status,
    shopId: dto.shopId ?? undefined,
    shopCipher: dto.shopCipher ?? undefined,
    displayName: dto.displayName ?? undefined,
    region: dto.region ?? undefined,
    scopes: dto.scopes,
    lastConnectedAt: dto.lastConnectedAt ?? undefined,
    lastSyncAt: dto.lastSyncAt ?? undefined,
    lastError: dto.lastError ? errorFromDto(dto.lastError) : undefined,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  };
}
