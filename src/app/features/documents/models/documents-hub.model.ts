import type { DocumentPermissionFamily } from '@core/models/tenant-permission.model';

export interface DocumentHubItem {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly route: readonly string[];
  readonly queryParams?: Readonly<Record<string, string>>;
  readonly icon: string;
  readonly available: boolean;
  /**
   * Famiglia della matrice permessi a cui la voce porta: senza il permesso di
   * consultarla la card non compare. Assente = voce che non dipende da una
   * famiglia (es. «Tutti i documenti», che vive già dietro la sezione).
   */
  readonly family?: DocumentPermissionFamily;
  /**
   * Voce che non dipende da una famiglia documento ma da un'altra condizione.
   * `retail-register` = la cassa, che vuole canale + sezione Vendite + permesso
   * di battere: le stesse tre cose che chiedono la sidebar e il guard di rotta.
   */
  readonly gate?: 'retail-register';
  /**
   * Sezione che la rotta di destinazione esige OLTRE alla famiglia.
   *
   * Serve alle due sole card che portano fuori da Documenti: `/app/orders` vuole
   * anche la sezione Fornitori, `/app/sales` anche la sezione Vendite. Senza,
   * la card comparirebbe e il guard rimbalzerebbe — la porta finta che questo
   * filtro esiste per evitare. Le altre tredici restano dentro la sezione
   * Documenti, che è già la porta dell'hub.
   */
  readonly section?: 'suppliers' | 'sales';
}

export interface DocumentHubGroup {
  readonly title: string;
  readonly items: readonly DocumentHubItem[];
}

/**
 * Voci hub Documenti riorganizzate per flusso (fase 3 §11): Acquisti e
 * fornitori, Magazzino, Vendite, Registro. Solo le voci implementate sono
 * cliccabili.
 */
