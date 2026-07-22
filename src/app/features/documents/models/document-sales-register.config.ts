import { DocumentStatus, DocumentType } from '@core/models/document.model';
import { STORE_SALE_PAYMENT_METHOD_OPTIONS } from '@features/store-sales/models/store-sale-payment.util';
import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';
import { TableViewId } from '@shared/table-columns/table-column.model';

import type { DocumentListProfile } from './document-list-query.model';
import { SALES_INVOICE_DOCUMENT_TYPES } from './document-sales.util';
import {
  QUOTE_LIST_EXPORT,
  type DocumentListExportConfig,
} from '../utils/document-list-export.util';

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
  | 'invoice'
  | 'purchase-invoice'
  | 'store-sale';

/**
 * Configurazione delle pagine dedicate ai documenti di vendita: elenco con
 * titolo, bottone «Nuovo», stato vuoto e filtri propri (mai il filtro «Tipo»)
 * più anteprima dettaglio con il layout dell'Ordine cliente.
 */
/** Voce «Nuovo …» di una pagina elenco condivisa da più tipi documento. */
export interface SalesDocumentCreateVariant {
  readonly type: DocumentType;
  readonly label: string;
  readonly path: string;
}

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
  /**
   * Tipi mostrati nell'elenco. Quasi tutte le pagine dedicate ne hanno uno solo
   * (= `type`) e nascondono il filtro «Tipo». Le Fatture fanno eccezione:
   * Fattura e Fattura accompagnatoria condividono un unico elenco, quindi qui
   * ci sono entrambi i tipi e la lista mostra colonna e filtro «Tipo».
   */
  readonly types?: readonly DocumentType[];
  /**
   * Opzioni del filtro «Tipo» (con la voce «Tutti»). Obbligatorie quando
   * `types` è valorizzato: senza, l'elenco condiviso non saprebbe come
   * etichettare i tipi che mostra.
   */
  readonly typeFilterOptions?: readonly SelectMenuOption[];
  /**
   * Varianti creabili dalla pagina, una per tipo. Presenti solo quando
   * l'elenco è condiviso: il bottone «Nuovo …» segue il filtro «Tipo» attivo.
   */
  readonly createVariants?: readonly SalesDocumentCreateVariant[];
  /**
   * Nasconde il bottone di creazione: la pagina è di sola consultazione perché
   * i documenti nascono altrove (Vendita/Reso in negozio → cassa).
   */
  readonly hideCreateAction?: boolean;
  /** Nasconde il filtro Cliente (pagine lato acquisti). */
  readonly hideCustomerFilter?: boolean;
  /** Filtro Fornitore (Registrazioni fattura). */
  readonly showSupplierFilter?: boolean;
  /** Filtro Stato saldo Da saldare/Saldati (Registrazioni fattura). */
  readonly showSettlementFilter?: boolean;
  /**
   * Opzioni del filtro «Metodo pagamento»; assenti = filtro nascosto. Sono
   * per profilo perché il vocabolario cambia: codici cassa vs voci MP01–MP23.
   */
  readonly paymentMethodOptions?: readonly SelectMenuOption[];
  /** Filtro «Operatore» (opzioni caricate dai documenti dei tipi mostrati). */
  readonly showOperatorFilter?: boolean;
  readonly viewId: TableViewId;
  /** Titolo del pannello dati nell'anteprima dettaglio (es. «Dati preventivo»). */
  readonly detailPanelTitle: string;
  readonly detailNotFoundTitle: string;
  /**
   * Elenco "in stile Arrivi merce": selezione con checkbox + barra operazioni
   * massive (stampa/CSV/PDF/elimina). I profili senza questo flag restano a
   * sola consultazione con le azioni di riga.
   */
  readonly supportsBulkSelection?: boolean;
  /** Configurazione export massivo (nome file e colonne del CSV/stampa). */
  readonly listExport?: DocumentListExportConfig;
  /**
   * Controparte scelta nel modale «Duplica»: 'customer' apre la scelta cliente
   * (documenti di vendita), 'supplier' la scelta fornitore. Assente = duplica
   * diretta senza modale.
   */
  readonly duplicateSubject?: 'customer' | 'supplier';
  /**
   * La riga apre il documento nel FORM in sola lettura (banner «Sblocca
   * modifica»), come gli Arrivi merce, invece dell'anteprima dettaglio.
   */
  readonly rowOpensForm?: boolean;
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

/** Fatture: etichette del ciclo fiscale (B6), non quelle generiche. */
const INVOICE_STATUS_OPTIONS: readonly SelectMenuOption[] = [
  { value: DocumentStatus.Draft, label: 'Bozza' },
  { value: DocumentStatus.Confirmed, label: 'Da emettere' },
  { value: DocumentStatus.Sent, label: 'Inviata al commercialista' },
  { value: DocumentStatus.ExternallyRegistered, label: 'Registrata esternamente' },
  { value: DocumentStatus.Cancelled, label: 'Annullata' },
];

