import { DocumentStatus, DocumentType } from '@core/models/document.model';
import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';
import { TableViewId } from '@shared/table-columns/table-column.model';

import type { DocumentListProfile } from './document-list-query.model';

/**
 * Profili lista dedicati con pagina propria (voci sidebar Vendite più lo
 * Scarico manuale di Magazzino e le Registrazioni fattura di Acquisti, che
 * riusano la stessa impostazione a pagina dedicata).
 */
export type SalesDocumentRegisterProfile =
  | 'quote'
  | 'proforma'
  | 'sales-ddt'
  | 'manual-unload'
  | 'invoice-draft'
  | 'purchase-invoice';

/**
 * Configurazione delle pagine dedicate ai documenti di vendita: elenco con
 * titolo, bottone «Nuovo», stato vuoto e filtri propri (mai il filtro «Tipo»)
 * più anteprima dettaglio con il layout dell'Ordine cliente.
 */
export interface SalesDocumentRegisterConfig {
  readonly profile: SalesDocumentRegisterProfile;
  readonly type: DocumentType;
  readonly pageTitle: string;
  readonly pageSubtitle: string;
  /** Etichetta bottone/CTA di creazione (es. «Nuovo preventivo»). */
  readonly createLabel: string;
  readonly createPath: string;
  /** Pagina elenco dedicata (base anche dei dettagli `listPath/:id`). */
  readonly listPath: string;
  readonly emptyTitle: string;
  readonly emptyDescription: string;
  readonly emptyIcon: string;
  readonly searchPlaceholder: string;
  /** Opzioni filtro «Stato»; null = nessun filtro stato (Preventivi). */
  readonly statusOptions: readonly SelectMenuOption[] | null;
  /** Checkbox «DDT da fatturare» (solo DDT vendita). */
  readonly showPendingInvoiceFilter: boolean;
  /** Nasconde il filtro Cliente (pagine lato acquisti). */
  readonly hideCustomerFilter?: boolean;
  /** Filtro Fornitore (Registrazioni fattura). */
  readonly showSupplierFilter?: boolean;
  /** Filtro Stato saldo Da saldare/Saldati (Registrazioni fattura). */
  readonly showSettlementFilter?: boolean;
  readonly viewId: TableViewId;
  /** Titolo del pannello dati nell'anteprima dettaglio (es. «Dati preventivo»). */
  readonly detailPanelTitle: string;
  readonly detailNotFoundTitle: string;
}

/** Stati generici del ciclo documento, etichette registro. */
const GENERIC_STATUS_OPTIONS: readonly SelectMenuOption[] = [
  { value: DocumentStatus.Draft, label: 'Bozza' },
  { value: DocumentStatus.Confirmed, label: 'Confermato' },
  { value: DocumentStatus.Printed, label: 'Stampato' },
  { value: DocumentStatus.Sent, label: 'Inviato' },
  { value: DocumentStatus.ExternallyRegistered, label: 'Registrato esternamente' },
  { value: DocumentStatus.Cancelled, label: 'Annullato' },
];

/** Bozze fattura: etichette del ciclo fiscale (B6), non quelle generiche. */
const INVOICE_DRAFT_STATUS_OPTIONS: readonly SelectMenuOption[] = [
  { value: DocumentStatus.Draft, label: 'Bozza' },
  { value: DocumentStatus.Confirmed, label: 'Da emettere' },
  { value: DocumentStatus.Sent, label: 'Inviata al commercialista' },
  { value: DocumentStatus.ExternallyRegistered, label: 'Registrata esternamente' },
  { value: DocumentStatus.Cancelled, label: 'Annullata' },
];

