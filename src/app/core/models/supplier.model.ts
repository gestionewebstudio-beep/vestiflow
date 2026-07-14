import type { EntityId, IsoDateString, TenantScoped, Timestamped } from './common.model';

/** Allegato anagrafica fornitore (PDF/XML — C5). */
export interface SupplierAttachment {
  readonly id: EntityId;
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly createdByName: string;
  readonly createdAt: IsoDateString;
}

/** Anagrafica fornitore completa (owner: gestionale). */
export interface Supplier extends TenantScoped, Timestamped {
  readonly id: EntityId;
  readonly code?: string | null;
  readonly name: string;
  readonly vatNumber?: string | null;
  readonly taxCode?: string | null;
  readonly email?: string | null;
  readonly pec?: string | null;
  readonly phone?: string | null;
  readonly contactName?: string | null;
  readonly website?: string | null;
  readonly addressLine1?: string | null;
  readonly addressLine2?: string | null;
  readonly city?: string | null;
  readonly province?: string | null;
  readonly postalCode?: string | null;
  readonly countryCode?: string | null;
  readonly paymentTerms?: string | null;
  readonly supplierDiscount?: string | null;
  readonly defaultVatCodeId?: string | null;
  readonly transportResponsible?: string | null;
  readonly freightTerms?: string | null;
  readonly documentCreationNote?: string | null;
  readonly notes?: string | null;
  readonly linkedCustomerId?: string | null;
}

/** Payload creazione/aggiornamento fornitore. */
export interface SupplierInput {
  readonly code?: string;
  readonly name: string;
  readonly vatNumber?: string;
  readonly taxCode?: string;
  readonly email?: string;
  readonly pec?: string;
  readonly phone?: string;
  readonly contactName?: string;
  readonly website?: string;
  readonly addressLine1?: string;
  readonly addressLine2?: string;
  readonly city?: string;
  readonly province?: string;
  readonly postalCode?: string;
  readonly countryCode?: string;
  readonly paymentTerms?: string;
  readonly supplierDiscount?: string;
  readonly defaultVatCodeId?: string | null;
  readonly transportResponsible?: string;
  readonly freightTerms?: string;
  readonly documentCreationNote?: string;
  readonly notes?: string;
  readonly alsoCustomer?: boolean;
}

/** Collegamento variante ↔ fornitore. */
export interface SupplierVariantLink {
  readonly id: EntityId;
  readonly tenantId: EntityId;
  readonly supplierId: EntityId;
  readonly variantId: EntityId;
  readonly supplierSku?: string | null;
  readonly isPreferred: boolean;
  readonly lastPurchasePriceMinor?: number | null;
  readonly minOrderQuantity?: number | null;
  readonly currency: string;
  readonly supplier: {
    readonly id: EntityId;
    readonly name: string;
    readonly code?: string | null;
  };
  readonly variant: {
    readonly id: EntityId;
    readonly sku: string;
    readonly product: { readonly id: EntityId; readonly name: string };
  };
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface UpsertSupplierVariantLinkInput {
  readonly supplierId: EntityId;
  readonly variantId: EntityId;
  readonly supplierSku?: string;
  readonly isPreferred?: boolean;
  readonly lastPurchasePriceMinor?: number;
  readonly minOrderQuantity?: number;
  readonly currency?: string;
}
