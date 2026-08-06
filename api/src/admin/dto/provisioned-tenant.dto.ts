import type { TenantChannelProfile } from '@prisma/client';

export interface ProvisionedTenantDto {
  readonly tenantId: string;
  readonly tenantName: string;
  readonly channelProfile: TenantChannelProfile;
  readonly ownerUserId: string;
  readonly ownerEmail: string;
  readonly ownerDisplayName: string;
  readonly role: string;
  readonly storeId: string;
  readonly storeName: string;
  readonly locationId: string;
  readonly locationName: string;
  readonly ownerInviteSent: boolean;
}
