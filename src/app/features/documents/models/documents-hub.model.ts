export interface DocumentHubItem {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly route: readonly string[];
  readonly queryParams?: Readonly<Record<string, string>>;
  readonly icon: string;
  readonly available: boolean;
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
        label: 'Ordini fornitore',
        description: 'Gestiti dalla sezione Ordini fornitori.',
        route: ['/app/orders'],
        icon: 'pi-shopping-bag',
        available: true,
      },
      {
        id: 'goods-receipt',
        label: 'Arrivi merce',
        description: 'Carichi fornitore, DDT e fatture accompagnatorie.',
        route: ['/app/documents/arrivi-merce'],
        icon: 'pi-box',
        available: true,
      },
      {
        id: 'supplier-invoices',
        label: 'Registrazione fattura',
        description: 'Collega gli arrivi merce alla fattura ricevuta dal fornitore.',
        route: ['/app/documents/registro'],
        queryParams: { type: 'supplier_invoice' },
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
        label: 'Trasferimenti',
        description: 'Spostamenti stock tra location.',
        route: ['/app/documents/registro'],
        queryParams: { type: 'transfer' },
        icon: 'pi-arrow-right-arrow-left',
        available: true,
      },
      {
        id: 'adjustment',
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
        label: 'Scarichi manuali',
        description: 'Scarichi operativi non legati a vendita.',
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
        label: 'Ordini cliente',
        description: 'Registro ordini cliente: manuali e multicanale, con impegni di magazzino.',
        route: ['/app/sales'],
        icon: 'pi-shopping-cart',
        available: true,
      },
      {
        id: 'store-sale-register',
        label: 'Vendita negozio',
        description: 'Cassa a carrello per vendite immediate in negozio.',
        route: ['/app/sales/register'],
        icon: 'pi-shopping-bag',
        available: true,
      },
      {
        id: 'store-sales',
        label: 'Registro vendite negozio',
        description: 'Elenco vendite negozio registrate dalla cassa.',
        route: ['/app/documents/registro'],
        queryParams: { type: 'store_sale' },
        icon: 'pi-shopping-cart',
        available: true,
      },
      {
        id: 'store-returns',
        label: 'Resi vendita negozio',
        description: 'Resi collegati alle vendite negozio, con stato vendibile.',
        route: ['/app/documents/registro'],
        queryParams: { type: 'store_return' },
        icon: 'pi-replay',
        available: true,
      },
      // Documenti di vendita: pagine elenco DEDICATE (titolo, «Nuovo …» del
      // tipo, filtri propri) — mai il registro generico filtrato, che
      // mostrerebbe il selettore «Altro documento» fuori contesto.
      {
        id: 'proforma',
        label: 'Proforma',
        description: 'Preventivi e proforma cliente.',
        route: ['/app/documents/proforma'],
        icon: 'pi-file-edit',
        available: true,
      },
      {
        id: 'sales-ddt',
        label: 'DDT vendita',
        description: 'Documenti di trasporto verso clienti.',
        route: ['/app/documents/sales-ddt'],
        icon: 'pi-truck',
        available: true,
      },
      {
        id: 'invoice-draft',
        label: 'Bozze fattura',
        description: 'Bozze fattura e invio al commercialista.',
        route: ['/app/documents/invoice-draft'],
        icon: 'pi-receipt',
        available: true,
      },
      {
        id: 'quotes',
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
