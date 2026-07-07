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

/** Voci hub Documenti (tipologie Danea-style; solo quelle implementate sono cliccabili). */
export const DOCUMENT_HUB_GROUPS: readonly DocumentHubGroup[] = [
  {
    title: 'Magazzino',
    items: [
      {
        id: 'goods-receipt',
        label: 'Arrivi merce',
        description: 'Carichi fornitore, DDT e fatture accompagnatorie.',
        route: ['/app/documents/arrivi-merce'],
        icon: 'pi-box',
        available: true,
      },
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
        label: 'Rettifiche inventario',
        description: 'Rettifiche e conteggi di magazzino.',
        route: ['/app/documents/registro'],
        queryParams: { type: 'adjustment' },
        icon: 'pi-sliders-h',
        available: true,
      },
      {
        id: 'manual-unload',
        label: 'Scarichi manuali',
        description: 'Scarichi operativi non legati a vendita.',
        route: ['/app/documents/registro'],
        queryParams: { type: 'manual_unload' },
        icon: 'pi-minus-circle',
        available: true,
      },
      {
        id: 'inventory',
        label: 'Inventario',
        description: 'Documenti di inventario fisico.',
        route: ['/app/documents/registro'],
        queryParams: { type: 'inventory' },
        icon: 'pi-list-check',
        available: true,
      },
    ],
  },
  {
    title: 'Vendite',
    items: [
      {
        id: 'proforma',
        label: 'Proforma',
        description: 'Preventivi e proforma cliente.',
        route: ['/app/documents/registro'],
        queryParams: { type: 'proforma' },
        icon: 'pi-file-edit',
        available: true,
      },
      {
        id: 'sales-ddt',
        label: 'DDT vendita',
        description: 'Documenti di trasporto verso clienti.',
        route: ['/app/documents/registro'],
        queryParams: { type: 'sales_ddt' },
        icon: 'pi-truck',
        available: true,
      },
      {
        id: 'invoice-draft',
        label: 'Bozze fattura',
        description: 'Bozze fattura e invio al commercialista.',
        route: ['/app/documents/registro'],
        queryParams: { type: 'invoice_draft' },
        icon: 'pi-receipt',
        available: true,
      },
      {
        id: 'quotes',
        label: 'Preventivi',
        description: 'In preparazione.',
        route: [],
        icon: 'pi-file',
        available: false,
      },
      {
        id: 'customer-orders',
        label: 'Ordini cliente',
        description: 'In preparazione.',
        route: [],
        icon: 'pi-shopping-cart',
        available: false,
      },
    ],
  },
  {
    title: 'Fornitori e acquisti',
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
        id: 'supplier-invoices',
        label: 'Registro fatture fornitore',
        description: 'In preparazione.',
        route: [],
        icon: 'pi-book',
        available: false,
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
