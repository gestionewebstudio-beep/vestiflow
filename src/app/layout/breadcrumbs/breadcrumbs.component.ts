import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map, startWith } from 'rxjs';

import { BreadcrumbLabelService } from '@core/services/breadcrumb-label.service';
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
  situation: 'Situazione',
  movements: 'Movimenti',
  counts: 'Inventario',
  'vendita-al-banco': 'Vendite al banco',
  'nuova-vendita-al-banco': 'Nuova vendita al banco',
  'nuovo-reso-al-banco': 'Nuovo reso al banco',
  online: 'Vendite online',
  corrispettivi: 'Corrispettivi',
  shopify: 'Ordini Shopify',
  registro: 'Registro documenti',
  'arrivi-merce': 'Arrivi merce',
  'goods-receipt': 'Arrivo merce',
  'registrazioni-fatture-fornitori': 'Reg. fatture fornitori',
  transfer: 'Trasferimento',
  adjustment: 'Rettifica',
  'vendita-manuale': 'Vendite manuali',
  proforma: 'Proforma',
  fattura: 'Fatture',
  'fattura-accompagnatoria': 'Fattura accompagnatoria',
  // Senza questa voce il segmento usciva grezzo — «nota-di-credito», trattini
  // compresi: un segmento sconosciuto ricade su `decodeURIComponent`.
  'nota-di-credito': 'Nota di credito',
  'ddt-vendita': 'DDT vendita',
  quote: 'Preventivi',
  'codici-iva': 'Codici IVA',
  pagamenti: 'Modalità di pagamento',
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
  '/app/inventory/situation',
  '/app/suppliers',
  '/app/orders',
  '/app/documents',
  '/app/documents/registro',
  '/app/documents/arrivi-merce',
  '/app/documents/quote',
  '/app/documents/proforma',
  '/app/documents/ddt-vendita',
  '/app/documents/vendita-manuale',
  '/app/documents/registrazioni-fatture-fornitori',
  '/app/documents/fattura',
  '/app/sales',
  '/app/vendita-al-banco',
  '/app/sales/online',
  '/app/sales/corrispettivi',
  '/app/sales/shopify',
  '/app/customers',
  '/app/reports',
  '/app/settings',
  '/app/settings/codici-iva',
  '/app/settings/pagamenti',
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
  private readonly entityLabels = inject(BreadcrumbLabelService).labels;

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
      startWith(this.router.url),
    ),
    { initialValue: this.router.url },
  );

  /**
   * Il form Ordine cliente su mobile nasconde il breadcrumb: la gerarchia è già
   * data dal pulsante «Indietro». Scoped a questa rotta (new / :id / :id/edit),
   * NON globale sulla shell.
   */
  protected readonly hideOnOrderForm = computed(() => {
    const segments = this.url().split('?')[0]!.split('/').filter(Boolean);
    return (
      segments[0] === 'app' &&
      segments[1] === 'sales' &&
      segments.length >= 3 &&
      (segments[2] === 'new' || isIdSegment(segments[2]!))
    );
  });

  protected readonly crumbs = computed<readonly Crumb[]>(() => {
    const raw = this.url();
    const [path, query = ''] = raw.split('?');
    const params = new URLSearchParams(query);
    const segments = path!.split('/').filter((s) => s && s !== 'app');

    // Arrivo merce in modifica: la rotta `documents/:id/edit` è esclusiva del
    // form arrivo merce (gli altri tipi usano sotto-percorsi dedicati). Il
    // percorso corretto è «Documenti > Arrivi merce > numero», con il tipo
    // prima del numero e senza la tappa «Modifica».
    if (
      segments.length === 3 &&
      segments[0] === 'documents' &&
      isIdSegment(segments[1]!) &&
      segments[2] === 'edit'
    ) {
      return [
        { label: SEGMENT_LABELS['documents']!, link: '/app/documents' },
        { label: SEGMENT_LABELS['arrivi-merce']!, link: '/app/documents/arrivi-merce' },
        { label: this.entityLabels().get(segments[1]!) ?? 'Dettaglio' },
      ];
    }

    // Elenco Ordini cliente (`/app/sales`): letto come registro documento,
    // «Documenti > Ordini cliente», non come sezione «Vendite».
    if (segments.length === 1 && segments[0] === 'sales') {
      return [
        { label: SEGMENT_LABELS['documents']!, link: '/app/documents' },
        { label: 'Ordini cliente' },
      ];
    }

    // Ordini fornitori: non è voce di sidebar, la si raggiunge dall'hub
    // Documenti («Acquisti e fornitori»). Stesso trattamento degli Ordini
    // cliente: «Documenti > Ordini fornitori > …».
    if (segments[0] === 'orders') {
      const crumbs: Crumb[] = [
        { label: SEGMENT_LABELS['documents']!, link: '/app/documents' },
        {
          label: SEGMENT_LABELS['orders']!,
          link: segments.length > 1 ? '/app/orders' : undefined,
        },
      ];
      let accumulated = '/app/orders';
      for (const segment of segments.slice(1)) {
        accumulated += `/${segment}`;
        crumbs.push({
          label: isIdSegment(segment)
            ? (this.entityLabels().get(segment) ?? 'Dettaglio')
            : (SEGMENT_LABELS[segment] ?? decodeURIComponent(segment)),
          link: LINKABLE_PATHS.has(accumulated) ? accumulated : undefined,
        });
      }
      crumbs[crumbs.length - 1] = { label: crumbs[crumbs.length - 1]!.label };
      return crumbs;
    }

    // Ordine cliente: la maschera vive sotto `sales/…` ma è un documento come
    // gli altri, e deve leggersi allo stesso modo — «Documenti > Ordini cliente
    // > numero» in apertura, «… > Nuovo» in creazione. Senza questo il percorso
    // passava da «Vendite» direttamente al numero (o a «Nuovo»), saltando il
    // registro che tutti gli altri tipi documento mostrano.
    if (segments[0] === 'sales' && (isIdSegment(segments[1] ?? '') || segments[1] === 'new')) {
      const isNew = segments[1] === 'new';
      if (isNew || segments.length === 2 || (segments.length === 3 && segments[2] === 'edit')) {
        return [
          { label: SEGMENT_LABELS['documents']!, link: '/app/documents' },
          { label: 'Ordini cliente', link: '/app/sales' },
          {
            label: isNew
              ? SEGMENT_LABELS['new']!
              : (this.entityLabels().get(segments[1]!) ?? 'Dettaglio'),
          },
        ];
      }
    }

    const crumbs: Crumb[] = [];
    let accumulated = '/app';
    for (const segment of segments) {
      accumulated += `/${segment}`;
      const label = isIdSegment(segment)
        ? (this.entityLabels().get(segment) ?? 'Dettaglio')
        : (SEGMENT_LABELS[segment] ?? decodeURIComponent(segment));
      crumbs.push({
        label,
        link: LINKABLE_PATHS.has(accumulated) ? accumulated : undefined,
      });
    }

    // Registro filtrato per tipologia: l'etichetta finale e' quella della
    // card hub (es. «Registro vendite al banco»), piu' parlante del generico.
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
