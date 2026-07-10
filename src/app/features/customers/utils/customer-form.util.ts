import type { NonNullableFormBuilder } from '@angular/forms';
import { Validators } from '@angular/forms';

import type { Customer, CustomerInput } from '@core/models/customer.model';

function trimOptional(value: string | undefined | null): string | undefined {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : undefined;
}

export function createCustomerFormGroup(fb: NonNullableFormBuilder) {
  return fb.group({
    firstName: fb.control('', { validators: [Validators.required, Validators.minLength(1)] }),
    lastName: fb.control('', { validators: [Validators.required, Validators.minLength(1)] }),
    email: fb.control('', { validators: [Validators.email] }),
    phone: fb.control(''),
    addressLine1: fb.control(''),
    addressLine2: fb.control(''),
    city: fb.control(''),
    province: fb.control(''),
    postalCode: fb.control(''),
    countryCode: fb.control('IT'),
    notes: fb.control(''),
    companyName: fb.control(''),
    vatNumber: fb.control(''),
    customerDiscount: fb.control(''),
    paymentTerms: fb.control(''),
    commercialNotes: fb.control(''),
    alsoSupplier: fb.control(false),
  });
}

export type CustomerFormGroup = ReturnType<typeof createCustomerFormGroup>;

export function mapCustomerFormToInput(raw: CustomerFormGroup['value']): CustomerInput {
  return {
    firstName: raw.firstName?.trim() ?? '',
    lastName: raw.lastName?.trim() ?? '',
    email: trimOptional(raw.email),
    phone: trimOptional(raw.phone),
    notes: trimOptional(raw.notes),
    addressLine1: trimOptional(raw.addressLine1),
    addressLine2: trimOptional(raw.addressLine2),
    city: trimOptional(raw.city),
    province: trimOptional(raw.province),
    postalCode: trimOptional(raw.postalCode),
    countryCode: trimOptional(raw.countryCode),
    companyName: trimOptional(raw.companyName),
    vatNumber: trimOptional(raw.vatNumber),
    customerDiscount: trimOptional(raw.customerDiscount),
    paymentTerms: trimOptional(raw.paymentTerms),
    commercialNotes: trimOptional(raw.commercialNotes),
    alsoSupplier: raw.alsoSupplier ?? false,
  };
}

export function patchCustomerFormGroup(form: CustomerFormGroup, customer: Customer): void {
  form.patchValue({
    firstName: customer.firstName,
    lastName: customer.lastName,
    email: customer.email ?? '',
    phone: customer.phone ?? '',
    addressLine1: customer.address?.line1 ?? '',
    addressLine2: customer.address?.line2 ?? '',
    city: customer.address?.city ?? '',
    province: customer.address?.province ?? '',
    postalCode: customer.address?.postalCode ?? '',
    countryCode: customer.address?.country ?? 'IT',
    notes: customer.notes ?? '',
    companyName: customer.companyName ?? '',
    vatNumber: customer.vatNumber ?? '',
    customerDiscount: customer.customerDiscount ?? '',
    paymentTerms: customer.paymentTerms ?? '',
    commercialNotes: customer.commercialNotes ?? '',
    alsoSupplier: Boolean(customer.linkedSupplierId),
  });
}

export function setCustomerAnagraficaReadOnly(form: CustomerFormGroup, readOnly: boolean): void {
  const controls = [
    'firstName',
    'lastName',
    'email',
    'phone',
    'addressLine1',
    'addressLine2',
    'city',
    'province',
    'postalCode',
    'countryCode',
    'notes',
  ] as const;
  for (const name of controls) {
    const control = form.controls[name];
    if (readOnly) {
      control.disable({ emitEvent: false });
    } else {
      control.enable({ emitEvent: false });
    }
  }
}
