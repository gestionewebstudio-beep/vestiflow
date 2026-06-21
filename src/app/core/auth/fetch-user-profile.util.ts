import { HttpClient } from '@angular/common/http';
import { map, type Observable } from 'rxjs';

import type { User } from '@core/models/user.model';
import { UserRole } from '@core/models/user.model';
import {
  TenantChannelProfile,
  type TenantChannelProfile as TenantChannelProfileType,
} from '@core/models/tenant-channel-profile.model';

/** Risposta `GET /auth/me` (allineata al backend NestJS). */
interface UserProfileApi {
  readonly id: string;
  readonly tenantId: string;
  readonly email: string;
  readonly displayName: string;
  readonly role: string;
  readonly storeIds: readonly string[];
  readonly isActive: boolean;
  readonly isPlatformAdmin: boolean;
  readonly tenantChannelProfile?: TenantChannelProfileType;
  readonly createdAt: string;
  readonly updatedAt: string;
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
    .pipe(map(mapUserProfile));
}

function mapUserProfile(row: UserProfileApi): User {
  return {
    id: row.id,
    tenantId: row.tenantId,
    email: row.email,
    displayName: row.displayName,
    role: row.role as UserRole,
    storeIds: row.storeIds,
    isActive: row.isActive,
    isPlatformAdmin: row.isPlatformAdmin,
    tenantChannelProfile: row.tenantChannelProfile ?? TenantChannelProfile.Shopify,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
