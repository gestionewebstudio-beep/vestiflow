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
        // «fornitori» nel nome: accanto ci sono le fatture di VENDITA, e
        // «Registrazione fattura» da solo non direbbe di quale lato si parla.
        // Forma abbreviata perché è una scheda, non un titolo di pagina.
        label: 'Reg. fatture fornitori',
        description: 'Collega gli arrivi merce alla fattura ricevuta dal fornitore.',
        route: ['/app/documents/registrazioni-fatture-fornitori'],
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
        label: 'Vendita manuale',
        // ⭐ La stessa frase che spiega la funzione in Impostazioni: dice le
        // tre cose essenziali — e' una vendita, agisce sulla giacenza, e la
        // particolarita' e' che non lascia movimenti.
        description:
          'Registra una vendita e riduce la giacenza senza creare movimenti di magazzino.',
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
      // ⛔ UNA sola card per il banco, e porta al RIEPILOGO (`11` A2, deciso
      // il 20/08/2026). Qui c'era anche «Vendita al banco — Cassa a carrello»,
      // che apriva la creazione: due card per lo stesso modulo, con due nomi
      // che differiscono per una lettera. La creazione diretta e' ora la
      // scorciatoia di sidebar; da questo elenco i due pulsanti creano sia la
      // vendita sia il reso.
      //
      // Vendite e resi al banco condividono un'unica pagina elenco con filtro
      // «Tipo»: stesso numeratore di provenienza (la cassa) e stesse colonne.
      {
        id: 'store-sales',
        family: 'store_sale',
        label: 'Vendite al banco',
        description: 'Vendite e resi al banco registrati: da qui si consultano e si creano.',
        route: ['/app/vendita-al-banco'],
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
      // UNA sola scorciatoia per la famiglia Fattura (deciso 16/08). Erano tre
      // voci che portavano allo stesso elenco con il filtro preimpostato, e
      // quel filtro era anche — per un difetto — il selettore di cosa si
      // creava. Sciolto quel legame, tre porte per una stanza sola dicevano
      // all'operatore che le stanze fossero tre.
      // Il tipo si sceglie dentro: dal menu «Nuovo» per crearlo, dal filtro
      // «Tipo» per guardarlo.
      {
        id: 'invoice',
        family: 'invoice',
        label: 'Fatture',
        description: 'Fatture, accompagnatorie e note di credito, in un unico progressivo.',
        route: ['/app/documents/fattura'],
        icon: 'pi-receipt',
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
