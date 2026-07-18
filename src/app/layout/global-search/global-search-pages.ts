/**
 * Destinazioni di secondo livello per la ricerca globale: pagine raggiungibili
 * ma assenti dalla sidebar (tab, sotto-registri, azioni rapide). La visibilita'
 * e' agganciata alla presenza della sezione padre nella nav (`parent`), che lo
 * shell filtra gia' per permessi ruolo.
 */
export interface SecondaryPage {
  readonly label: string;
  readonly sub?: string;
  readonly icon: string;
  readonly route: string;
  readonly queryParams?: Readonly<Record<string, string>>;
  /** Route della voce nav che fa da guardia permessi (es. '/app/inventory'). */
  readonly parent: string;
}

export const SECONDARY_PAGES: readonly SecondaryPage[] = [
  // Magazzino — tab della sezione
  {
    label: 'Giacenze',
    sub: 'Stock per variante e location',
    icon: 'pi-database',
    route: '/app/inventory',
    parent: '/app/inventory',
  },
  {
    label: 'Situazione magazzino',
    sub: 'Riepilogo articoli, scorte e riordino',
    icon: 'pi-chart-bar',
    route: '/app/inventory/situation',
    parent: '/app/inventory',
  },
  {
    label: 'Cerca giacenza',
    sub: 'Lookup rapido per SKU o barcode',
    icon: 'pi-search',
    route: '/app/inventory/lookup',
    parent: '/app/inventory',
  },
  {
    label: 'Movimenti di magazzino',
    sub: 'Carichi, scarichi e rettifiche',
    icon: 'pi-arrows-v',
    route: '/app/inventory/movements',
    parent: '/app/inventory',
  },
  {
    label: 'Inventario',
    sub: 'Conteggi di magazzino',
    icon: 'pi-list-check',
    route: '/app/inventory/counts',
    parent: '/app/inventory',
  },
  {
    label: 'Importa giacenze CSV',
    icon: 'pi-upload',
    route: '/app/inventory/import',
    parent: '/app/inventory',
  },
  // Azioni rapide documentali
  {
    label: 'Nuovo arrivo merce',
    sub: 'Carico fornitore',
    icon: 'pi-box',
    route: '/app/documents/goods-receipt/new',
    parent: '/app/documents',
  },
  {
    label: 'Nuovo ordine fornitore',
    icon: 'pi-shopping-bag',
    route: '/app/orders/new',
    parent: '/app/orders',
  },
  {
    label: 'Numeratori documenti',
    sub: 'Serie e numerazione',
    icon: 'pi-cog',
    route: '/app/documents/settings',
    parent: '/app/documents',
  },
  // Prodotti
  {
    label: 'Nuovo prodotto',
    icon: 'pi-plus',
    route: '/app/products/new',
    parent: '/app/products',
  },
  {
    label: 'Importa prodotti CSV',
    icon: 'pi-upload',
    route: '/app/products/import',
    parent: '/app/products',
  },
  // Report
  {
    label: 'Report corrispettivi',
    sub: 'Export per il commercialista',
    icon: 'pi-chart-bar',
    route: '/app/reports/corrispettivi',
    parent: '/app/reports',
  },
  {
    label: 'Registro commercialista',
    sub: 'Registro unificato vendite e storni',
    icon: 'pi-book',
    route: '/app/reports/accountant-register',
    parent: '/app/reports',
  },
  // Impostazioni
  {
    label: 'Codici IVA',
    sub: 'Aliquote e nature IVA',
    icon: 'pi-percentage',
    route: '/app/settings/codici-iva',
    parent: '/app/settings',
  },
];
