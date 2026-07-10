import type { NonNullableFormBuilder } from '@angular/forms';
import { Validators } from '@angular/forms';

import type { Supplier, SupplierInput } from '@core/models/supplier.model';

function trimOptional(value: string | undefined | null): string | undefined {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : undefined;
}

export function createSupplierFormGroup(fb: NonNullableFormBuilder) {
  return fb.group({
    code: fb.control(''),
    name: fb.control('', { validators: [Validators.required, Validators.minLength(1)] }),
    vatNumber: fb.control(''),
    taxCode: fb.control(''),
    email: fb.control('', { validators: [Validators.email] }),
    pec: fb.control('', { validators: [Validators.email] }),
    phone: fb.control(''),
    contactName: fb.control(''),
    website: fb.control(''),
    addressLine1: fb.control(''),
    addressLine2: fb.control(''),
    city: fb.control(''),
    province: fb.control(''),
    postalCode: fb.control(''),
    countryCode: fb.control('IT'),
    paymentTerms: fb.control(''),
    notes: fb.control(''),
  });
}

export type SupplierFormGroup = ReturnType<typeof createSupplierFormGroup>;

export function mapSupplierFormToInput(raw: SupplierFormGroup['value']): SupplierInput {
  return {
    code: trimOptional(raw.code),
    name: raw.name?.trim() ?? '',
    vatNumber: trimOptional(raw.vatNumber),
    taxCode: trimOptional(raw.taxCode),
    email: trimOptional(raw.email),
    pec: trimOptional(raw.pec),
    phone: trimOptional(raw.phone),
    contactName: trimOptional(raw.contactName),
    website: trimOptional(raw.website),
    addressLine1: trimOptional(raw.addressLine1),
    addressLine2: trimOptional(raw.addressLine2),
    city: trimOptional(raw.city),
    province: trimOptional(raw.province),
    postalCode: trimOptional(raw.postalCode),
    countryCode: trimOptional(raw.countryCode),
    paymentTerms: trimOptional(raw.paymentTerms),
    notes: trimOptional(raw.notes),
  };
}

export function patchSupplierFormGroup(form: SupplierFormGroup, supplier: Supplier): void {
  form.patchValue({
    code: supplier.code ?? '',
    name: supplier.name,
    vatNumber: supplier.vatNumber ?? '',
    taxCode: supplier.taxCode ?? '',
    email: supplier.email ?? '',
    pec: supplier.pec ?? '',
    phone: supplier.phone ?? '',
    contactName: supplier.contactName ?? '',
    website: supplier.website ?? '',
    addressLine1: supplier.addressLine1 ?? '',
    addressLine2: supplier.addressLine2 ?? '',
    city: supplier.city ?? '',
    province: supplier.province ?? '',
    postalCode: supplier.postalCode ?? '',
    countryCode: supplier.countryCode ?? 'IT',
    paymentTerms: supplier.paymentTerms ?? '',
    notes: supplier.notes ?? '',
  });
}

export function resetSupplierFormGroup(form: SupplierFormGroup): void {
  form.reset({
    code: '',
    name: '',
    vatNumber: '',
    taxCode: '',
    email: '',
    pec: '',
    phone: '',
    contactName: '',
    website: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    province: '',
    postalCode: '',
    countryCode: 'IT',
    paymentTerms: '',
    notes: '',
  });
}
