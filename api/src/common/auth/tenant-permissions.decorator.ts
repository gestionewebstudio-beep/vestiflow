import { SetMetadata } from '@nestjs/common';

import type { TenantPermissionKey } from '../../auth/tenant-permission.constants';

export const TENANT_PERMISSIONS_KEY = 'tenantPermissions';

export type TenantPermissionsMode = 'any' | 'all';

export const TENANT_PERMISSIONS_MODE_KEY = 'tenantPermissionsMode';

/**
 * Richiede almeno uno dei permessi granulari indicati.
 * Va usato con TenantPermissionsGuard dopo JwtAuthGuard.
 */
export const RequirePermissions = (
  ...permissions: TenantPermissionKey[]
): MethodDecorator & ClassDecorator => SetMetadata(TENANT_PERMISSIONS_KEY, permissions);

/** Richiede almeno uno tra i permessi del gruppo (array costante condiviso). */
export const RequireAnyPermissions = (
  permissions: readonly TenantPermissionKey[],
): MethodDecorator & ClassDecorator => SetMetadata(TENANT_PERMISSIONS_KEY, [...permissions]);
