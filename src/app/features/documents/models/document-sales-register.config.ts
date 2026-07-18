import { DocumentStatus, DocumentType } from '@core/models/document.model';
import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';
import { TableViewId } from '@shared/table-columns/table-column.model';

import type { DocumentListProfile } from './document-list-query.model';

/** Profili lista dedicati ai documenti di vendita (voci sidebar Vendite). */
export type SalesDocumentRegisterProfile = 'quote' | 'proforma' | 'sales-ddt' | 'invoice-draft';

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
  'invoice-draft',
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
