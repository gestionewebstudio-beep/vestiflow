import { DocumentType } from '@core/models/document.model';
import { canCreateDocumentType } from '@core/permissions/document-permission.util';
import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
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
import { catchError, debounceTime, forkJoin, map, of, switchMap, type Observable } from 'rxjs';

import { formatDate } from '@core/utils/date.util';
import { customerDisplayName } from '@core/models/customer.model';
import { CustomerService } from '@domain/customers/services/customer.service';
import { DocumentService } from '@domain/documents/services/document.service';
import {
  documentReferenceLabel,
  documentTypeLabel,
} from '@domain/documents/models/document-labels.util';
import { ProductService } from '@domain/products/services/product.service';
import { SalesOrderService } from '@domain/sales-orders/services/sales-order.service';
import { SupplierOrderService } from '@domain/supplier-orders/services/supplier-order.service';
import { SupplierService } from '@domain/suppliers/services/supplier.service';
import { DOCUMENT_HUB_GROUPS } from '@features/documents/models/documents-hub.model';
import { AuthService } from '@core/auth';
import { documentOpenPath } from '@domain/documents/utils/document-routing.util';
import { salesOrderRowPath } from '@domain/sales-orders/models/sales-order-routing.util';
import {
  SALES_DOCUMENT_REGISTER_PROFILES,
  salesDocumentRegisterConfig,
} from '@features/documents/models/document-sales-register.config';
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
 * Match tollerante singolare/plurale/genere italiano: il token combacia
 * com'e', oppure senza la vocale finale («ordine fornitore» trova «Ordini
 * fornitori», «preventivo» trova «Preventivi»).
 */
function tokenMatches(haystack: string, token: string): boolean {
  if (haystack.includes(token)) {
    return true;
  }
  return token.length > 3 && /[aeiou]$/.test(token) && haystack.includes(token.slice(0, -1));
}

/**
 * Ricerca globale ⌘K (riferimento v4): palette con navigazione rapida alle
 * pagine (voci nav gia' filtrate per permessi dallo shell) e ricerca live su
 * prodotti, clienti, fornitori, documenti e ordini in parallelo, ciascuna
 * fonte attiva solo se la sezione corrispondente e' raggiungibile dall'utente.
 * Smart di proposito: vive nel layout accanto allo shell, non tra i
 * componenti condivisi dumb.
 */
@Component({
  selector: 'app-global-search',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgClass, InlineSpinnerComponent],
  templateUrl: './global-search.component.html',
  styleUrl: './global-search.component.scss',
})
export class GlobalSearchComponent {
  // Serve a `documentOpenPath`: dove porta un risultato dipende da che
  // cosa questo utente puo' aprire, o la ricerca globale manderebbe chi
  // consulta e basta contro il guard di una rotta di modifica (`14` §2.1).
  private readonly authService = inject(AuthService);
  private readonly document = inject(DOCUMENT);
  private readonly router = inject(Router);
  private readonly productService = inject(ProductService);
  private readonly customerService = inject(CustomerService);
  private readonly documentService = inject(DocumentService);
  private readonly supplierService = inject(SupplierService);
  private readonly supplierOrderService = inject(SupplierOrderService);
  private readonly salesOrderService = inject(SalesOrderService);

  /** Palette visibile. Lo shell la apre (click topbar o Ctrl/⌘+K). */
  readonly open = input.required<boolean>();
  /** Sezioni nav dello shell: fonte delle pagine navigabili (permessi inclusi). */
  readonly navSections = input<readonly NavSection[]>([]);
  readonly closed = output<void>();

  private readonly searchInputRef = viewChild<ElementRef<HTMLInputElement>>('searchInput');
  private readonly dialogRef = viewChild<ElementRef<HTMLElement>>('dialog');
  private readonly resultsRef = viewChild<ElementRef<HTMLElement>>('resultsList');

  protected readonly query = signal('');
  protected readonly activeIndex = signal(0);

  /** Elemento con il focus prima dell'apertura: ripristinato alla chiusura. */
  private previouslyFocused: HTMLElement | null = null;

  /**
   * Route base raggiungibili dalla nav (gia' filtrata per permessi dallo
   * shell): guardia sia per il catalogo pagine sia per le fonti remote.
   */
  private readonly allowedRoots = computed(
    () =>
      new Set(
        this.navSections().flatMap((section) =>
          section.items
            .filter((item) => !item.disabled)
            .map((item) => item.activeRoutePrefix ?? item.route),
        ),
      ),
  );

