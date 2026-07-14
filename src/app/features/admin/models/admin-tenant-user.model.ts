import type { TenantPermissionKey } from '@core/models/tenant-permission.model';
import type { UserRole } from '@core/models/user.model';

export interface TenantUser {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly role: UserRole;
  readonly hasAllLocationsAccess: boolean;
  readonly assignedLocationIds: readonly string[];
  readonly assignedLocations: readonly { readonly id: string; readonly name: string }[];
  /** Sede predefinita (suggerimento nei form); null se non impostata. */
  readonly defaultLocationId: string | null;
  readonly permissions: readonly string[];
  readonly isActive: boolean;
  readonly createdAt: string;
}

export interface CreateTenantUserPayload {
  readonly email: string;
  readonly password: string;
  readonly displayName: string;
  readonly role: UserRole;
  readonly hasAllLocationsAccess?: boolean;
  readonly assignedLocationIds?: readonly string[];
  /** Sede predefinita facoltativa: deve essere autorizzata per l'utente. */
  readonly defaultLocationId?: string;
  readonly permissions?: readonly TenantPermissionKey[];
}

export interface UpdateTenantUserPayload {
  readonly displayName?: string;
  readonly role?: UserRole;
  readonly hasAllLocationsAccess?: boolean;
  readonly assignedLocationIds?: readonly string[];
  /** Sede predefinita: uuid autorizzato oppure null per azzerarla. */
  readonly defaultLocationId?: string | null;
  readonly isActive?: boolean;
  readonly permissions?: readonly TenantPermissionKey[];
}

export function tenantUserRequiresAssignedLocation(role: UserRole): boolean {
  return role === 'manager' || role === 'clerk';
}
