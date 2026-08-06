import type { TenantChannelProfile } from '@prisma/client';

export interface TenantSummaryDto {
  readonly id: string;
  readonly name: string;
  readonly channelProfile: TenantChannelProfile;
  readonly createdAt: string;
  readonly ownerEmail: string | null;
  readonly ownerDisplayName: string | null;
  readonly vatNumber: string | null;
}