const CONFIGS: Record<SalesDocumentRegisterProfile, SalesDocumentRegisterConfig> = {
  quote: {
    profile: 'quote',
    type: DocumentType.Quote,
    pageTitle: 'Preventivi',
    pageSubtitle: 'Preventivi cliente con numerazione PRE dedicata, senza effetti sul magazzino.',
    createLabel: 'Nuovo preventivo',
    createPath: '/app/documents/quote/new',
    listPath: '/app/documents/quote',
    emptyTitle: 'Nessun preventivo',
    emptyDescription:
      'Non ci sono preventivi che corrispondono ai filtri. Crea un nuovo preventivo per proporre articoli e condizioni a un cliente.',
    emptyIcon: 'pi-file',
    searchPlaceholder: 'Cerca per numero o cliente…',
    statusOptions: null,
    showPendingInvoiceFilter: false,
    viewId: TableViewId.QuoteDocumentsList,
    detailPanelTitle: 'Dati preventivo',
    detailNotFoundTitle: 'Preventivo non trovato',
  },
  proforma: {
    profile: 'proforma',
    type: DocumentType.Proforma,
    pageTitle: 'Proforma',
    pageSubtitle: 'Proforma cliente, convertibili in bozza fattura o DDT vendita.',
    createLabel: 'Nuova proforma',
    createPath: '/app/documents/proforma/new',
    listPath: '/app/documents/proforma',
    emptyTitle: 'Nessuna proforma',
    emptyDescription:
      'Non ci sono proforma che corrispondono ai filtri. Crea una nuova proforma per anticipare al cliente i dati della fattura.',
    emptyIcon: 'pi-file-edit',
    searchPlaceholder: 'Cerca per numero o cliente…',
    statusOptions: GENERIC_STATUS_OPTIONS,
    showPendingInvoiceFilter: false,
    viewId: TableViewId.ProformaDocumentsList,
    detailPanelTitle: 'Dati proforma',
    detailNotFoundTitle: 'Proforma non trovata',
  },
  'sales-ddt': {
    profile: 'sales-ddt',
    type: DocumentType.SalesDdt,
    pageTitle: 'DDT vendita',
    pageSubtitle: 'Documenti di trasporto verso clienti, con scarico magazzino alla conferma.',
    createLabel: 'Nuovo DDT vendita',
    createPath: '/app/documents/sales-ddt/new',
    listPath: '/app/documents/sales-ddt',
    emptyTitle: 'Nessun DDT vendita',
    emptyDescription:
      'Non ci sono DDT vendita che corrispondono ai filtri. Crea un nuovo DDT per accompagnare la merce verso il cliente.',
    emptyIcon: 'pi-truck',
    searchPlaceholder: 'Cerca per numero o cliente…',
    statusOptions: GENERIC_STATUS_OPTIONS,
    showPendingInvoiceFilter: true,
    viewId: TableViewId.SalesDdtDocumentsList,
    detailPanelTitle: 'Dati DDT',
    detailNotFoundTitle: 'DDT vendita non trovato',
  },
  'manual-unload': {
    profile: 'manual-unload',
    type: DocumentType.ManualUnload,
    pageTitle: 'Scarichi manuali',
    pageSubtitle:
      'Scarichi operativi non legati a vendita: la giacenza viene sottratta al salvataggio, senza movimenti; eliminando il documento le giacenze NON vengono ripristinate.',
    createLabel: 'Nuovo scarico manuale',
    createPath: '/app/documents/manual-unload/new',
    listPath: '/app/documents/manual-unload',
    emptyTitle: 'Nessuno scarico manuale',
    emptyDescription:
      'Non ci sono scarichi manuali che corrispondono ai filtri. Crea un nuovo scarico per registrare uscite di merce non legate a vendita (campionario, omaggi, merce deteriorata).',
    emptyIcon: 'pi-minus-circle',
    searchPlaceholder: 'Cerca per numero o cliente…',
    // Salvataggio = conferma immediata: nessun ciclo stati da filtrare.
    statusOptions: null,
    showPendingInvoiceFilter: false,
    viewId: TableViewId.ManualUnloadDocumentsList,
    detailPanelTitle: 'Dati scarico manuale',
    detailNotFoundTitle: 'Scarico manuale non trovato',
  },
  'purchase-invoice': {
    profile: 'purchase-invoice',
    type: DocumentType.SupplierInvoice,
    pageTitle: 'Registrazioni fattura',
    pageSubtitle:
      'Fatture fornitore registrate: collegano gli arrivi merce alla fattura ricevuta e tracciano le scadenze di pagamento. Mai effetti sul magazzino.',
    createLabel: 'Nuova registrazione fattura',
    createPath: '/app/documents/registrazione-fattura/new',
    listPath: '/app/documents/registrazione-fattura',
    emptyTitle: 'Nessuna registrazione fattura',
    emptyDescription:
      'Non ci sono registrazioni che corrispondono ai filtri. Registra una fattura fornitore per collegare gli arrivi merce e gestire le scadenze di pagamento.',
    emptyIcon: 'pi-book',
    searchPlaceholder: 'Cerca per numero fattura, fornitore o commento…',
    // Lo stato del saldo (Da saldare/Saldati) sostituisce il ciclo documento.
    statusOptions: null,
    showPendingInvoiceFilter: false,
    hideCustomerFilter: true,
    showSupplierFilter: true,
    showSettlementFilter: true,
    viewId: TableViewId.PurchaseInvoiceDocumentsList,
    detailPanelTitle: 'Dati registrazione',
    detailNotFoundTitle: 'Registrazione fattura non trovata',
  },
  'invoice-draft': {
    profile: 'invoice-draft',
    type: DocumentType.InvoiceDraft,
    pageTitle: 'Bozze fattura',
    pageSubtitle: 'Bozze fattura da emettere e inviare al commercialista.',
    createLabel: 'Nuova bozza fattura',
    createPath: '/app/documents/invoice-draft/new',
    listPath: '/app/documents/invoice-draft',
    emptyTitle: 'Nessuna bozza fattura',
    emptyDescription:
      'Non ci sono bozze fattura che corrispondono ai filtri. Crea una nuova bozza per preparare i dati della fattura da emettere.',
    emptyIcon: 'pi-receipt',
    searchPlaceholder: 'Cerca per numero o cliente…',
    statusOptions: INVOICE_DRAFT_STATUS_OPTIONS,
    showPendingInvoiceFilter: false,
    viewId: TableViewId.InvoiceDraftDocumentsList,
    detailPanelTitle: 'Dati bozza fattura',
    detailNotFoundTitle: 'Bozza fattura non trovata',
  },
};

export const SALES_DOCUMENT_REGISTER_PROFILES: readonly SalesDocumentRegisterProfile[] = [
  'quote',
  'proforma',
  'sales-ddt',
  'manual-unload',
  'invoice-draft',
  'purchase-invoice',
] as const;

function isSalesDocumentRegisterProfile(
  profile: DocumentListProfile,
): profile is SalesDocumentRegisterProfile {
  return (SALES_DOCUMENT_REGISTER_PROFILES as readonly string[]).includes(profile);
}

/** Config della pagina dedicata, null per i profili registro/arrivi merce. */
export function salesDocumentRegisterConfig(
  profile: DocumentListProfile,
): SalesDocumentRegisterConfig | null {
  return isSalesDocumentRegisterProfile(profile) ? CONFIGS[profile] : null;
}
