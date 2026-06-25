import type { TenantChannelProfile } from '@prisma/client';

export interface TenantProfileDto {
  readonly legalName: string | null;
  readonly vatNumber: string | null;
  readonly fiscalCode: string | null;
  readonly phone: string | null;
  readonly pec: string | null;
  readonly sdiCode: string | null;
  readonly addressLine1: string | null;
  readonly addressLine2: string | null;
  readonly city: string | null;
  readonly province: string | null;
  readonly postalCode: string | null;
  readonly countryCode: string | null;
}

export interface TenantActiveLocationDto {
  readonly id: string;
  readonly name: string;
  readonly code: string | null;
  readonly isActive: boolean;
  readonly shopifyLocationId: string | null;
}

export interface TenantDetailDto {
  readonly id: string;
  readonly name: string;
  readonly channelProfile: TenantChannelProfile;
  readonly licensedLocationCount: number;
  readonly licensedLocationActiveCount: number;
  readonly locationSelectionLocked: boolean;
  readonly locationSelectionChangeGranted: boolean;
  readonly canChangeLicensedLocations: boolean;
  readonly createdAt: string;
  readonly profile: TenantProfileDto;
  readonly owner: {
    readonly id: string;
    readonly email: string;
    readonly displayName: string;
    readonly role: string;
  } | null;
  readonly store: {
    readonly id: string;
    readonly name: string;
  } | null;
  readonly activeLocations: readonly TenantActiveLocationDto[];
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
