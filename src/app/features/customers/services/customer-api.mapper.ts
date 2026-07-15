import type { Address, EntityId, IsoDateString } from '@core/models/common.model';
import type { Customer, CustomerSource } from '@core/models/customer.model';

/**
 * Riga API NestJS: vista appiattita del ruolo cliente + soggetto canonico
 * (Party). I dati comuni sono condivisi con l'eventuale ruolo fornitore.
 */
export interface CustomerApiRow {
  readonly id: EntityId;
  readonly tenantId: EntityId;
  readonly partyId?: EntityId;
  readonly code?: string | null;
  readonly isActive?: boolean;
  readonly firstName: string;
  readonly lastName: string;
  readonly email?: string | null;
  readonly phone?: string | null;
  readonly notes?: string | null;
  readonly addressLine1?: string | null;
  readonly addressLine2?: string | null;
  readonly city?: string | null;
  readonly province?: string | null;
  readonly postalCode?: string | null;
  readonly countryCode?: string | null;
  readonly companyName?: string | null;
  readonly vatNumber?: string | null;
  readonly taxCode?: string | null;
  readonly pec?: string | null;
  readonly website?: string | null;
  readonly contactName?: string | null;
  readonly customerDiscount?: string | null;
  readonly paymentMethod?: string | null;
  readonly paymentTerms?: string | null;
  readonly transportResponsible?: string | null;
  readonly documentCreationAlert?: string | null;
  readonly documentCreationNote?: string | null;
  readonly commercialNotes?: string | null;
  readonly shopifyCustomerId?: string | null;
  readonly linkedSupplierId?: string | null;
  readonly linkedSupplierActive?: boolean;
  readonly createdAt: IsoDateString;
  readonly updatedAt: IsoDateString;
}

function mapAddress(row: CustomerApiRow): Address | undefined {
  if (!row.addressLine1 && !row.city && !row.postalCode) {
    return undefined;
  }
  return {
    line1: row.addressLine1 ?? '',
    line2: row.addressLine2 ?? undefined,
    city: row.city ?? '',
    province: row.province ?? undefined,
    postalCode: row.postalCode ?? '',
    country: row.countryCode ?? 'IT',
  };
}

function mapSource(row: CustomerApiRow): CustomerSource {
  return row.shopifyCustomerId ? 'shopify' : 'manual';
}

export function mapCustomerApiRow(row: CustomerApiRow): Customer {
  return {
    tenantId: row.tenantId,
    id: row.id,
    partyId: row.partyId,
    code: row.code ?? undefined,
    isActive: row.isActive ?? true,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email ?? undefined,
    phone: row.phone ?? undefined,
    notes: row.notes ?? undefined,
    address: mapAddress(row),
    companyName: row.companyName ?? undefined,
    vatNumber: row.vatNumber ?? undefined,
    taxCode: row.taxCode ?? undefined,
    pec: row.pec ?? undefined,
    website: row.website ?? undefined,
    contactName: row.contactName ?? undefined,
    customerDiscount: row.customerDiscount ?? undefined,
    paymentMethod: row.paymentMethod ?? undefined,
    paymentTerms: row.paymentTerms ?? undefined,
    transportResponsible: row.transportResponsible ?? undefined,
    documentCreationAlert: row.documentCreationAlert ?? undefined,
    documentCreationNote: row.documentCreationNote ?? undefined,
    commercialNotes: row.commercialNotes ?? undefined,
    shopifyCustomerId: row.shopifyCustomerId ?? undefined,
    linkedSupplierId: row.linkedSupplierId ?? undefined,
    linkedSupplierActive: row.linkedSupplierActive ?? false,
    source: mapSource(row),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
