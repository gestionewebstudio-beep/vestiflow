import type { AbstractControl, NonNullableFormBuilder, ValidationErrors } from '@angular/forms';
import { Validators } from '@angular/forms';

import type { Customer, CustomerInput } from '@core/models/customer.model';

function trimOptional(value: string | undefined | null): string | undefined {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Denominazione minima del soggetto: ragione sociale OPPURE nome e cognome
 * (logica Danea: un cliente può essere azienda o persona fisica).
 */
export function customerIdentityValidator(group: AbstractControl): ValidationErrors | null {
  const companyName = (group.get('companyName')?.value as string | undefined)?.trim();
  const firstName = (group.get('firstName')?.value as string | undefined)?.trim();
  const lastName = (group.get('lastName')?.value as string | undefined)?.trim();
  if (companyName || (firstName && lastName)) {
    return null;
  }
  return { identityRequired: true };
}

export function createCustomerFormGroup(fb: NonNullableFormBuilder) {
  return fb.group(
    {
      // Soggetto (dati comuni ai ruoli)
      firstName: fb.control(''),
      lastName: fb.control(''),
      companyName: fb.control(''),
      vatNumber: fb.control(''),
      taxCode: fb.control(''),
      email: fb.control('', { validators: [Validators.email] }),
      pec: fb.control('', { validators: [Validators.email] }),
      phone: fb.control(''),
      website: fb.control(''),
      contactName: fb.control(''),
      addressLine1: fb.control(''),
      addressLine2: fb.control(''),
      city: fb.control(''),
      province: fb.control(''),
      postalCode: fb.control(''),
      countryCode: fb.control('IT'),
      notes: fb.control(''),
      // Ruolo cliente (dati commerciali)
      code: fb.control(''),
      customerDiscount: fb.control(''),
      paymentMethod: fb.control(''),
      paymentTerms: fb.control(''),
      transportResponsible: fb.control(''),
      documentCreationAlert: fb.control(''),
      documentCreationNote: fb.control(''),
      commercialNotes: fb.control(''),
      alsoSupplier: fb.control(false),
    },
    { validators: [customerIdentityValidator] },
  );
}

export type CustomerFormGroup = ReturnType<typeof createCustomerFormGroup>;

export function mapCustomerFormToInput(raw: CustomerFormGroup['value']): CustomerInput {
  return {
    firstName: trimOptional(raw.firstName) ?? '',
    lastName: trimOptional(raw.lastName) ?? '',
    companyName: trimOptional(raw.companyName),
    vatNumber: trimOptional(raw.vatNumber),
    taxCode: trimOptional(raw.taxCode),
    email: trimOptional(raw.email),
    pec: trimOptional(raw.pec),
    phone: trimOptional(raw.phone),
    website: trimOptional(raw.website),
    contactName: trimOptional(raw.contactName),
    notes: trimOptional(raw.notes),
    addressLine1: trimOptional(raw.addressLine1),
    addressLine2: trimOptional(raw.addressLine2),
    city: trimOptional(raw.city),
    province: trimOptional(raw.province),
    postalCode: trimOptional(raw.postalCode),
    countryCode: trimOptional(raw.countryCode),
    code: trimOptional(raw.code),
    customerDiscount: trimOptional(raw.customerDiscount),
    paymentMethod: trimOptional(raw.paymentMethod),
    paymentTerms: trimOptional(raw.paymentTerms),
    transportResponsible: trimOptional(raw.transportResponsible),
    documentCreationAlert: trimOptional(raw.documentCreationAlert),
    documentCreationNote: trimOptional(raw.documentCreationNote),
    commercialNotes: trimOptional(raw.commercialNotes),
    alsoSupplier: raw.alsoSupplier ?? false,
  };
}

export function patchCustomerFormGroup(form: CustomerFormGroup, customer: Customer): void {
  form.patchValue({
    firstName: customer.firstName,
    lastName: customer.lastName,
    companyName: customer.companyName ?? '',
    vatNumber: customer.vatNumber ?? '',
    taxCode: customer.taxCode ?? '',
    email: customer.email ?? '',
    pec: customer.pec ?? '',
    phone: customer.phone ?? '',
    website: customer.website ?? '',
    contactName: customer.contactName ?? '',
    addressLine1: customer.address?.line1 ?? '',
    addressLine2: customer.address?.line2 ?? '',
    city: customer.address?.city ?? '',
    province: customer.address?.province ?? '',
    postalCode: customer.address?.postalCode ?? '',
    countryCode: customer.address?.country ?? 'IT',
    notes: customer.notes ?? '',
    code: customer.code ?? '',
    customerDiscount: customer.customerDiscount ?? '',
    paymentMethod: customer.paymentMethod ?? '',
    paymentTerms: customer.paymentTerms ?? '',
    transportResponsible: customer.transportResponsible ?? '',
    documentCreationAlert: customer.documentCreationAlert ?? '',
    documentCreationNote: customer.documentCreationNote ?? '',
    commercialNotes: customer.commercialNotes ?? '',
    // La spunta riflette lo STATO ATTIVO del ruolo fornitore del soggetto.
    alsoSupplier: Boolean(customer.linkedSupplierId && customer.linkedSupplierActive),
  });
}

export function setCustomerAnagraficaReadOnly(form: CustomerFormGroup, readOnly: boolean): void {
  // Campi owned da Shopify per i clienti sincronizzati; i dati fiscali
  // (ragione sociale, P.IVA, CF, PEC) restano modificabili nel gestionale.
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
