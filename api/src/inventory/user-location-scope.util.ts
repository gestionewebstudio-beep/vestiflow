import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';

import type { UserProfileDto } from '../auth/dto/user-profile.dto';
import { TenantPermission } from '../auth/tenant-permission.constants';
import { hasFullTenantAccess, hasTenantPermission } from '../auth/user-permissions.util';

import type { LicensedLocationScope } from './licensed-location-scope.util';

/** Titolare/admin possono cambiare sede in topbar (legacy + admin operativo). */
export function hasUnrestrictedLocationAccess(
  user: Pick<UserProfileDto, 'role' | 'supportSession'>,
): boolean {
  if (user.supportSession) {
    return true;
  }
  return user.role === UserRole.owner || user.role === UserRole.admin;
}

export function requiresAssignedLocation(user: Pick<UserProfileDto, 'role'>): boolean {
  return user.role === UserRole.manager || user.role === UserRole.clerk;
}

/** Scope di lettura inventario: tutte le sedi se permesso view_all, altrimenti sede assegnata. */
export function applyReadLocationScope(
  licensedScope: LicensedLocationScope,
  user: Pick<UserProfileDto, 'role' | 'assignedLocationId' | 'supportSession' | 'permissions'>,
): LicensedLocationScope | null {
  if (hasFullTenantAccess(user)) {
    return licensedScope;
  }
  if (hasTenantPermission(user, TenantPermission.InventoryViewAllLocations)) {
    return licensedScope;
  }
  return applyAssignedLocationScope(licensedScope, user);
}

/** Scope operativo scrittura: titolare/admin senza sede fissa = tutte; altrimenti sede assegnata. */
export function applyWriteLocationScope(
  licensedScope: LicensedLocationScope,
  user: Pick<UserProfileDto, 'role' | 'assignedLocationId' | 'supportSession' | 'permissions'>,
): LicensedLocationScope | null {
  if (hasFullTenantAccess(user) || hasUnrestrictedLocationAccess(user)) {
    return licensedScope;
  }

  return applyAssignedLocationScope(licensedScope, user);
}

function applyAssignedLocationScope(
  licensedScope: LicensedLocationScope,
  user: Pick<UserProfileDto, 'assignedLocationId'>,
): LicensedLocationScope | null {
  const assigned = user.assignedLocationId;
  if (!assigned || !licensedScope.includes(assigned)) {
    return null;
  }
  return [assigned];
}

export function assertUserCanAccessLocation(
  user: UserProfileDto,
  locationId: string,
  purpose: 'write' | 'transferDestination' = 'write',
): void {
  if (hasFullTenantAccess(user)) {
    return;
  }

  if (!hasTenantPermission(user, TenantPermission.InventoryManage)) {
    throw new ForbiddenException(
      purpose === 'transferDestination'
        ? 'Non autorizzato a trasferire giacenze.'
        : 'Non autorizzato a modificare le giacenze.',
    );
  }

  if (purpose === 'transferDestination') {
    return;
  }

  if (user.role === UserRole.admin && !user.assignedLocationId) {
    return;
  }

  if (!user.assignedLocationId) {
    throw new ForbiddenException(
      'Sede operativa non assegnata. Contatta il referente VestiFlow.',
    );
  }

  if (user.assignedLocationId !== locationId) {
    throw new ForbiddenException('Non autorizzato a operare su questa sede.');
  }
}
