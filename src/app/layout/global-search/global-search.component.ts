import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { NgClass } from '@angular/common';
import { Router } from '@angular/router';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, debounceTime, forkJoin, map, of, switchMap } from 'rxjs';

import { formatDate } from '@core/utils/date.util';
import { CustomerService } from '@features/customers/services/customer.service';
import { DOCUMENT_HUB_GROUPS } from '@features/documents/models/documents-hub.model';
import { DocumentService } from '@features/documents/services/document.service';
import { ProductService } from '@features/products/services/product.service';
import { InlineSpinnerComponent } from '@shared/components/inline-spinner/inline-spinner.component';
import type { NavSection } from '@shared/models/nav-item.model';

import { SECONDARY_PAGES } from './global-search-pages';

/** Voce selezionabile della palette, qualunque sia la fonte. */
interface SearchResultItem {
  readonly group: string;
  readonly label: string;
  readonly sub?: string;
  readonly icon: string;
  readonly route: string;
  readonly queryParams?: Readonly<Record<string, string>>;
  /** true = voce nav principale: mostrata anche a query vuota. */
  readonly primary?: boolean;
}

interface RemoteResults {
  readonly term: string;
  readonly items: readonly SearchResultItem[];
}

const EMPTY_REMOTE: RemoteResults = { term: '', items: [] };
const MIN_SEARCH_LENGTH = 2;
const RESULTS_PER_SOURCE = 5;
const SEARCH_DEBOUNCE_MS = 250;

/**
 * Ricerca globale ⌘K (riferimento v4): palette con navigazione rapida alle
 * pagine (voci nav gia' filtrate per permessi dallo shell) e ricerca live su
 * prodotti, clienti e documenti. Smart di proposito: vive nel layout accanto
 * allo shell, non tra i componenti condivisi dumb.
 */
@Component({
  selector: 'app-global-search',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgClass, InlineSpinnerComponent],
  templateUrl: './global-search.component.html',
  styleUrl: './global-search.component.scss',
})
export class GlobalSearchComponent {
  private readonly router = inject(Router);
  private readonly productService = inject(ProductService);
  private readonly customerService = inject(CustomerService);
  private readonly documentService = inject(DocumentService);

  /** Palette visibile. Lo shell la apre (click topbar o Ctrl/⌘+K). */
  readonly open = input.required<boolean>();
  /** Sezioni nav dello shell: fonte delle pagine navigabili (permessi inclusi). */
  readonly navSections = input<readonly NavSection[]>([]);
  readonly closed = output<void>();

  private readonly searchInputRef = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  protected readonly query = signal('');
  protected readonly activeIndex = signal(0);

  /** Ricerca remota debounced su prodotti, clienti e documenti in parallelo. */
  private readonly remote = toSignal(
    toObservable(this.query).pipe(
      debounceTime(SEARCH_DEBOUNCE_MS),
      switchMap((raw) => {
        const term = raw.trim();
        if (term.length < MIN_SEARCH_LENGTH) {
          return of(EMPTY_REMOTE);
        }
        return forkJoin({
          products: this.productService
            .getProducts({ page: 1, pageSize: RESULTS_PER_SOURCE, search: term })
            .pipe(
              map((res) => res.data),
              catchError(() => of([])),
            ),
          customers: this.customerService
            .getCustomers({ page: 1, pageSize: RESULTS_PER_SOURCE, search: term })
            .pipe(
              map((res) => res.data),
              catchError(() => of([])),
            ),
          documents: this.documentService
            .getDocuments({ page: 1, pageSize: RESULTS_PER_SOURCE, search: term })
            .pipe(
              map((res) => res.data),
              catchError(() => of([])),
            ),
        }).pipe(
          map(({ products, customers, documents }): RemoteResults => {
            const items: SearchResultItem[] = [
              ...products.map((product) => ({
                group: 'Prodotti',
                label: product.name,
                // Codice articolo in evidenza: la ricerca lo accetta come
                // criterio (§ricerca globale) e il risultato lo conferma.
                sub: [product.articleCode, product.brand].filter(Boolean).join(' · ') || undefined,
                icon: 'pi-tag',
                route: `/app/products/${product.id}`,
              })),
              ...customers.map((customer) => ({
                group: 'Clienti',
                label: `${customer.firstName} ${customer.lastName}`.trim(),
                sub: customer.email ?? customer.code,
                icon: 'pi-users',
                route: `/app/customers/${customer.id}`,
              })),
              ...documents.map((doc) => ({
                group: 'Documenti',
                label: doc.reference ?? `Bozza ${doc.series}-${doc.year}`,
                sub: formatDate(doc.documentDate),
                icon: 'pi-file',
                route: `/app/documents/${doc.id}`,
              })),
            ];
            return { term, items };
          }),
        );
      }),
    ),
    { initialValue: EMPTY_REMOTE },
  );

