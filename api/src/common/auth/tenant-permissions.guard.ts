import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { TenantPermissionKey } from '../../auth/tenant-permission.constants';
import {
  hasAllTenantPermissions,
  hasAnyTenantPermission,
  hasTenantPermission,
} from '../../auth/user-permissions.util';
import type { AuthenticatedRequest } from './authenticated-request';
import {
  TENANT_PERMISSIONS_KEY,
  TENANT_PERMISSIONS_MODE_KEY,
  type TenantPermissionsMode,
} from './tenant-permissions.decorator';

/**
 * Autorizzazione granulare per permessi tenant.
 * Va usata DOPO JwtAuthGuard; legge `request.appUser.permissions`.
 */
@Injectable()
export class TenantPermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<TenantPermissionKey[] | undefined>(
      TENANT_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (request.supportSession) {
      return true;
    }

    const user = request.appUser;
    const mode = this.reflector.getAllAndOverride<TenantPermissionsMode | undefined>(
      TENANT_PERMISSIONS_MODE_KEY,
      [context.getHandler(), context.getClass()],
    );
    const allowed =
      mode === 'all'
        ? hasAllTenantPermissions(user, required)
        : required.length === 1
          ? hasTenantPermission(user, required[0]!)
          : hasAnyTenantPermission(user, required);

    if (!allowed) {
      throw new ForbiddenException('Permessi insufficienti per questa azione');
    }

    return true;
  }
}