  /** Ricerca remota debounced sulle entita' di business, in parallelo. */
  private readonly remote = toSignal(
    toObservable(this.query).pipe(
      debounceTime(SEARCH_DEBOUNCE_MS),
      switchMap((raw) => {
        const term = raw.trim();
        if (term.length < MIN_SEARCH_LENGTH) {
          return of(EMPTY_REMOTE);
        }
        const paging = { page: 1, pageSize: RESULTS_PER_SOURCE, search: term };
        // Le fonti non raggiungibili dall'utente non vengono nemmeno chiamate
        // (factory lazy): il backend risponderebbe comunque 403, ma senza
        // rumore di rete.
        const source = <T>(allowed: boolean, request: () => Observable<readonly T[]>) =>
          allowed ? request().pipe(catchError(() => of<readonly T[]>([]))) : of<readonly T[]>([]);
        return forkJoin({
          products: source(this.isAllowed('/app/products'), () =>
            this.productService.getProducts(paging).pipe(map((res) => res.data)),
          ),
          customers: source(this.isAllowed('/app/customers'), () =>
            this.customerService.getCustomers(paging).pipe(map((res) => res.data)),
          ),
          suppliers: source(this.isAllowed('/app/suppliers'), () =>
            this.supplierService.list(paging).pipe(map((res) => res.data)),
          ),
          supplierOrders: source(this.isAllowed('/app/suppliers'), () =>
            this.supplierOrderService.getSupplierOrders(paging).pipe(map((res) => res.data)),
          ),
          salesOrders: source(this.isAllowed('/app/sales'), () =>
            this.salesOrderService.getSalesOrders(paging).pipe(map((res) => res.data)),
          ),
          documents: source(this.isAllowed('/app/documents'), () =>
            this.documentService.getDocuments(paging).pipe(map((res) => res.data)),
          ),
        }).pipe(
          map(
            ({
              products,
              customers,
              suppliers,
              supplierOrders,
              salesOrders,
              documents,
            }): RemoteResults => {
              const items: SearchResultItem[] = [
                ...products.map((product) => ({
                  group: 'Prodotti',
                  label: product.name,
                  // Codice articolo in evidenza: la ricerca lo accetta come
                  // criterio (§ricerca globale) e il risultato lo conferma.
                  sub:
                    [product.articleCode, product.brand].filter(Boolean).join(' · ') || undefined,
                  icon: 'pi-tag',
                  route: `/app/products/${product.id}`,
                })),
                ...customers.map((customer) => ({
                  group: 'Clienti',
                  // Nome azienda o nominativo: un cliente business ha il solo
                  // companyName e senza questa scelta la riga uscirebbe vuota.
                  label: customerDisplayName(customer),
                  sub: [customer.code, customer.email].filter(Boolean).join(' · ') || undefined,
                  icon: 'pi-users',
                  route: `/app/customers/${customer.id}`,
                })),
                ...suppliers.map((supplier) => ({
                  group: 'Fornitori',
                  label: supplier.name,
                  sub: [supplier.code, supplier.email].filter(Boolean).join(' · ') || undefined,
                  icon: 'pi-building',
                  route: `/app/suppliers/${supplier.id}`,
                })),
                ...supplierOrders.map((order) => ({
                  group: 'Ordini fornitore',
                  label: order.reference,
                  sub: [order.supplierName, formatDate(order.orderDate)]
                    .filter(Boolean)
                    .join(' · '),
                  icon: 'pi-shopping-bag',
                  // ⛔ Qui c’era `/app/orders/${order.id}` CABLATA, cioè il Dettaglio,
                  //   mentre il clic sulla riga dell’elenco apre la Modifica: lo stesso
                  //   ordine aveva DUE aperture a seconda di dove lo si era trovato.
                  //
                  // ⚠️ Il commit 166e7cb dichiarava la parità già ottenuta — «vale anche
                  //   per la ricerca globale, `documentOpenPath` delega alla stessa
                  //   funzione». Vero per i documenti veri, FALSO per i due ordini, che
                  //   non hanno mai una riga in `documents` (schema: «questo enum è le
                  //   chiavi dei numeratori, non l’elenco dei documenti») e arrivano qui
                  //   da una sorgente propria.
                  route: documentOpenPath(
                    { id: order.id, type: DocumentType.SupplierOrder },
                    this.authService.currentUser(),
                  ),
                })),
                ...salesOrders.map((order) => ({
                  group: 'Ordini cliente',
                  label: order.orderNumber,
                  sub: [order.customerName, formatDate(order.placedAt)].filter(Boolean).join(' · '),
                  icon: 'pi-shopping-cart',
                  // ⛔ Qui c’era `/app/sales/${order.id}` CABLATA. Sostituirla con
                  //   `documentOpenPath({ type: CustomerOrder })` sarebbe stato un
                  //   errore diverso: la ricerca restituisce ordini di OGNI origine
                  //   — `manual`, `online`, `pos` — e solo il primo è un Ordine
                  //   cliente del gestionale. Gli altri due sono posseduti dal
                  //   canale e sono read-only per regola.
                  route: salesOrderRowPath(order, this.authService.currentUser()),
                })),
                ...documents.map((doc) => ({
                  group: 'Documenti',
                  label: documentReferenceLabel(doc.type, doc.reference, doc.series),
                  sub: [
                    documentTypeLabel(doc.type),
                    doc.customerName ?? doc.supplierName,
                    formatDate(doc.documentDate),
                  ]
                    .filter(Boolean)
                    .join(' · '),
                  icon: 'pi-file',
                  // Apertura per tipo: preventivi/fatture/DDT hanno dettagli
                  // dedicati, gli arrivi merce vivono nel form.
                  route: documentOpenPath(doc, this.authService.currentUser()),
                })),
              ];
              return { term, items };
            },
          ),
        );
      }),
    ),
    { initialValue: EMPTY_REMOTE },
  );

