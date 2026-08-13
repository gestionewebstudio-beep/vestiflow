import type { FormGroup } from '@angular/forms';
import type { NonNullableFormBuilder } from '@angular/forms';

import {
  companyFieldsPayload,
  createCompanyFieldsControls,
} from '@domain/tenant/models/company-profile.model';

import type { TenantDetail } from './admin-tenant.model';

/**
 * I campi anagrafici del cliente VestiFlow. Sono gli stessi controlli della
 * maschera «Dati azienda» del titolare — stessa forma, dato diverso — e le
 * regole di validazione stanno una volta sola in `@domain/tenant`.
 */
export function createTenantProfileControls(fb: NonNullableFormBuilder) {
  return createCompanyFieldsControls(fb);
}

export function patchTenantProfileForm(form: FormGroup, detail: TenantDetail): void {
  form.patchValue({
    tenantName: detail.name,
    legalName: detail.profile.legalName ?? '',
    vatNumber: detail.profile.vatNumber ?? '',
    fiscalCode: detail.profile.fiscalCode ?? '',
    phone: detail.profile.phone ?? '',
    pec: detail.profile.pec ?? '',
    sdiCode: detail.profile.sdiCode ?? '',
    iban: detail.profile.iban ?? '',
    addressLine1: detail.profile.addressLine1 ?? '',
    addressLine2: detail.profile.addressLine2 ?? '',
    city: detail.profile.city ?? '',
    province: detail.profile.province ?? '',
    postalCode: detail.profile.postalCode ?? '',
    countryCode: detail.profile.countryCode ?? 'IT',
    ownerDisplayName: detail.owner?.displayName ?? '',
    channelProfile: detail.channelProfile,
    licensedLocationCount: detail.licensedLocationCount,
    storeName: detail.store?.name ?? '',
  });
}

export function profilePayloadFromForm(
  raw: Record<string, string | number | boolean | null | undefined>,
): Record<string, string | undefined> {
  return companyFieldsPayload(raw);
}
