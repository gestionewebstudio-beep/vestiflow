import type { Address, EntityId, TenantScoped, Timestamped } from './common.model';

/** Origine anagrafica cliente. */
export type CustomerSource = 'shopify' | 'manual';

/**
 * Cliente = RUOLO commerciale del soggetto anagrafico canonico (Party).
 * I dati anagrafici/fiscali/di contatto arrivano appiattiti dal soggetto e
 * sono condivisi con l'eventuale ruolo fornitore dello stesso soggetto;
 * i dati commerciali (codice, sconto, pagamenti, avvisi) sono del ruolo.
 */
export interface Customer extends TenantScoped, Timestamped {
  readonly id: EntityId;
  /** Soggetto anagrafico canonico a cui il ruolo appartiene. */
  readonly partyId?: EntityId;
  /** Codice cliente progressivo (univoco per tenant). */
  readonly code?: string;
  /** false = ruolo disattivato: escluso dai nuovi utilizzi, storico intatto. */
  readonly isActive: boolean;
  readonly firstName: string;
  readonly lastName: string;
  readonly email?: string;
  readonly phone?: string;
  readonly address?: Address;
  readonly notes?: string;
  readonly companyName?: string;
  readonly vatNumber?: string;
  readonly taxCode?: string;
  readonly pec?: string;
  /** Codice destinatario SDI: dove il commercialista trasmette la fattura. */
  readonly sdiCode?: string;
  readonly website?: string;
  readonly contactName?: string;
  readonly customerDiscount?: string;
  /** Modalità di pagamento (voce gestita in Impostazioni → Pagamenti). */
  readonly paymentMethod?: string;
  /** Condizioni di pagamento (voce gestita in Impostazioni → Pagamenti). */
  readonly paymentTerms?: string;
  /** Incaricato trasporto (es. "Vettore", "Mittente"). */
  readonly transportResponsible?: string;
  /** "Mostra avviso": avviso mostrato alla creazione documenti per il cliente. */
  readonly documentCreationAlert?: string;
  /** "Inserisci nota": nota inserita automaticamente nei documenti del cliente. */
  readonly documentCreationNote?: string;
  readonly commercialNotes?: string;
  /** Presente se il cliente è sincronizzato da Shopify. */
  readonly shopifyCustomerId?: string;
  /** Ruolo fornitore dello stesso soggetto, se esiste (anche disattivato). */
  readonly linkedSupplierId?: string;
  /** true se il ruolo fornitore è attivo (stato spunta "È anche fornitore"). */
  readonly linkedSupplierActive?: boolean;
  readonly source: CustomerSource;
}

/** Payload creazione/aggiornamento cliente. */
export interface CustomerInput {
  readonly firstName?: string;
  readonly lastName?: string;
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
  readonly taxCode?: string;
  readonly pec?: string;
  /** Codice destinatario SDI: dove il commercialista trasmette la fattura. */
  readonly sdiCode?: string;
  readonly website?: string;
  readonly contactName?: string;
  readonly code?: string;
  readonly customerDiscount?: string;
  readonly paymentMethod?: string;
  readonly paymentTerms?: string;
  readonly transportResponsible?: string;
  readonly documentCreationAlert?: string;
  readonly documentCreationNote?: string;
  readonly commercialNotes?: string;
  /** Aggiunge/riattiva (true) o disattiva (false) il ruolo fornitore del soggetto. */
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
