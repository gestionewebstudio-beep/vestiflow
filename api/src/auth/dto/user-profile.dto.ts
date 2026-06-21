import type { User, TenantChannelProfile } from '@prisma/client';

/** Profilo utente esposto al frontend (allineato a `User` Angular). */
export interface UserProfileDto {
  readonly id: string;
  readonly tenantId: string;
  readonly tenantChannelProfile: TenantChannelProfile;
  readonly email: string;
  readonly displayName: string;
  readonly role: User['role'];
  readonly storeIds: readonly string[];
  readonly isActive: boolean;
  readonly isPlatformAdmin: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export function toUserProfileDto(
  user: User & {
    readonly stores: readonly { storeId: string }[];
    readonly tenant: { readonly channelProfile: TenantChannelProfile };
  },
  isPlatformAdmin = false,
): UserProfileDto {
  return {
    id: user.id,
    tenantId: user.tenantId,
    tenantChannelProfile: user.tenant.channelProfile,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    storeIds: user.stores.map((link) => link.storeId),
    isActive: user.isActive,
    isPlatformAdmin,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}
