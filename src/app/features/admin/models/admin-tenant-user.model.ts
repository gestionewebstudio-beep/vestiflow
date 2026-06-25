import type { TenantPermissionKey } from '@core/models/tenant-permission.model';
import type { UserRole } from '@core/models/user.model';

export interface TenantUser {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly role: UserRole;
  readonly assignedLocationId: string | null;
  readonly assignedLocationName: string | null;
  readonly permissions: readonly string[];
  readonly isActive: boolean;
  readonly createdAt: string;
}

export interface CreateTenantUserPayload {
  readonly email: string;
  readonly password: string;
  readonly displayName: string;
  readonly role: UserRole;
  readonly assignedLocationId?: string;
  readonly permissions?: readonly TenantPermissionKey[];
}

export interface UpdateTenantUserPayload {
  readonly displayName?: string;
  readonly role?: UserRole;
  readonly assignedLocationId?: string | null;
  readonly isActive?: boolean;
  readonly permissions?: readonly TenantPermissionKey[];
}

export function tenantUserRequiresAssignedLocation(role: UserRole): boolean {
  return role === 'manager' || role === 'clerk';
}