export const DOCUMENT_HUB_GROUPS: readonly DocumentHubGroup[] = [
  {
    title: 'Acquisti e fornitori',
    items: [
      {
        id: 'supplier-orders',
        family: 'supplier_order',
        section: 'suppliers',
        label: 'Ordini fornitore',
        description: 'Gestiti dalla sezione Ordini fornitori.',
        route: ['/app/orders'],
        icon: 'pi-shopping-bag',
        available: true,
      },
      {
        id: 'goods-receipt',
        family: 'goods_receipt',
        label: 'Arrivi merce',
        description: 'Carichi fornitore, DDT e fatture accompagnatorie.',
        route: ['/app/documents/arrivi-merce'],
        icon: 'pi-box',
        available: true,
      },
      {
        id: 'supplier-invoices',
        family: 'purchase_invoice',
        // «fornitore» nel nome: quando accanto ci saranno le fatture di vendita,
        // «Registrazione fattura» da solo non direbbe più di quale lato si parla.
        label: 'Registrazione fattura fornitore',
        description: 'Collega gli arrivi merce alla fattura ricevuta dal fornitore.',
        route: ['/app/documents/registrazione-fattura'],
        icon: 'pi-book',
        available: true,
      },
    ],
  },
  {
    title: 'Magazzino',
    items: [
      {
        id: 'transfer',
        family: 'transfer',
        label: 'Trasferimenti',
        description: 'Spostamenti stock tra location.',
        route: ['/app/documents/registro'],
        queryParams: { type: 'transfer' },
        icon: 'pi-arrow-right-arrow-left',
        available: true,
      },
      {
        id: 'adjustment',
        family: 'adjustment',
        label: 'Rettifiche di magazzino',
        description: 'Rettifiche e conteggi di magazzino.',
        route: ['/app/documents/registro'],
        queryParams: { type: 'adjustment' },
        icon: 'pi-sliders-h',
        available: true,
      },
      {
        // Pagina dedicata (prompt Scarico manuale): elenco con «Nuovo scarico
        // manuale», eliminazione senza ripristino giacenze e stampa.
        id: 'manual-unload',
        family: 'manual_unload',
        label: 'Scarico manuale giacenze',
        description: 'Attenzione! Scarico diretto delle giacenze.',
        route: ['/app/documents/manual-unload'],
        icon: 'pi-minus-circle',
        available: true,
      },
    ],
  },
  {
    title: 'Vendite',
    items: [
      {
        id: 'customer-orders',
        family: 'sales_order',
        section: 'sales',
        label: 'Ordini cliente',
        description: 'Registro ordini cliente: manuali e multicanale, con impegni di magazzino.',
        route: ['/app/sales'],
        icon: 'pi-shopping-cart',
        available: true,
      },
      {
        id: 'store-sale-register',
        gate: 'retail-register',
        label: 'Vendita negozio',
        description: 'Cassa a carrello per vendite immediate in negozio.',
        route: ['/app/sales/register'],
        icon: 'pi-shopping-bag',
        available: true,
      },
      // Vendite e resi negozio condividono un'unica pagina elenco con filtro
      // «Tipo»: stesso numeratore di provenienza (la cassa) e stesse colonne.
      {
        id: 'store-sales',
        family: 'store_sale',
        label: 'Vendita/Reso in negozio',
        description: 'Elenco di vendite e resi registrati dalla cassa negozio.',
        route: ['/app/documents/vendite-negozio'],
        icon: 'pi-shopping-cart',
        available: true,
      },
      // Documenti di vendita: pagine elenco DEDICATE (titolo, «Nuovo …» del
      // tipo, filtri propri) — mai il registro generico filtrato, che
      // mostrerebbe il selettore «Altro documento» fuori contesto.
      {
        id: 'proforma',
        family: 'proforma',
        label: 'Proforma',
        description: 'Preventivi e proforma cliente.',
        route: ['/app/documents/proforma'],
        icon: 'pi-file-edit',
        available: true,
      },
      {
        id: 'sales-ddt',
        family: 'sales_ddt',
        label: 'DDT vendita',
        description: 'Documenti di trasporto verso clienti.',
        route: ['/app/documents/sales-ddt'],
        icon: 'pi-truck',
        available: true,
      },
      // I TRE tipi della famiglia Fattura: voci separate ma stesso elenco e
      // stesso numeratore. Il `type` in query preimposta il filtro Tipo della
      // lista condivisa, che resta comunque modificabile dall'operatore.
      // Nessuna delle tre porta a una pagina propria: il progressivo è uno solo
      // e un registro separato lo mostrerebbe pieno di buchi.
      {
        id: 'invoice',
        family: 'invoice',
        label: 'Fattura',
        description: 'Fattura fiscale da inviare al commercialista.',
        route: ['/app/documents/fattura'],
        queryParams: { type: 'invoice_draft' },
        icon: 'pi-receipt',
        available: true,
      },
      {
        id: 'invoice-accompanying',
        family: 'invoice',
        label: 'Fattura accompagnatoria',
        description: 'Fattura fiscale con trasporto merce incluso.',
        route: ['/app/documents/fattura'],
        queryParams: { type: 'invoice_accompanying' },
        icon: 'pi-truck',
        available: true,
      },
      {
        id: 'credit-note',
        family: 'invoice',
        label: 'Nota di credito',
        description: 'Storno totale o parziale di una fattura già emessa.',
        route: ['/app/documents/fattura'],
        queryParams: { type: 'credit_note' },
        icon: 'pi-replay',
        available: true,
      },
      {
        id: 'quotes',
        family: 'quote',
        label: 'Preventivi',
        description: 'Preventivi cliente con numerazione PRE dedicata.',
        route: ['/app/documents/quote'],
        icon: 'pi-file',
        available: true,
      },
    ],
  },
  {
    title: 'Registro',
    items: [
      {
        id: 'all-documents',
        label: 'Tutti i documenti',
        description: 'Registro completo con filtri avanzati.',
        route: ['/app/documents/registro'],
        icon: 'pi-folder-open',
        available: true,
      },
    ],
  },
] as const;
