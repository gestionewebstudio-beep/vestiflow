import type { User, TenantChannelProfile } from '@prisma/client';

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
  readonly isActive: boolean;
  readonly isPlatformAdmin: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export function toUserProfileDto(
  user: User & {
    readonly stores: readonly { storeId: string }[];
    readonly tenant: { readonly name: string; readonly channelProfile: TenantChannelProfile };
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
    isActive: user.isActive,
    isPlatformAdmin,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}