  /**
   * Voci remote coerenti con la query corrente: sotto la soglia di ricerca i
   * risultati della query precedente non restano in lista durante il debounce.
   */
  private readonly remoteItems = computed<readonly SearchResultItem[]>(() =>
    this.query().trim().length >= MIN_SEARCH_LENGTH ? this.remote().items : [],
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

    if (this.isAllowed('/app/documents')) {
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
      // Azioni «Nuovo …» dei documenti: derivate dalle config delle pagine
      // dedicate — un profilo aggiunto domani compare qui senza doppioni.
      for (const profile of SALES_DOCUMENT_REGISTER_PROFILES) {
        const config = salesDocumentRegisterConfig(profile);
        if (!config || config.hideCreateAction) {
          continue;
        }
        // ⛔ Vendita manuale spenta: qui sparisce solo «Nuova vendita manuale».
        //   La voce «Pagine» qui sopra RESTA: porta all’elenco, che e’ la strada
        //   allo storico e deve restare percorribile.
        if (!canCreateDocumentType(this.authService.currentUser(), config.type)) {
          continue;
        }
        const variants: readonly { label: string; path: string }[] = config.createVariants ?? [
          { label: config.createLabel, path: config.createPath },
        ];
        for (const variant of variants) {
          push({ group: 'Pagine', label: variant.label, icon: 'pi-plus', route: variant.path });
        }
      }
    }

    for (const page of SECONDARY_PAGES) {
      if (this.isAllowed(page.parent)) {
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
   * («vendite registro» trova «Registro vendite al banco»). A query vuota
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
      return tokens.every((token) => tokenMatches(haystack, token));
    });
  });

  /** Lista piatta per la navigazione da tastiera: pagine prima, poi entita'. */
  protected readonly results = computed<readonly SearchResultItem[]>(() => [
    ...this.pageMatches(),
    ...this.remoteItems(),
  ]);

  /** Indice piatto per voce: evita l'indexOf O(n) per riga nel template. */
  private readonly indexByItem = computed(() => {
    const indices = new Map<SearchResultItem, number>();
    this.results().forEach((item, index) => indices.set(item, index));
    return indices;
  });

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

  constructor() {
    // All'apertura: reset e focus sull'input (dopo il render del dialog);
    // alla chiusura il focus torna dov'era (focus restore da regole a11y).
    effect(() => {
      if (this.open()) {
        this.previouslyFocused = (this.document.activeElement as HTMLElement | null) ?? null;
        this.query.set('');
        this.activeIndex.set(0);
        queueMicrotask(() => this.searchInputRef()?.nativeElement.focus());
      } else if (this.previouslyFocused) {
        const target = this.previouslyFocused;
        this.previouslyFocused = null;
        queueMicrotask(() => target.focus());
      }
    });
    // La selezione attiva resta dentro i limiti quando cambiano i risultati.
    effect(() => {
      const count = this.results().length;
      if (this.activeIndex() >= count) {
        this.activeIndex.set(count > 0 ? count - 1 : 0);
      }
    });
    // La voce attiva resta visibile durante la navigazione da tastiera.
    effect(() => {
      const index = this.activeIndex();
      this.results();
      queueMicrotask(() => {
        this.resultsRef()
          ?.nativeElement.querySelector(`#gsearch-option-${index}`)
          ?.scrollIntoView({ block: 'nearest' });
      });
    });
  }

  protected onQueryInput(value: string): void {
    this.query.set(value);
    this.activeIndex.set(0);
  }

  /**
   * Tastiera a livello di dialog: frecce/Invio/Escape funzionano anche quando
   * il focus e' su un risultato o sul bottone di chiusura, e Tab resta
   * intrappolato dentro la palette (focus trap da regole a11y).
   */
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
        // Il bottone di chiusura mantiene il proprio Invio nativo.
        if (event.target instanceof HTMLElement && event.target.closest('.gsearch__close')) {
          break;
        }
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
      case 'Tab':
        this.trapFocus(event);
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
    return this.indexByItem().get(item) ?? -1;
  }

  private isAllowed(parent: string): boolean {
    return [...this.allowedRoots()].some(
      (root) => root.startsWith(parent) || parent.startsWith(root),
    );
  }

  /** Tab/Shift+Tab ciclano tra i controlli della palette senza uscirne. */
  private trapFocus(event: KeyboardEvent): void {
    const dialog = this.dialogRef()?.nativeElement;
    if (!dialog) {
      return;
    }
    const focusables = Array.from(dialog.querySelectorAll<HTMLElement>('button, input'));
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (!first || !last) {
      return;
    }
    const active = this.document.activeElement;
    if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    } else if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    }
  }
}
