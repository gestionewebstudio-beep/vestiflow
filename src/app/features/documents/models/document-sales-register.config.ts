import { DocumentStatus, DocumentType } from '@core/models/document.model';
import { STORE_SALE_PAYMENT_METHOD_OPTIONS } from '@domain/store-sales/models/store-sale-payment.util';
import { storeSaleCreatePath } from '@domain/store-sales/models/store-sale-routing.util';
import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';
import { TableViewId } from '@shared/table-columns/table-column.model';

import type { DocumentListProfile } from '@domain/documents/models/document-list-query.model';
import { SALES_INVOICE_DOCUMENT_TYPES } from '@domain/documents/models/document-sales.util';
import {
  QUOTE_LIST_EXPORT,
  type DocumentListExportConfig,
} from '../utils/document-list-export.util';

/**
 * Profili lista dedicati con pagina propria (voci sidebar Vendite più lo
 * Vendita manuale di Magazzino e le Registrazioni fattura di Acquisti, che
 * riusano la stessa impostazione a pagina dedicata).
 */
export type SalesDocumentRegisterProfile =
  | 'quote'
  | 'proforma'
  | 'ddt-vendita'
  | 'vendita-manuale'
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
   * (= `type`) e nascondono il filtro «Tipo». Le Fatture fanno eccezione: i
   * **tre** tipi della famiglia (Fattura, Fattura accompagnatoria, Nota di
   * credito) condividono un unico elenco, quindi qui ci sono tutti e tre e la
   * lista mostra colonna e filtro «Tipo».
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
   * Come si RENDONO le varianti: un menu «Nuovo» a tendina, o pulsanti
   * affiancati. Default `'menu'`.
   *
   * ⚠️ È una differenza di PRESENTAZIONE, non di dominio: le varianti restano
   * le stesse e il comando che eseguono pure. Per questo è un campo tipizzato e
   * non una seconda struttura gemella (`regole-architettura`).
   *
   * Il menu conviene da **tre tipi in su** — le Fatture ne hanno tre, e tre
   * pulsanti larghi occuperebbero la testata. Con **due** i pulsanti sono più
   * veloci e dicono da soli cosa si può creare: è il caso delle Vendite al
   * banco, dove `11` A2 esclude esplicitamente il menu.
   */
  readonly createVariantsLayout?: 'menu' | 'buttons';
  /**
   * Chi può creare da questa pagina, quando NON basta «gestisci documenti».
   *
   * ⛔ Serve alle Vendite al banco: le sue rotte sono protette da
   * `retailSalesRegisterGuard`, quindi un utente con la gestione documenti ma
   * senza `retail.register` vedrebbe i pulsanti e verrebbe rimbalzato in
   * dashboard. Un comando che porta a un rimbalzo è peggio di un comando
   * assente.
   */
  readonly createRequiresRetailRegister?: boolean;
  /**
   * Nasconde il bottone di creazione: la pagina è di sola consultazione perché
   * i documenti nascono altrove (Vendita/Reso al banco → la loro maschera).
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
}

/** Stati generici del ciclo documento, etichette registro. */
const GENERIC_STATUS_OPTIONS: readonly SelectMenuOption[] = [
  { value: DocumentStatus.Draft, label: 'Bozza' },
  { value: DocumentStatus.Confirmed, label: 'Confermato' },
  { value: DocumentStatus.Printed, label: 'Stampato' },
  { value: DocumentStatus.Sent, label: 'Inviato' },
  { value: DocumentStatus.Cancelled, label: 'Annullato' },
];

/** Fatture: etichette del ciclo fiscale (B6), non quelle generiche. */
const INVOICE_STATUS_OPTIONS: readonly SelectMenuOption[] = [
  { value: DocumentStatus.Draft, label: 'Bozza' },
  { value: DocumentStatus.Confirmed, label: 'Da emettere' },
  { value: DocumentStatus.Sent, label: 'Inviata al commercialista' },
  { value: DocumentStatus.Cancelled, label: 'Annullata' },
];

