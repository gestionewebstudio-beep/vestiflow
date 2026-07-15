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

/**
 * Fornitore = RUOLO commerciale del soggetto anagrafico canonico (Party).
 * I dati anagrafici/fiscali/di contatto arrivano appiattiti dal soggetto e
 * sono condivisi con l'eventuale ruolo cliente dello stesso soggetto;
 * i dati commerciali (codice, sconto, pagamenti, avvisi) sono del ruolo.
 */
export interface Supplier extends TenantScoped, Timestamped {
  readonly id: EntityId;
  /** Soggetto anagrafico canonico a cui il ruolo appartiene. */
  readonly partyId?: EntityId;
  readonly code?: string | null;
  /** false = ruolo disattivato: escluso dai nuovi utilizzi, storico intatto. */
  readonly isActive: boolean;
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
  /** Modalità di pagamento (voce gestita in Impostazioni → Pagamenti). */
  readonly paymentMethod?: string | null;
  /** Condizioni di pagamento (voce gestita in Impostazioni → Pagamenti). */
  readonly paymentTerms?: string | null;
  readonly supplierDiscount?: string | null;
  readonly defaultVatCodeId?: string | null;
  readonly transportResponsible?: string | null;
  readonly freightTerms?: string | null;
  /** "Mostra avviso": avviso mostrato alla creazione documenti per il fornitore. */
  readonly documentCreationAlert?: string | null;
  /** "Inserisci nota": nota inserita automaticamente nei documenti del fornitore. */
  readonly documentCreationNote?: string | null;
  readonly notes?: string | null;
  /** Ruolo cliente dello stesso soggetto, se esiste (anche disattivato). */
  readonly linkedCustomerId?: string | null;
  /** true se il ruolo cliente è attivo (stato spunta "È anche cliente"). */
  readonly linkedCustomerActive?: boolean;
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
  readonly paymentMethod?: string;
  readonly paymentTerms?: string;
  readonly supplierDiscount?: string;
  readonly defaultVatCodeId?: string | null;
  readonly transportResponsible?: string;
  readonly freightTerms?: string;
  readonly documentCreationAlert?: string;
  readonly documentCreationNote?: string;
  readonly notes?: string;
  /** Aggiunge/riattiva (true) o disattiva (false) il ruolo cliente del soggetto. */
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
