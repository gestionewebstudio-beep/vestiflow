import type { UserRole } from '@core/models/user.model';
import type { TenantChannelProfile } from '@core/models/tenant-channel-profile.model';

export interface TenantProfileFields {
  readonly legalName?: string;
  readonly vatNumber?: string;
  readonly fiscalCode?: string;
  readonly phone?: string;
  readonly pec?: string;
  readonly sdiCode?: string;
  readonly iban?: string;
  readonly addressLine1?: string;
  readonly addressLine2?: string;
  readonly city?: string;
  readonly province?: string;
  readonly postalCode?: string;
  readonly countryCode?: string;
}

export interface CreateTenantPayload extends TenantProfileFields {
  readonly tenantName: string;
  readonly channelProfile: TenantChannelProfile;
  readonly ownerDisplayName: string;
  readonly ownerEmail: string;
  readonly ownerPassword: string;
  readonly role?: UserRole;
  readonly storeName?: string;
  readonly locationName?: string;
  readonly licensedLocationCount?: number;
}

export interface UpdateTenantPayload extends TenantProfileFields {
  readonly tenantName?: string;
  readonly channelProfile?: TenantChannelProfile;
  readonly ownerDisplayName?: string;
  readonly storeName?: string;
  readonly locationName?: string;
  readonly licensedLocationCount?: number;
}

export interface ProvisionedTenant {
  readonly tenantId: string;
  readonly tenantName: string;
  readonly channelProfile: TenantChannelProfile;
  readonly ownerUserId: string;
  readonly ownerEmail: string;
  readonly ownerDisplayName: string;
  readonly role: UserRole;
  readonly storeId: string;
  readonly storeName: string;
  readonly locationId: string;
  readonly locationName: string;
  readonly ownerInviteSent: boolean;
}

export interface TenantSummary {
  readonly id: string;
  readonly name: string;
  readonly channelProfile: TenantChannelProfile;
  readonly createdAt: string;
  readonly ownerEmail: string | null;
  readonly ownerDisplayName: string | null;
  readonly vatNumber: string | null;
}

export interface TenantActiveLocation {
  readonly id: string;
  readonly name: string;
  readonly code: string | null;
  readonly isActive: boolean;
  readonly shopifyLocationId: string | null;
}

export interface TenantDetail {
  readonly id: string;
  readonly name: string;
  readonly channelProfile: TenantChannelProfile;
  readonly licensedLocationCount: number;
  readonly licensedLocationActiveCount: number;
  readonly locationSelectionLocked: boolean;
  readonly locationSelectionChangeGranted: boolean;
  readonly canChangeLicensedLocations: boolean;
  readonly createdAt: string;
  readonly profile: {
    readonly legalName: string | null;
    readonly vatNumber: string | null;
    readonly fiscalCode: string | null;
    readonly phone: string | null;
    readonly pec: string | null;
    readonly sdiCode: string | null;
    readonly iban: string | null;
    readonly addressLine1: string | null;
    readonly addressLine2: string | null;
    readonly city: string | null;
    readonly province: string | null;
    readonly postalCode: string | null;
    readonly countryCode: string | null;
  };
  readonly owner: {
    readonly id: string;
    readonly email: string;
    readonly displayName: string;
    readonly role: UserRole;
  } | null;
  readonly store: {
    readonly id: string;
    readonly name: string;
  } | null;
  readonly activeLocations: readonly TenantActiveLocation[];
  readonly location: {
    readonly id: string;
    readonly name: string;
    readonly addressLine1: string | null;
    readonly addressLine2: string | null;
    readonly city: string | null;
    readonly province: string | null;
    readonly postalCode: string | null;
    readonly countryCode: string | null;
  } | null;
}