/** Opzioni del filtro «Tipo» dell'elenco fatture (con la voce «Tutti»). */
export const INVOICE_TYPE_FILTER_OPTIONS: readonly SelectMenuOption[] = [
  { value: '', label: 'Tutti' },
  { value: DocumentType.InvoiceDraft, label: 'Fattura' },
  { value: DocumentType.InvoiceAccompanying, label: 'Fattura accompagnatoria' },
];

/** Opzioni del filtro «Tipo» dell'elenco Vendita/Reso in negozio. */
export const STORE_SALE_TYPE_FILTER_OPTIONS: readonly SelectMenuOption[] = [
  { value: '', label: 'Tutti' },
  { value: DocumentType.StoreSale, label: 'Vendita' },
  { value: DocumentType.StoreReturn, label: 'Reso' },
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
    // Elenco allineato agli Arrivi merce: selezione multipla, barra bulk,
    // duplica con scelta cliente e apertura nel form bloccato.
    supportsBulkSelection: true,
    listExport: QUOTE_LIST_EXPORT,
    duplicateSubject: 'customer',
    rowOpensForm: true,
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
    pageTitle: 'Scarico manuale giacenze',
    pageSubtitle: 'Attenzione! Scarico diretto delle giacenze.',
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
  // Elenco condiviso da Fattura e Fattura accompagnatoria: un solo numeratore,
  // una sola pagina, filtro «Tipo» preimpostato dalla voce hub di provenienza.
  invoice: {
    profile: 'invoice',
    type: DocumentType.InvoiceDraft,
    types: SALES_INVOICE_DOCUMENT_TYPES,
    typeFilterOptions: INVOICE_TYPE_FILTER_OPTIONS,
    pageTitle: 'Fatture',
    pageSubtitle:
      'Fatture fiscali da inviare al commercialista, con o senza trasporto merce incluso.',
    createLabel: 'Nuova fattura',
    createPath: '/app/documents/fattura/new',
    createVariants: [
      {
        type: DocumentType.InvoiceDraft,
        label: 'Nuova fattura',
        path: '/app/documents/fattura/new',
      },
      {
        type: DocumentType.InvoiceAccompanying,
        label: 'Nuova fattura accompagnatoria',
        path: '/app/documents/fattura-accompagnatoria/new',
      },
    ],
    listPath: '/app/documents/fattura',
    emptyTitle: 'Nessuna fattura',
    emptyDescription:
      'Non ci sono fatture che corrispondono ai filtri. Crea una nuova fattura per preparare i dati da trasmettere al commercialista.',
    emptyIcon: 'pi-receipt',
    searchPlaceholder: 'Cerca per numero o cliente…',
    statusOptions: INVOICE_STATUS_OPTIONS,
    showPendingInvoiceFilter: false,
    viewId: TableViewId.InvoiceDraftDocumentsList,
    detailPanelTitle: 'Dati fattura',
    detailNotFoundTitle: 'Fattura non trovata',
  },
  // Elenco condiviso da Vendita e Reso in negozio: entrambi nascono dalla
  // cassa in un'unica transazione con i movimenti, quindi la pagina è di sola
  // consultazione — nessun «Nuovo …», nessuna azione di riga distruttiva.
  'store-sale': {
    profile: 'store-sale',
    type: DocumentType.StoreSale,
    types: [DocumentType.StoreSale, DocumentType.StoreReturn],
    typeFilterOptions: STORE_SALE_TYPE_FILTER_OPTIONS,
    pageTitle: 'Vendita/Reso in negozio',
    pageSubtitle:
      'Vendite e resi registrati dalla cassa negozio, con i movimenti di magazzino già applicati.',
    createLabel: 'Nuova vendita in negozio',
    createPath: '/app/sales/register',
    hideCreateAction: true,
    listPath: '/app/documents/vendite-negozio',
    emptyTitle: 'Nessuna vendita o reso in negozio',
    emptyDescription:
      'Non ci sono vendite o resi che corrispondono ai filtri. Vendite e resi si registrano dalla cassa negozio.',
    emptyIcon: 'pi-shopping-bag',
    searchPlaceholder: 'Cerca per numero o cliente…',
    // Nascono già confermati alla conclusione della vendita: nessun ciclo stati.
    statusOptions: null,
    showPendingInvoiceFilter: false,
    paymentMethodOptions: STORE_SALE_PAYMENT_METHOD_OPTIONS,
    showOperatorFilter: true,
    viewId: TableViewId.StoreSaleDocumentsList,
    detailPanelTitle: 'Dati documento',
    detailNotFoundTitle: 'Documento non trovato',
  },
};

export const SALES_DOCUMENT_REGISTER_PROFILES: readonly SalesDocumentRegisterProfile[] = [
  'quote',
  'proforma',
  'sales-ddt',
  'manual-unload',
  'invoice',
  'purchase-invoice',
  'store-sale',
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
