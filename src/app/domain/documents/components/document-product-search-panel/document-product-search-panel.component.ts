import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { catchError, debounceTime, of, switchMap } from 'rxjs';

import type { VariantSummary } from '@domain/products/models/variant-summary.model';
import { ProductSearchResultsComponent } from '@domain/products/components/product-search-results/product-search-results.component';
import { ProductService } from '@domain/products/services/product.service';
import { ButtonComponent } from '@shared/components/button/button.component';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';

const SEARCH_DEBOUNCE_MS = 300;

@Component({
  selector: 'app-document-product-search-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, ButtonComponent, EmptyStateComponent, ProductSearchResultsComponent],
  templateUrl: './document-product-search-panel.component.html',
  styleUrl: './document-product-search-panel.component.scss',
})
export class DocumentProductSearchPanelComponent {
  /** Termine catturato all'apertura del pannello (campo griglia). */
  readonly launchTerm = input('');
  /** Incrementato a ogni apertura: reinizializza la query senza sovrascriverla durante la digitazione. */
  readonly launchSeq = input(0);
  readonly locationId = input<string | null>(null);

  readonly variantSelected = output<{ readonly variantId: string }>();
  /**
   * L'articolo non c'è e va creato. Il pannello non sa COME si crea — i campi
   * da precompilare stanno nella riga del documento, che è della maschera —
   * quindi chiede, e chi lo ospita apre l'anagrafica con quel che ha.
   */
  readonly createRequested = output<void>();
  /** Apri la scheda di un articolo trovato, invece di aggiungerlo alla riga. */
  readonly detailRequested = output<string>();
  readonly dismissed = output<void>();

  private readonly productService = inject(ProductService);

  protected readonly searchQuery = signal('');
  /** Forza riesecuzione ricerca anche se il testo non cambia (Invio / pulsante Cerca). */
  private readonly searchRevision = signal(0);

  private readonly searchResults = toSignal(
    toObservable(
      computed(() => ({
        query: this.searchQuery(),
        revision: this.searchRevision(),
        locationId: this.locationId(),
      })),
    ).pipe(
      debounceTime(SEARCH_DEBOUNCE_MS),
      switchMap(({ query, locationId }) => {
        const trimmed = query.trim();
        if (trimmed.length === 0) {
          return of([] as readonly VariantSummary[]);
        }
        return this.productService
          .searchVariantSummaries({
            search: trimmed,
            locationId: locationId ?? undefined,
            pageSize: 40,
          })
          .pipe(catchError(() => of([] as readonly VariantSummary[])));
      }),
    ),
    { initialValue: [] as readonly VariantSummary[] },
  );

  protected readonly results = computed(() => this.searchResults() ?? []);

  constructor() {
    effect(() => {
      this.launchSeq();
      this.searchQuery.set(untracked(() => this.launchTerm()));
      this.searchRevision.update((value) => value + 1);
    });
  }

  protected onSearchInput(value: string): void {
    this.searchQuery.set(value);
    this.searchRevision.update((value) => value + 1);
  }

  protected runSearch(): void {
    this.searchRevision.update((value) => value + 1);
  }

  protected onSearchKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.runSearch();
    }
  }

  protected selectVariant(variantId: string): void {
    this.variantSelected.emit({ variantId });
  }

  protected close(): void {
    this.dismissed.emit();
  }

  protected requestCreate(): void {
    this.createRequested.emit();
  }

  protected requestDetail(productId: string): void {
    this.detailRequested.emit(productId);
  }
}
