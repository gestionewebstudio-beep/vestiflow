import type { FormGroup } from '@angular/forms';
import type { NonNullableFormBuilder } from '@angular/forms';
import { Validators } from '@angular/forms';

import type { TenantDetail } from './admin-tenant.model';
import { italianVatValidator, optionalEmailValidator } from './admin-tenant.validators';

export function createTenantProfileControls(fb: NonNullableFormBuilder) {
  return {
    legalName: fb.control('', { validators: [Validators.maxLength(160)] }),
    vatNumber: fb.control('', { validators: [Validators.maxLength(16), italianVatValidator()] }),
    fiscalCode: fb.control('', { validators: [Validators.maxLength(16)] }),
    phone: fb.control('', { validators: [Validators.maxLength(30)] }),
    pec: fb.control('', { validators: [Validators.maxLength(255), optionalEmailValidator()] }),
    sdiCode: fb.control('', { validators: [Validators.maxLength(7)] }),
    addressLine1: fb.control('', { validators: [Validators.maxLength(200)] }),
    addressLine2: fb.control('', { validators: [Validators.maxLength(200)] }),
    city: fb.control('', { validators: [Validators.maxLength(100)] }),
    province: fb.control('', { validators: [Validators.maxLength(100)] }),
    postalCode: fb.control('', { validators: [Validators.maxLength(20)] }),
    countryCode: fb.control('IT', { validators: [Validators.maxLength(2)] }),
  };
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
    addressLine1: detail.profile.addressLine1 ?? '',
    addressLine2: detail.profile.addressLine2 ?? '',
    city: detail.profile.city ?? '',
    province: detail.profile.province ?? '',
    postalCode: detail.profile.postalCode ?? '',
    countryCode: detail.profile.countryCode ?? 'IT',
    ownerDisplayName: detail.owner?.displayName ?? '',
    storeName: detail.store?.name ?? '',
    locationName: detail.location?.name ?? '',
  });
}

export function profilePayloadFromForm(
  raw: Record<string, string>,
): Record<string, string | undefined> {
  const optional = (value: string): string | undefined => {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  };

  return {
    legalName: optional(raw['legalName'] ?? ''),
    vatNumber: optional(raw['vatNumber'] ?? ''),
    fiscalCode: optional(raw['fiscalCode'] ?? ''),
    phone: optional(raw['phone'] ?? ''),
    pec: optional(raw['pec'] ?? ''),
    sdiCode: optional(raw['sdiCode'] ?? ''),
    addressLine1: optional(raw['addressLine1'] ?? ''),
    addressLine2: optional(raw['addressLine2'] ?? ''),
    city: optional(raw['city'] ?? ''),
    province: optional(raw['province'] ?? ''),
    postalCode: optional(raw['postalCode'] ?? ''),
    countryCode: optional(raw['countryCode'] ?? ''),
  };
}
