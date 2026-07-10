import type { Address, EntityId, TenantScoped, Timestamped } from './common.model';

/** Origine anagrafica cliente. */
export type CustomerSource = 'shopify' | 'manual';

/** Cliente del tenant (anagrafica gestionale + sync Shopify per ecommerce). */
export interface Customer extends TenantScoped, Timestamped {
  readonly id: EntityId;
  readonly firstName: string;
  readonly lastName: string;
  readonly email?: string;
  readonly phone?: string;
  readonly address?: Address;
  readonly notes?: string;
  readonly companyName?: string;
  readonly vatNumber?: string;
  readonly customerDiscount?: string;
  readonly paymentTerms?: string;
  readonly commercialNotes?: string;
  /** Presente se il cliente è sincronizzato da Shopify. */
  readonly shopifyCustomerId?: string;
  /** Fornitore collegato se il cliente è anche fornitore. */
  readonly linkedSupplierId?: string;
  readonly source: CustomerSource;
}

/** Payload creazione/aggiornamento cliente. */
export interface CustomerInput {
  readonly firstName: string;
  readonly lastName: string;
  readonly email?: string;
  readonly phone?: string;
  readonly notes?: string;
  readonly addressLine1?: string;
  readonly addressLine2?: string;
  readonly city?: string;
  readonly province?: string;
  readonly postalCode?: string;
  readonly countryCode?: string;
  readonly companyName?: string;
  readonly vatNumber?: string;
  readonly customerDiscount?: string;
  readonly paymentTerms?: string;
  readonly commercialNotes?: string;
  readonly alsoSupplier?: boolean;
}

export function customerDisplayName(
  customer: Pick<Customer, 'firstName' | 'lastName' | 'companyName' | 'email'>,
): string {
  const personal = `${customer.firstName} ${customer.lastName}`.trim();
  if (customer.companyName?.trim()) {
    return customer.companyName.trim();
  }
  return personal || customer.email || 'Cliente';
}

export function customerSourceLabel(source: CustomerSource): string {
  return source === 'shopify' ? 'Shopify' : 'Gestionale';
}
