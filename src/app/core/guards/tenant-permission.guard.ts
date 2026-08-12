import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';

import { AuthService } from '@core/auth';
import type { TenantPermissionKey } from '@core/models/tenant-permission.model';
import {
  REQUIRED_TENANT_PERMISSION_GROUPS_KEY,
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
  const user = auth.currentUser();

  // Forma a gruppi: almeno un permesso da OGNI gruppo — lo specchio di
  // `RequireAllPermissionGroups` lato API. Senza, una rotta protetta da
  // «sezione E famiglia» sul server risultava aperta al client, e l'utente
  // arrivava a una schermata vuota che poi falliva ogni chiamata.
  const groups = (route.data[REQUIRED_TENANT_PERMISSION_GROUPS_KEY] ??
    []) as readonly (readonly TenantPermissionKey[])[];
  if (groups.length > 0) {
    // Un gruppo vuoto è un errore di programmazione: nega, non apre.
    const satisfied = groups.every(
      (group) => group.length > 0 && hasAnyTenantPermission(user, group),
    );
    if (!satisfied) {
      return router.createUrlTree(['/app/dashboard']);
    }
  }

  const required = normalizeRequiredPermissions(
    route.data[REQUIRED_TENANT_PERMISSIONS_KEY] as
      TenantPermissionKey | readonly TenantPermissionKey[] | undefined,
  );

  if (required.length === 0) {
    return true;
  }

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
