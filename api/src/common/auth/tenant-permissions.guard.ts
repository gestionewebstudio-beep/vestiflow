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
  TENANT_PERMISSION_GROUPS_KEY,
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
    // I gruppi si SOMMANO fra classe e handler (getAll, non getAllAndOverride):
    // la porta di sezione dichiarata sulla classe non deve poter sparire perché
    // un handler aggiunge un proprio requisito — sarebbe un buco silenzioso,
    // che nessun test coglierebbe.
    const groups = [
      ...(this.reflector.get<TenantPermissionKey[][] | undefined>(
        TENANT_PERMISSION_GROUPS_KEY,
        context.getClass(),
      ) ?? []),
      ...(this.reflector.get<TenantPermissionKey[][] | undefined>(
        TENANT_PERMISSION_GROUPS_KEY,
        context.getHandler(),
      ) ?? []),
    ];
    const required = this.reflector.getAllAndOverride<TenantPermissionKey[] | undefined>(
      TENANT_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if ((!required || required.length === 0) && groups.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (request.supportSession) {
      return true;
    }

    const user = request.appUser;

    // Forma a gruppi: almeno un permesso da OGNI gruppo (una di queste E quella).
    // Un gruppo VUOTO è un errore di programmazione, non «nessun requisito»:
    // lasciarlo passare aprirebbe la rotta a chiunque, in silenzio.
    if (groups.length > 0) {
      const satisfied = groups.every(
        (group) => group.length > 0 && hasAnyTenantPermission(user, group),
      );
      if (!satisfied) {
        throw new ForbiddenException('Permessi insufficienti per questa azione');
      }
    }
    if (!required || required.length === 0) {
      return true;
    }
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
