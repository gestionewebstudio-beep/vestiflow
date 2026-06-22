import type { TenantChannelProfile } from '@prisma/client';

export interface TenantCompanyProfileDto {
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

/** Anagrafica commerciale del tenant (read-only per utenti del cliente). */
export interface TenantCompanyDto {
  readonly name: string;
  readonly channelProfile: TenantChannelProfile;
  readonly storeName: string | null;
  readonly profile: TenantCompanyProfileDto;
}
