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

import {
  VARIANT_SEARCH_DEBOUNCE_MS,
  VARIANT_SEARCH_PAGE_SIZE,
} from '@domain/documents/utils/document-variant-search.config';
import { AuthService } from '@core/auth';
import { canManageCatalog } from '@core/permissions/tenant-permissions.util';
import type { VariantSummary } from '@domain/products/models/variant-summary.model';
import { ProductSearchResultsComponent } from '@domain/products/components/product-search-results/product-search-results.component';
import { ProductService } from '@domain/products/services/product.service';
import { ButtonComponent } from '@shared/components/button/button.component';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';

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

  /**
   * «Crea articolo» compare solo se la riga che ha aperto il pannello **non ha
   * già un articolo**.
   *
   * Su una riga agganciata non stai cercando cosa aggiungere: stai guardando
   * quello che c'è, e il pannello è di sola consultazione. Il comando lì non
   * significa niente — e finché c'era portava a una scheda nuova vestita coi
   * codici dell'articolo esistente, cioè un doppione in attesa di essere
   * salvato.
   */
  readonly canCreate = input(true);

  /**
   * Aprire e creare un'anagrafica scrivono sul catalogo: senza il permesso
   * l'API risponde 403 e l'operatore resta col pannello aperto e un errore.
   *
   * Il controllo sta QUI perché qui è passato il gesto: prima viveva sulla
   * cella della riga, con i pulsanti «Apri anagrafica» e «Completa anagrafica»
   * che il riordino delle righe (11/08/2026) ha tolto per portarli dentro
   * questo pannello. Nei chiamanti sarebbe ripetuto quattro volte, e basterebbe
   * dimenticarlo una.
   */
  private readonly auth = inject(AuthService);
  protected readonly puoGestireCatalogo = computed(() => canManageCatalog(this.auth.currentUser()));

  /**
   * «Crea articolo» richiede il permesso **e** una riga senza articolo: sono
   * due domande diverse — «posso?» e «ha senso qui?» — e servono entrambe.
   */
  protected readonly puoCreareArticolo = computed(
    () => this.canCreate() && this.puoGestireCatalogo(),
  );

  /** Non trovare nulla è un bivio se si può creare, un vicolo cieco se no. */
  protected readonly emptyDescription = computed(() =>
    this.puoCreareArticolo()
      ? "Prova con un altro termine, oppure crea l'articolo con i dati che hai già scritto."
      : 'Prova con un altro termine.',
  );

  /**
   * «Crea articolo» in barra solo quando NON è già nello stato vuoto.
   *
   * Il comando è uno, il posto cambia: dove la ricerca non trova niente vive nel
   * riquadro centrale, che è dove l'occhio si trova in quel momento; altrimenti
   * vive in barra, perché si può sapere in partenza che l'articolo non esiste.
   */
  protected readonly showCreateInActions = computed(
    () =>
      this.puoCreareArticolo() &&
      !(this.searchQuery().trim().length > 0 && this.results().length === 0),
  );

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
      debounceTime(VARIANT_SEARCH_DEBOUNCE_MS),
      switchMap(({ query, locationId }) => {
        const trimmed = query.trim();
        if (trimmed.length === 0) {
          return of([] as readonly VariantSummary[]);
        }
        return this.productService
          .searchVariantSummaries({
            search: trimmed,
            locationId: locationId ?? undefined,
            pageSize: VARIANT_SEARCH_PAGE_SIZE,
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
