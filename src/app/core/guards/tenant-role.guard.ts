import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';

import { AuthService } from '@core/auth';
import {
  TENANT_ROUTE_PERMISSION_KEY,
  hasTenantRoutePermission,
  type TenantRoutePermission,
} from '@core/permissions/tenant-permissions.util';

/** Blocca route riservate a manager o admin del tenant (redirect alla dashboard). */
export const tenantRoleGuard: CanActivateFn = (route) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const permission = route.data[TENANT_ROUTE_PERMISSION_KEY] as TenantRoutePermission | undefined;

  if (!permission) {
    return true;
  }

  if (hasTenantRoutePermission(auth.currentUser(), permission)) {
    return true;
  }

  return router.createUrlTree(['/app/dashboard']);
};
