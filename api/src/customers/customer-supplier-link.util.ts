import type { Customer, Supplier } from '@prisma/client';

/** Nome fornitore derivato dall'anagrafica cliente. */
export function supplierNameFromCustomer(customer: Pick<Customer, 'companyName' | 'firstName' | 'lastName'>): string {
  const company = customer.companyName?.trim();
  if (company) {
    return company;
  }
  return `${customer.firstName} ${customer.lastName}`.trim();
}

/** Nome cliente derivato dall'anagrafica fornitore. */
export function customerNamesFromSupplier(supplier: Pick<Supplier, 'name' | 'contactName'>): {
  readonly firstName: string;
  readonly lastName: string;
} {
  const contact = supplier.contactName?.trim();
  if (contact) {
    const parts = contact.split(/\s+/);
    if (parts.length >= 2) {
      return { firstName: parts[0] ?? 'Referente', lastName: parts.slice(1).join(' ') };
    }
    return { firstName: contact, lastName: '—' };
  }
  const parts = supplier.name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return { firstName: parts[0] ?? 'Cliente', lastName: parts.slice(1).join(' ') };
  }
  return { firstName: supplier.name.trim() || 'Cliente', lastName: '—' };
}
