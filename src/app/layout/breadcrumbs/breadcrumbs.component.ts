import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map, startWith } from 'rxjs';

import { DOCUMENT_HUB_GROUPS } from '@features/documents/models/documents-hub.model';

/** Voce del percorso: link se la tappa intermedia e' una pagina reale. */
interface Crumb {
  readonly label: string;
  readonly link?: string;
}

/** Etichette dei segmenti URL noti (il resto: id → «Dettaglio»). */
const SEGMENT_LABELS: Readonly<Record<string, string>> = {
  dashboard: 'Dashboard',
  products: 'Prodotti',
  inventory: 'Magazzino',
  suppliers: 'Fornitori',
  orders: 'Ordini fornitori',
  documents: 'Documenti',
  sales: 'Vendite',
  customers: 'Clienti',
  reports: 'Report',
  settings: 'Impostazioni',
  guide: 'Guida',
  admin: 'Amministrazione',
  new: 'Nuovo',
  edit: 'Modifica',
  import: 'Importa CSV',
  lookup: 'Cerca giacenza',
  movements: 'Movimenti',
  counts: 'Inventario fisico',
  register: 'Vendita negozio',
  online: 'Vendite online',
  corrispettivi: 'Corrispettivi',
  shopify: 'Ordini Shopify',
  registro: 'Registro documenti',
  'arrivi-merce': 'Arrivi merce',
  'goods-receipt': 'Arrivo merce',
  'registrazione-fattura': 'Registrazione fattura',
  transfer: 'Trasferimento',
  adjustment: 'Rettifica',
  'manual-unload': 'Scarico manuale',
  proforma: 'Proforma',
  'invoice-draft': 'Bozze fattura',
  'sales-ddt': 'DDT vendita',
  quote: 'Preventivi',
  'codici-iva': 'Codici IVA',
  'payment-options': 'Modalità di pagamento',
  'accountant-register': 'Registro commercialista',
  clients: 'Clienti',
  account: 'Account',
  print: 'Stampa',
  'print-label': 'Stampa etichette',
};

/** Tappe intermedie navigabili: solo queste diventano link. */
const LINKABLE_PATHS: ReadonlySet<string> = new Set([
  '/app/dashboard',
  '/app/products',
  '/app/inventory',
  '/app/inventory/movements',
  '/app/inventory/lookup',
  '/app/inventory/counts',
  '/app/suppliers',
  '/app/orders',
  '/app/documents',
  '/app/documents/registro',
  '/app/documents/arrivi-merce',
  '/app/documents/quote',
  '/app/documents/proforma',
  '/app/documents/sales-ddt',
  '/app/documents/invoice-draft',
  '/app/sales',
  '/app/sales/register',
  '/app/sales/online',
  '/app/sales/corrispettivi',
  '/app/sales/shopify',
  '/app/customers',
  '/app/reports',
  '/app/reports/corrispettivi',
  '/app/reports/accountant-register',
  '/app/settings',
  '/app/settings/codici-iva',
  '/app/guide',
  '/app/admin',
  '/app/admin/clients',
]);

/** Registro filtrato per tipo → etichetta della card hub corrispondente. */
const REGISTRO_TYPE_LABELS: Readonly<Record<string, string>> = Object.fromEntries(
  DOCUMENT_HUB_GROUPS.flatMap((group) =>
    group.items
      .filter((item) => item.queryParams?.['type'])
      .map((item): [string, string] => [item.queryParams?.['type'] ?? '', item.label]),
  ),
);

/** Un segmento id (uuid o numerico lungo) non ha etichetta propria. */
function isIdSegment(segment: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(segment) || /^\d{6,}$/.test(segment);
}

/**
 * Percorso di navigazione (v5.1): derivato dall'URL corrente, mostra dove ci
 * si trova e da dove si e' arrivati; le tappe intermedie reali sono link.
 */
@Component({
  selector: 'app-breadcrumbs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './breadcrumbs.component.html',
  styleUrl: './breadcrumbs.component.scss',
})
export class BreadcrumbsComponent {
  private readonly router = inject(Router);

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
      startWith(this.router.url),
    ),
    { initialValue: this.router.url },
  );

  protected readonly crumbs = computed<readonly Crumb[]>(() => {
    const raw = this.url();
    const [path, query = ''] = raw.split('?');
    const params = new URLSearchParams(query);
    const segments = path!.split('/').filter((s) => s && s !== 'app');

    const crumbs: Crumb[] = [];
    let accumulated = '/app';
    for (const segment of segments) {
      accumulated += `/${segment}`;
      const label = isIdSegment(segment)
        ? 'Dettaglio'
        : (SEGMENT_LABELS[segment] ?? decodeURIComponent(segment));
      crumbs.push({
        label,
        link: LINKABLE_PATHS.has(accumulated) ? accumulated : undefined,
      });
    }

    // Registro filtrato per tipologia: l'etichetta finale e' quella della
    // card hub (es. «Registro vendite negozio»), piu' parlante del generico.
    const type = params.get('type');
    const registroLabel = type ? REGISTRO_TYPE_LABELS[type] : undefined;
    if (registroLabel && segments.at(-1) === 'registro') {
      crumbs[crumbs.length - 1] = {
        ...crumbs[crumbs.length - 1]!,
        label: registroLabel,
      };
    }

    // L'ultima tappa e' la pagina corrente: mai link.
    if (crumbs.length > 0) {
      crumbs[crumbs.length - 1] = { label: crumbs[crumbs.length - 1]!.label };
    }
    return crumbs;
  });
}
