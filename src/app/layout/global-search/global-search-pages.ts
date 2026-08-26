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
  {
    label: 'Registra movimento',
    sub: 'Carico, scarico o rettifica rapida',
    icon: 'pi-plus',
    route: '/app/inventory/movements/new',
    parent: '/app/inventory',
  },
  {
    label: 'Nuovo inventario',
    sub: 'Conteggio di magazzino',
    icon: 'pi-plus',
    route: '/app/inventory/counts/new',
    parent: '/app/inventory',
  },
  // Azioni rapide documentali. Le azioni «Nuovo …» dei documenti di vendita
  // (preventivo, proforma, DDT, fatture, vendita manuale, registrazione
  // fattura) NON stanno qui: la ricerca le deriva dalle config dei registri
  // documentali, una per profilo.
  {
    label: 'Nuovo arrivo merce',
    sub: 'Carico fornitore',
    icon: 'pi-box',
    route: '/app/documents/goods-receipt/new',
    parent: '/app/documents',
  },
  {
    label: 'Nuovo trasferimento',
    sub: 'Spostamento stock tra location',
    icon: 'pi-plus',
    route: '/app/documents/transfer/new',
    parent: '/app/documents',
  },
  {
    label: 'Nuova rettifica inventario',
    icon: 'pi-plus',
    route: '/app/documents/adjustment/new',
    parent: '/app/documents',
  },
  // Vendite
  {
    label: 'Nuovo ordine cliente',
    icon: 'pi-plus',
    route: '/app/sales/new',
    parent: '/app/sales',
  },
  // Anagrafiche
  {
    label: 'Nuovo cliente',
    icon: 'pi-plus',
    route: '/app/customers/new',
    parent: '/app/customers',
  },
  {
    label: 'Nuovo fornitore',
    icon: 'pi-plus',
    route: '/app/suppliers/new',
    parent: '/app/suppliers',
  },
  // Ordini fornitore: assenti dalla sidebar (si raggiungono dall'area
  // Fornitori), il gate permessi è la voce nav «Fornitori».
  {
    label: 'Ordini fornitori',
    sub: 'Ordini commerciali ai fornitori',
    icon: 'pi-shopping-bag',
    route: '/app/orders',
    parent: '/app/suppliers',
  },
  {
    label: 'Nuovo ordine fornitore',
    icon: 'pi-shopping-bag',
    route: '/app/orders/new',
    parent: '/app/suppliers',
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
    label: 'Corrispettivi',
    sub: 'Registro vendite e rettifiche, export per il commercialista',
    icon: 'pi-chart-bar',
    route: '/app/sales/corrispettivi',
    parent: '/app/sales',
  },
  // Impostazioni
  {
    label: 'Codici IVA',
    sub: 'Aliquote e nature IVA',
    icon: 'pi-percentage',
    route: '/app/settings/codici-iva',
    parent: '/app/settings',
  },
  {
    label: 'Pagamenti',
    sub: 'Metodi e condizioni di pagamento',
    icon: 'pi-credit-card',
    route: '/app/settings/pagamenti',
    parent: '/app/settings',
  },
];
