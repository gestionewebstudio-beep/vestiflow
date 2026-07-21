import { Prisma, type Customer, type Party, type Supplier } from '@prisma/client';

import { partyDisplayName } from './party.util';

/**
 * Viste API dei ruoli cliente/fornitore: il contratto HTTP resta "piatto"
 * (come quando i dati comuni vivevano sulle tabelle di ruolo), ma la fonte
 * dei dati anagrafici è il soggetto canonico (Party). Le viste espongono
 * anche lo stato del ruolo gemello per la spunta "È anche cliente/fornitore".
 */

export const CUSTOMER_PARTY_INCLUDE = {
  party: { include: { supplierRole: { select: { id: true, isActive: true } } } },
} satisfies Prisma.CustomerInclude;

export const SUPPLIER_PARTY_INCLUDE = {
  party: { include: { customerRole: { select: { id: true, isActive: true } } } },
} satisfies Prisma.SupplierInclude;

export type CustomerWithParty = Prisma.CustomerGetPayload<{
  include: typeof CUSTOMER_PARTY_INCLUDE;
}>;

export type SupplierWithParty = Prisma.SupplierGetPayload<{
  include: typeof SUPPLIER_PARTY_INCLUDE;
}>;

type PartyCommonView = Pick<
  Party,
  | 'companyName'
  | 'vatNumber'
  | 'taxCode'
  | 'email'
  | 'pec'
  | 'sdiCode'
  | 'phone'
  | 'website'
  | 'contactName'
  | 'addressLine1'
  | 'addressLine2'
  | 'city'
  | 'province'
  | 'postalCode'
  | 'countryCode'
  | 'notes'
>;

export type CustomerView = PartyCommonView &
  Pick<
    Customer,
    | 'id'
    | 'tenantId'
    | 'partyId'
    | 'code'
    | 'isActive'
    | 'customerDiscount'
    | 'paymentMethod'
    | 'paymentTerms'
    | 'transportResponsible'
    | 'documentCreationAlert'
    | 'documentCreationNote'
    | 'commercialNotes'
    | 'shopifyCustomerId'
    | 'createdAt'
    | 'updatedAt'
  > & {
    /** Compatibilità storica: mai null, '' per soggetti solo-azienda. */
    readonly firstName: string;
    readonly lastName: string;
    /** Ruolo fornitore dello stesso soggetto, se esiste (anche se disattivato). */
    readonly linkedSupplierId: string | null;
    /** true se il ruolo fornitore è attivo (stato della spunta "È anche fornitore"). */
    readonly linkedSupplierActive: boolean;
  };

export type SupplierView = PartyCommonView &
  Pick<
    Supplier,
    | 'id'
    | 'tenantId'
    | 'partyId'
    | 'code'
    | 'isActive'
    | 'paymentMethod'
    | 'paymentTerms'
    | 'supplierDiscount'
    | 'defaultVatCodeId'
    | 'transportResponsible'
    | 'freightTerms'
    | 'documentCreationAlert'
    | 'documentCreationNote'
    | 'createdAt'
    | 'updatedAt'
  > & {
    /** Nome commerciale: ragione sociale del soggetto o nome e cognome. */
    readonly name: string;
    readonly firstName: string | null;
    readonly lastName: string | null;
    /** Ruolo cliente dello stesso soggetto, se esiste (anche se disattivato). */
    readonly linkedCustomerId: string | null;
    /** true se il ruolo cliente è attivo (stato della spunta "È anche cliente"). */
    readonly linkedCustomerActive: boolean;
  };

function partyCommonView(party: Party): PartyCommonView {
  return {
    companyName: party.companyName,
    vatNumber: party.vatNumber,
    taxCode: party.taxCode,
    email: party.email,
    pec: party.pec,
    sdiCode: party.sdiCode,
    phone: party.phone,
    website: party.website,
    contactName: party.contactName,
    addressLine1: party.addressLine1,
    addressLine2: party.addressLine2,
    city: party.city,
    province: party.province,
    postalCode: party.postalCode,
    countryCode: party.countryCode,
    notes: party.notes,
  };
}

export function toCustomerView(row: CustomerWithParty): CustomerView {
  return {
    ...partyCommonView(row.party),
    id: row.id,
    tenantId: row.tenantId,
    partyId: row.partyId,
    code: row.code,
    isActive: row.isActive,
    firstName: row.party.firstName ?? '',
    lastName: row.party.lastName ?? '',
    customerDiscount: row.customerDiscount,
    paymentMethod: row.paymentMethod,
    paymentTerms: row.paymentTerms,
    transportResponsible: row.transportResponsible,
    documentCreationAlert: row.documentCreationAlert,
    documentCreationNote: row.documentCreationNote,
    commercialNotes: row.commercialNotes,
    shopifyCustomerId: row.shopifyCustomerId,
    linkedSupplierId: row.party.supplierRole?.id ?? null,
    linkedSupplierActive: row.party.supplierRole?.isActive ?? false,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toSupplierView(row: SupplierWithParty): SupplierView {
  return {
    ...partyCommonView(row.party),
    id: row.id,
    tenantId: row.tenantId,
    partyId: row.partyId,
    code: row.code,
    isActive: row.isActive,
    name: partyDisplayName(row.party),
    firstName: row.party.firstName,
    lastName: row.party.lastName,
    paymentMethod: row.paymentMethod,
    paymentTerms: row.paymentTerms,
    supplierDiscount: row.supplierDiscount,
    defaultVatCodeId: row.defaultVatCodeId,
    transportResponsible: row.transportResponsible,
    freightTerms: row.freightTerms,
    documentCreationAlert: row.documentCreationAlert,
    documentCreationNote: row.documentCreationNote,
    linkedCustomerId: row.party.customerRole?.id ?? null,
    linkedCustomerActive: row.party.customerRole?.isActive ?? false,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