  /**
   * Catalogo completo delle pagine raggiungibili: voci nav dello shell (gia'
   * filtrate per permessi) + card dell'hub Documenti + destinazioni di secondo
   * livello, gated sulla presenza della sezione padre in nav.
   */
  private readonly pageCatalog = computed<readonly SearchResultItem[]>(() => {
    const navItems = this.navSections().flatMap((section) =>
      section.items.filter((item) => !item.disabled),
    );
    const allowedRoots = new Set(navItems.map((item) => item.activeRoutePrefix ?? item.route));
    const isAllowed = (parent: string): boolean =>
      [...allowedRoots].some((root) => root.startsWith(parent) || parent.startsWith(root));

    const catalog: SearchResultItem[] = navItems.map((item) => ({
      group: 'Pagine',
      label: item.label,
      icon: item.icon,
      route: item.route,
      queryParams: item.queryParams,
      primary: true,
    }));
    const seen = new Set(catalog.map((item) => item.label.toLowerCase()));
    const push = (item: SearchResultItem): void => {
      const key = item.label.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        catalog.push(item);
      }
    };

    if (isAllowed('/app/documents')) {
      for (const group of DOCUMENT_HUB_GROUPS) {
        for (const hubItem of group.items) {
          if (!hubItem.available || hubItem.route.length === 0) {
            continue;
          }
          push({
            group: 'Pagine',
            label: hubItem.label,
            sub: hubItem.description,
            icon: hubItem.icon,
            route: hubItem.route[0]!,
            queryParams: hubItem.queryParams,
          });
        }
      }
    }

    for (const page of SECONDARY_PAGES) {
      if (isAllowed(page.parent)) {
        push({
          group: 'Pagine',
          label: page.label,
          sub: page.sub,
          icon: page.icon,
          route: page.route,
          queryParams: page.queryParams,
        });
      }
    }
    return catalog;
  });

  /**
   * Pagine che corrispondono alla query: matching a token su label+sottotitolo
   * («vendite registro» trova «Registro vendite negozio»). A query vuota
   * restano le sole voci nav, come indice rapido.
   */
  private readonly pageMatches = computed<readonly SearchResultItem[]>(() => {
    const term = this.query().trim().toLowerCase();
    if (!term) {
      return this.pageCatalog().filter((item) => item.primary);
    }
    const tokens = term.split(/\s+/);
    return this.pageCatalog().filter((item) => {
      const haystack = `${item.label} ${item.sub ?? ''}`.toLowerCase();
      return tokens.every((token) => haystack.includes(token));
    });
  });

  /** Lista piatta per la navigazione da tastiera: pagine prima, poi entita'. */
  protected readonly results = computed<readonly SearchResultItem[]>(() => [
    ...this.pageMatches(),
    ...this.remote().items,
  ]);

  /** true mentre il debounce/la rete non hanno ancora raggiunto la query. */
  protected readonly searching = computed(() => {
    const term = this.query().trim();
    return term.length >= MIN_SEARCH_LENGTH && this.remote().term !== term;
  });

  protected readonly showNoResults = computed(
    () =>
      !this.searching() &&
      this.query().trim().length >= MIN_SEARCH_LENGTH &&
      this.results().length === 0,
  );

  constructor() {
    // All'apertura: reset e focus sull'input (dopo il render del dialog).
    effect(() => {
      if (this.open()) {
        this.query.set('');
        this.activeIndex.set(0);
        queueMicrotask(() => this.searchInputRef()?.nativeElement.focus());
      }
    });
    // La selezione attiva resta dentro i limiti quando cambiano i risultati.
    effect(() => {
      const count = this.results().length;
      if (this.activeIndex() >= count) {
        this.activeIndex.set(count > 0 ? count - 1 : 0);
      }
    });
  }

  protected onQueryInput(value: string): void {
    this.query.set(value);
    this.activeIndex.set(0);
  }

  protected onKeydown(event: KeyboardEvent): void {
    const count = this.results().length;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (count > 0) {
          this.activeIndex.set((this.activeIndex() + 1) % count);
        }
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (count > 0) {
          this.activeIndex.set((this.activeIndex() - 1 + count) % count);
        }
        break;
      case 'Enter': {
        event.preventDefault();
        const item = this.results()[this.activeIndex()];
        if (item) {
          this.openResult(item);
        }
        break;
      }
      case 'Escape':
        event.preventDefault();
        this.requestClose();
        break;
    }
  }

  protected openResult(item: SearchResultItem): void {
    void this.router.navigate([item.route], { queryParams: item.queryParams ?? {} });
    this.requestClose();
  }

  protected requestClose(): void {
    this.closed.emit();
  }

  /** Indice piatto della voce nel gruppo corrente (per l'evidenziazione). */
  protected flatIndexOf(item: SearchResultItem): number {
    return this.results().indexOf(item);
  }

  /** Gruppi ordinati per la resa a sezioni. */
  protected readonly groups = computed(() => {
    const order: string[] = [];
    const byGroup = new Map<string, SearchResultItem[]>();
    for (const item of this.results()) {
      if (!byGroup.has(item.group)) {
        order.push(item.group);
        byGroup.set(item.group, []);
      }
      byGroup.get(item.group)!.push(item);
    }
    return order.map((name) => ({ name, items: byGroup.get(name)! }));
  });
}
