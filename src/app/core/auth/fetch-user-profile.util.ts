import { HttpClient } from '@angular/common/http';
import { map, type Observable } from 'rxjs';

import type { User } from '@core/models/user.model';
import { UserRole } from '@core/models/user.model';
import {
  TenantChannelProfile,
  type TenantChannelProfile as TenantChannelProfileType,
} from '@core/models/tenant-channel-profile.model';

/** Risposta `GET /auth/me` (allineata al backend NestJS). */
export interface SupportSessionApi {
  readonly sessionId: string;
  readonly targetTenantId: string;
  readonly targetTenantName: string;
  readonly expiresAt: string;
}

/** Risposta `GET /auth/me` (allineata al backend NestJS). */
export interface UserProfileApi {
  readonly id: string;
  readonly tenantId: string;
  readonly email: string;
  readonly displayName: string;
  readonly avatarUrl?: string | null;
  readonly role: string;
  readonly storeIds: readonly string[];
  readonly isActive: boolean;
  readonly isPlatformAdmin: boolean;
  readonly supportSession?: SupportSessionApi;
  readonly tenantChannelProfile?: TenantChannelProfileType;
  readonly tenantName?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export function mapUserProfileFromApi(row: UserProfileApi): User {
  return {
    id: row.id,
    tenantId: row.tenantId,
    email: row.email,
    displayName: row.displayName,
    avatarUrl: row.avatarUrl ?? null,
    role: row.role as UserRole,
    storeIds: row.storeIds,
    isActive: row.isActive,
    isPlatformAdmin: row.isPlatformAdmin,
    supportSession: row.supportSession,
    tenantChannelProfile: row.tenantChannelProfile ?? TenantChannelProfile.Shopify,
    tenantName: row.tenantName?.trim() || 'Cliente',
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function fetchUserProfile(
  http: HttpClient,
  apiBaseUrl: string,
  accessToken: string,
): Observable<User> {
  return http
    .get<UserProfileApi>(`${apiBaseUrl}/auth/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    .pipe(map(mapUserProfileFromApi));
}
