import type { User, TenantChannelProfile } from '@prisma/client';

/** Profilo utente esposto al frontend (allineato a `User` Angular). */
export interface SupportSessionProfileDto {
  readonly sessionId: string;
  readonly targetTenantId: string;
  readonly targetTenantName: string;
  readonly expiresAt: string;
}

/** Profilo utente esposto al frontend (allineato a `User` Angular). */
export interface UserProfileDto {
  readonly id: string;
  readonly tenantId: string;
  readonly tenantName: string;
  readonly tenantChannelProfile: TenantChannelProfile;
  readonly email: string;
  readonly displayName: string;
  readonly avatarUrl: string | null;
  readonly role: User['role'];
  readonly storeIds: readonly string[];
  readonly hasAllLocationsAccess: boolean;
  readonly assignedLocationIds: readonly string[];
  readonly assignedLocations: readonly { readonly id: string; readonly name: string }[];
  /** Sede predefinita (suggerimento nei form, mai fallback automatico). */
  readonly defaultLocationId: string | null;
  readonly defaultLocation: { readonly id: string; readonly name: string } | null;
  readonly permissions: readonly string[];
  readonly isActive: boolean;
  readonly isPlatformAdmin: boolean;
  readonly supportSession?: SupportSessionProfileDto;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export function toUserProfileDto(
  user: User & {
    readonly stores: readonly { storeId: string }[];
    readonly tenant: { readonly name: string; readonly channelProfile: TenantChannelProfile };
    readonly locations?: readonly {
      readonly location: { readonly id: string; readonly name: string };
    }[];
    readonly defaultLocation?: { readonly id: string; readonly name: string } | null;
  },
  isPlatformAdmin = false,
): UserProfileDto {
  return {
    id: user.id,
    tenantId: user.tenantId,
    tenantName: user.tenant.name,
    tenantChannelProfile: user.tenant.channelProfile,
    email: user.email,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    role: user.role,
    storeIds: user.stores.map((link) => link.storeId),
    hasAllLocationsAccess: user.hasAllLocationsAccess,
    assignedLocationIds: (user.locations ?? []).map((row) => row.location.id),
    assignedLocations: (user.locations ?? []).map((row) => row.location),
    defaultLocationId: user.defaultLocationId ?? null,
    defaultLocation: user.defaultLocation ?? null,
    permissions: user.permissions ?? [],
    isActive: user.isActive,
    isPlatformAdmin,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}
