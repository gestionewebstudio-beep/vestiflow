import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';

import { AuthService } from '@core/auth';
import type { TenantPermissionKey } from '@core/models/tenant-permission.model';
import {
  REQUIRED_TENANT_PERMISSIONS_KEY,
  REQUIRED_TENANT_PERMISSIONS_MODE_KEY,
  type RequiredTenantPermissionsMode,
} from '@core/permissions/tenant-permissions.util';
import {
  hasAnyTenantPermission,
  hasTenantPermission,
} from '@core/permissions/user-permissions.util';

function normalizeRequiredPermissions(
  value: TenantPermissionKey | readonly TenantPermissionKey[] | undefined,
): readonly TenantPermissionKey[] {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value as readonly TenantPermissionKey[];
  }
  return [value as TenantPermissionKey];
}

/** Blocca route se l'utente non ha i permessi granulari richiesti (redirect dashboard). */
export const tenantPermissionGuard: CanActivateFn = (route) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const required = normalizeRequiredPermissions(
    route.data[REQUIRED_TENANT_PERMISSIONS_KEY] as
      | TenantPermissionKey
      | readonly TenantPermissionKey[]
      | undefined,
  );

  if (required.length === 0) {
    return true;
  }

  const user = auth.currentUser();
  const mode = (route.data[REQUIRED_TENANT_PERMISSIONS_MODE_KEY] ??
    'any') as RequiredTenantPermissionsMode;
  const allowed =
    mode === 'all'
      ? required.every((permission) => hasTenantPermission(user, permission))
      : hasAnyTenantPermission(user, required);

  if (allowed) {
    return true;
  }

  return router.createUrlTree(['/app/dashboard']);
};
