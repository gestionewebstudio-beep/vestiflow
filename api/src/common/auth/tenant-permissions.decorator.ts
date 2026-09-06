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

export const TENANT_PERMISSION_GROUPS_KEY = 'tenantPermissionGroups';

/**
 * Richiede almeno un permesso da OGNI gruppo: la forma «una di queste E quella».
 * Serve dove un'azione si somma a un accesso invece di sostituirlo — l'export
 * di una sezione richiede sia la sezione sia «Esportare dati», altrimenti la
 * chiave di export diventerebbe una scorciatoia per leggere ciò che l'utente
 * non potrebbe aprire.
 */
export const RequireAllPermissionGroups = (
  groups: readonly (readonly TenantPermissionKey[])[],
): MethodDecorator & ClassDecorator =>
  SetMetadata(
    TENANT_PERMISSION_GROUPS_KEY,
    groups.map((group) => [...group]),
  );
