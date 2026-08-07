import type { Prisma } from '@prisma/client';

import { DEFAULT_TAX_REGIME_CODE } from '../tenant/tax-regime.constant';
import type { TenantProfileFieldsDto } from './dto/tenant-profile-fields.dto';

export function tenantProfileCreateData(
  dto: TenantProfileFieldsDto,
): Pick<
  Prisma.TenantCreateInput,
  | 'legalName'
  | 'vatNumber'
  | 'fiscalCode'
  | 'taxRegime'
  | 'phone'
  | 'pec'
  | 'sdiCode'
  | 'iban'
  | 'addressLine1'
  | 'addressLine2'
  | 'city'
  | 'province'
  | 'postalCode'
  | 'countryCode'
> {
  const countryCode = dto.countryCode ?? (dto.addressLine1 ? 'IT' : null);

  return {
    legalName: dto.legalName ?? null,
    vatNumber: dto.vatNumber ?? null,
    fiscalCode: dto.fiscalCode ?? null,
    // Colonna NOT NULL: senza scelta esplicita vale l'ordinario RF01.
    taxRegime: dto.taxRegime ?? DEFAULT_TAX_REGIME_CODE,
    phone: dto.phone ?? null,
    pec: dto.pec ?? null,
    sdiCode: dto.sdiCode ?? null,
    iban: dto.iban ?? null,
    addressLine1: dto.addressLine1 ?? null,
    addressLine2: dto.addressLine2 ?? null,
    city: dto.city ?? null,
    province: dto.province ?? null,
    postalCode: dto.postalCode ?? null,
    countryCode,
  };
}

export function tenantProfileReplaceData(
  dto: TenantProfileFieldsDto,
): Pick<
  Prisma.TenantUpdateInput,
  | 'legalName'
  | 'vatNumber'
  | 'fiscalCode'
  | 'taxRegime'
  | 'phone'
  | 'pec'
  | 'sdiCode'
  | 'iban'
  | 'addressLine1'
  | 'addressLine2'
  | 'city'
  | 'province'
  | 'postalCode'
  | 'countryCode'
> {
  const hasAddress = Boolean(dto.addressLine1?.trim());

  return {
    legalName: dto.legalName ?? null,
    vatNumber: dto.vatNumber ?? null,
    fiscalCode: dto.fiscalCode ?? null,
    taxRegime: dto.taxRegime ?? DEFAULT_TAX_REGIME_CODE,
    phone: dto.phone ?? null,
    pec: dto.pec ?? null,
    sdiCode: dto.sdiCode ?? null,
    iban: dto.iban ?? null,
    addressLine1: dto.addressLine1 ?? null,
    addressLine2: dto.addressLine2 ?? null,
    city: dto.city ?? null,
    province: dto.province ?? null,
    postalCode: dto.postalCode ?? null,
    countryCode: dto.countryCode ?? (hasAddress ? 'IT' : null),
  };
}

export function locationAddressFromProfile(dto: TenantProfileFieldsDto): {
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
  countryCode: string | null;
} {
  const hasAddress = Boolean(dto.addressLine1?.trim());
  return {
    addressLine1: dto.addressLine1 ?? null,
    addressLine2: dto.addressLine2 ?? null,
    city: dto.city ?? null,
    province: dto.province ?? null,
    postalCode: dto.postalCode ?? null,
    countryCode: dto.countryCode ?? (hasAddress ? 'IT' : null),
  };
}