/**
 * Opzioni del filtro «Tipo» dell'elenco fatture (con la voce «Tutti»).
 *
 * Le tre voci sono i tre tipi della famiglia, nell'ordine in cui l'operatore se
 * li aspetta: prima la fattura semplice, poi le due varianti. Vanno tenute
 * allineate a `SALES_INVOICE_DOCUMENT_TYPES`, che decide quali documenti
 * l'elenco carica: una voce di filtro senza il tipo corrispondente in `types`
 * darebbe un elenco sempre vuoto, e il contrario un tipo non filtrabile.
 */
export const INVOICE_TYPE_FILTER_OPTIONS: readonly SelectMenuOption[] = [
  { value: '', label: 'Tutti' },
  { value: DocumentType.Invoice, label: 'Fattura' },
  { value: DocumentType.InvoiceAccompanying, label: 'Fattura accompagnatoria' },
  { value: DocumentType.CreditNote, label: 'Nota di credito' },
];

/** Opzioni del filtro «Tipo» dell'elenco Vendita/Reso al banco. */
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
    // Elenco allineato agli Arrivi merce: selezione multipla, barra bulk e
    // duplica con scelta cliente.
    supportsBulkSelection: true,
    listExport: QUOTE_LIST_EXPORT,
    duplicateSubject: 'customer',
  },
  proforma: {
    profile: 'proforma',
    type: DocumentType.Proforma,
    pageTitle: 'Proforma',
    pageSubtitle: 'Proforma cliente, convertibili in fattura o DDT vendita.',
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
  'ddt-vendita': {
    profile: 'ddt-vendita',
    type: DocumentType.SalesDdt,
    pageTitle: 'DDT vendita',
    pageSubtitle: 'Documenti di trasporto verso clienti, con scarico magazzino alla conferma.',
    createLabel: 'Nuovo DDT vendita',
    createPath: '/app/documents/ddt-vendita/new',
    listPath: '/app/documents/ddt-vendita',
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
  'vendita-manuale': {
    profile: 'vendita-manuale',
    type: DocumentType.ManualUnload,
    pageTitle: 'Vendite manuali',
    pageSubtitle: 'Attenzione! Scarico diretto delle giacenze.',
    createLabel: 'Nuova vendita manuale',
    createPath: '/app/documents/vendita-manuale/new',
    listPath: '/app/documents/vendita-manuale',
    emptyTitle: 'Nessuna vendita manuale',
    emptyDescription:
      'Non ci sono vendite manuali che corrispondono ai filtri. Crea una nuova vendita manuale per registrare una vendita che riduce la giacenza senza generare movimenti di magazzino.',
    emptyIcon: 'pi-minus-circle',
    searchPlaceholder: 'Cerca per numero o cliente…',
    // Salvataggio = conferma immediata: nessun ciclo stati da filtrare.
    statusOptions: null,
    showPendingInvoiceFilter: false,
    viewId: TableViewId.ManualUnloadDocumentsList,
    detailPanelTitle: 'Dati vendita manuale',
    detailNotFoundTitle: 'Vendita manuale non trovata',
  },
  'purchase-invoice': {
    profile: 'purchase-invoice',
    type: DocumentType.SupplierInvoice,
    pageTitle: 'Registrazioni fatture fornitori',
    pageSubtitle:
      'Fatture fornitore registrate: collegano gli arrivi merce alla fattura ricevuta e tracciano le scadenze di pagamento. Mai effetti sul magazzino.',
    createLabel: 'Nuova registrazione fattura fornitore',
    createPath: '/app/documents/registrazioni-fatture-fornitori/new',
    listPath: '/app/documents/registrazioni-fatture-fornitori',
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
    detailNotFoundTitle: 'Registrazione fattura fornitore non trovata',
  },
  // Elenco condiviso dai TRE tipi della famiglia Fattura: un solo numeratore,
  // una sola pagina, filtro «Tipo» preimpostato dalla voce hub di provenienza.
  // La Nota di credito non ha un elenco proprio, e non deve averlo: sta nella
  // stessa serie progressiva delle fatture, e un registro separato mostrerebbe
  // una numerazione con i buchi lasciati dall'altro (`07-…§3`).
  invoice: {
    profile: 'invoice',
    type: DocumentType.Invoice,
    types: SALES_INVOICE_DOCUMENT_TYPES,
    typeFilterOptions: INVOICE_TYPE_FILTER_OPTIONS,
    pageTitle: 'Fatture',
    pageSubtitle:
      'Fatture, fatture accompagnatorie e note di credito da inviare al commercialista, in un unico progressivo.',
    // `createLabel`/`createPath` restano per i chiamanti che chiedono «il
    // documento predefinito della pagina» (duplicazioni, link diretti). La
    // TESTATA non li usa: dove ci sono `createVariants` mostra il menu.
    createLabel: 'Nuova fattura',
    createPath: '/app/documents/fattura/new',
    createVariants: [
      {
        type: DocumentType.Invoice,
        label: 'Nuova fattura',
        path: '/app/documents/fattura/new',
      },
      {
        type: DocumentType.InvoiceAccompanying,
        label: 'Nuova fattura accompagnatoria',
        path: '/app/documents/fattura-accompagnatoria/new',
      },
      {
        type: DocumentType.CreditNote,
        label: 'Nuova nota di credito',
        path: '/app/documents/nota-di-credito/new',
      },
    ],
    listPath: '/app/documents/fattura',
    // Testi della FAMIGLIA, non della sola Fattura: l'elenco ne mostra tre e il
    // filtro può essere su uno qualsiasi. Dicevano «Nessuna fattura» e «crea una
    // nuova fattura» mentre il pulsante accanto diceva «Nuova nota di credito»:
    // tre stringhe, due semantiche. Restano al plurale e senza tipo, perché il
    // comando che le accompagna non ne sceglie più uno.
    emptyTitle: 'Nessun documento',
    emptyDescription:
      'Non ci sono fatture, fatture accompagnatorie o note di credito che corrispondono ai filtri. Creane una nuova per preparare i dati da trasmettere al commercialista.',
    emptyIcon: 'pi-receipt',
    searchPlaceholder: 'Cerca per numero o cliente…',
    statusOptions: INVOICE_STATUS_OPTIONS,
    showPendingInvoiceFilter: false,
    viewId: TableViewId.InvoiceDraftDocumentsList,
    // Stessa ragione dei testi vuoti: l'anteprima si apre su uno qualsiasi dei
    // tre tipi, e «Dati fattura» sopra una nota di credito è sbagliato. Il tipo
    // esatto l'operatore lo legge nella colonna «Tipo» e nella testata.
    detailPanelTitle: 'Dati documento',
    detailNotFoundTitle: 'Documento non trovato',
  },
  // Elenco condiviso da Vendita e Reso al banco: entrambi nascono dalla
  // cassa in un'unica transazione con i movimenti, quindi la pagina è di sola
  // consultazione — nessun «Nuovo …», nessuna azione di riga distruttiva.
  'store-sale': {
    profile: 'store-sale',
    type: DocumentType.StoreSale,
    types: [DocumentType.StoreSale, DocumentType.StoreReturn],
    typeFilterOptions: STORE_SALE_TYPE_FILTER_OPTIONS,
    pageTitle: 'Vendite al banco',
    pageSubtitle: 'Vendite e resi al banco, con i movimenti di magazzino già applicati.',
    // Due pulsanti diretti, non il menu: `11` A2 lo esclude, e con due tipi
    // l'elenco dice da sé cosa si può creare.
    createLabel: 'Nuova vendita al banco',
    createPath: storeSaleCreatePath('sale'),
    createVariants: [
      {
        type: DocumentType.StoreSale,
        label: 'Nuova vendita al banco',
        path: storeSaleCreatePath('sale'),
      },
      {
        type: DocumentType.StoreReturn,
        label: 'Nuovo reso al banco',
        path: storeSaleCreatePath('return'),
      },
    ],
    createVariantsLayout: 'buttons',
    createRequiresRetailRegister: true,
    listPath: '/app/vendita-al-banco',
    emptyTitle: 'Nessuna vendita o reso al banco',
    emptyDescription: 'Non ci sono vendite o resi che corrispondono ai filtri.',
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
  'ddt-vendita',
  'vendita-manuale',
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
