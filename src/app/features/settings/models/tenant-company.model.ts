import type { TenantChannelProfile } from '@core/models/tenant-channel-profile.model';

export interface TenantCompanyProfile {
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

/** Anagrafica commerciale del tenant (read-only in Impostazioni). */
export interface TenantCompany {
  readonly name: string;
  readonly channelProfile: TenantChannelProfile;
  readonly storeName: string | null;
  readonly licensedLocationCount: number;
  readonly licensedLocationActiveCount: number;
  readonly locationSelectionLocked: boolean;
  readonly locationSelectionChangeGranted: boolean;
  readonly canChangeLicensedLocations: boolean;
  readonly profile: TenantCompanyProfile;
}

export interface TenantCompanyDto {
  readonly name: string;
  readonly channelProfile: TenantChannelProfile;
  readonly storeName: string | null;
  readonly licensedLocationCount: number;
  readonly licensedLocationActiveCount: number;
  readonly locationSelectionLocked: boolean;
  readonly locationSelectionChangeGranted: boolean;
  readonly canChangeLicensedLocations: boolean;
  readonly profile: TenantCompanyProfile;
}

export function tenantCompanyFromDto(dto: TenantCompanyDto): TenantCompany {
  return {
    name: dto.name.trim(),
    channelProfile: dto.channelProfile,
    storeName: dto.storeName?.trim() || null,
    licensedLocationCount: dto.licensedLocationCount,
    licensedLocationActiveCount: dto.licensedLocationActiveCount,
    locationSelectionLocked: dto.locationSelectionLocked,
    locationSelectionChangeGranted: dto.locationSelectionChangeGranted,
    canChangeLicensedLocations: dto.canChangeLicensedLocations,
    profile: {
      legalName: dto.profile.legalName?.trim() || null,
      vatNumber: dto.profile.vatNumber?.trim() || null,
      fiscalCode: dto.profile.fiscalCode?.trim() || null,
      phone: dto.profile.phone?.trim() || null,
      pec: dto.profile.pec?.trim() || null,
      sdiCode: dto.profile.sdiCode?.trim() || null,
      addressLine1: dto.profile.addressLine1?.trim() || null,
      addressLine2: dto.profile.addressLine2?.trim() || null,
      city: dto.profile.city?.trim() || null,
      province: dto.profile.province?.trim() || null,
      postalCode: dto.profile.postalCode?.trim() || null,
      countryCode: dto.profile.countryCode?.trim() || null,
    },
  };
}

export function formatTenantCompanyAddress(profile: TenantCompanyProfile): string | null {
  const cityLine = [profile.postalCode, profile.city].filter(Boolean).join(' ');
  const parts = [
    profile.addressLine1,
    profile.addressLine2,
    cityLine,
    profile.province,
    profile.countryCode,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(', ') : null;
}

export interface TenantClientDetailField {
  readonly label: string;
  readonly value: string;
  readonly tabular: boolean;
}

/** Campi fiscali/contatti mostrati solo nel pannello espandibile. */
export function buildTenantClientExtendedFields(
  company: TenantCompany,
): readonly TenantClientDetailField[] {
  const profile = company.profile;
  const fields: TenantClientDetailField[] = [];

  const push = (label: string, value: string | null | undefined, tabular = false): void => {
    const trimmed = value?.trim();
    if (trimmed) {
      fields.push({ label, value: trimmed, tabular });
    }
  };

  const legalName = profile.legalName?.trim();
  if (legalName && legalName !== company.name.trim()) {
    push('Ragione sociale', legalName);
  }

  push('Partita IVA', profile.vatNumber, true);
  push('Codice fiscale', profile.fiscalCode, true);
  push('Indirizzo', formatTenantCompanyAddress(profile));
  push('Telefono', profile.phone);
  push('PEC', profile.pec);
  push('Codice destinatario SDI', profile.sdiCode, true);

  return fields;
}

export function tenantClientExtendedDetailsMeta(count: number): string {
  if (count <= 0) {
    return '';
  }
  return count === 1 ? '1 dato registrato' : `${count} dati registrati`;
}
