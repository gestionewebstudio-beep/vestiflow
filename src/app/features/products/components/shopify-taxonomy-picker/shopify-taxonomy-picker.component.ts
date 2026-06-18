import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { catchError, debounceTime, distinctUntilChanged, of, switchMap, tap } from 'rxjs';

import { InlineSpinnerComponent } from '@shared/components/inline-spinner/inline-spinner.component';

import type { ShopifyTaxonomyCategory } from '@features/integrations/shopify/services/shopify-taxonomy.service';
import { ShopifyTaxonomyService } from '@features/integrations/shopify/services/shopify-taxonomy.service';

export interface ShopifyTaxonomySelection {
  readonly id: string;
  readonly fullName: string;
}

@Component({
  selector: 'app-shopify-taxonomy-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, InlineSpinnerComponent],
  templateUrl: './shopify-taxonomy-picker.component.html',
  styleUrl: './shopify-taxonomy-picker.component.scss',
})
export class ShopifyTaxonomyPickerComponent {
  private readonly taxonomyService = inject(ShopifyTaxonomyService);
  private readonly destroyRef = inject(DestroyRef);

  readonly categoryId = input<string>('');
  readonly categoryFullName = input<string>('');
  readonly invalid = input(false);
  readonly describedBy = input<string | undefined>(undefined);

  readonly selectionChange = output<ShopifyTaxonomySelection | null>();

  protected readonly searchQuery = signal('');
  protected readonly loading = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly items = signal<readonly ShopifyTaxonomyCategory[]>([]);
  protected readonly parentStack = signal<readonly ShopifyTaxonomyCategory[]>([]);

  constructor() {
    toObservable(this.searchQuery)
      .pipe(
        debounceTime(250),
        distinctUntilChanged(),
        tap(() => {
          this.loading.set(true);
          this.loadError.set(null);
        }),
        switchMap((query) => {
          const parent = this.parentStack().at(-1);
          const trimmed = query.trim();
          if (trimmed) {
            return this.taxonomyService.listCategories({ search: trimmed }).pipe(
              catchError(() => {
                this.loadError.set('Impossibile cercare le categorie Shopify.');
                return of([] as readonly ShopifyTaxonomyCategory[]);
              }),
            );
          }
          return this.taxonomyService.listCategories({ childrenOf: parent?.id }).pipe(
            catchError(() => {
              this.loadError.set('Impossibile caricare le categorie Shopify.');
              return of([] as readonly ShopifyTaxonomyCategory[]);
            }),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((categories) => {
        this.items.set(categories);
        this.loading.set(false);
      });

    // Caricamento iniziale radice taxonomy.
    this.taxonomyService
      .listCategories({})
      .pipe(
        catchError(() => of([] as readonly ShopifyTaxonomyCategory[])),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((categories) => this.items.set(categories));
  }

  protected onSearchInput(value: string): void {
    this.searchQuery.set(value);
    if (value.trim()) {
      this.parentStack.set([]);
    }
  }

  protected onCategoryClick(category: ShopifyTaxonomyCategory): void {
    if (category.isLeaf) {
      this.selectionChange.emit({ id: category.id, fullName: category.fullName });
      this.searchQuery.set('');
      this.parentStack.set([]);
      return;
    }

    this.parentStack.update((stack) => [...stack, category]);
    this.searchQuery.set('');
    this.loading.set(true);
    this.taxonomyService
      .listCategories({ childrenOf: category.id })
      .pipe(
        catchError(() => of([] as readonly ShopifyTaxonomyCategory[])),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((children) => {
        this.items.set(children);
        this.loading.set(false);
      });
  }

  protected goBack(): void {
    const stack = this.parentStack();
    if (stack.length === 0) {
      return;
    }
    const nextStack = stack.slice(0, -1);
    this.parentStack.set(nextStack);
    this.searchQuery.set('');
    this.loading.set(true);
    const parentId = nextStack.at(-1)?.id;
    this.taxonomyService
      .listCategories(parentId ? { childrenOf: parentId } : {})
      .pipe(
        catchError(() => of([] as readonly ShopifyTaxonomyCategory[])),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((categories) => {
        this.items.set(categories);
        this.loading.set(false);
      });
  }

  protected clearSelection(): void {
    this.selectionChange.emit(null);
  }

  protected breadcrumbLabel(): string {
    const stack = this.parentStack();
    if (stack.length === 0) {
      return 'Tutte le categorie';
    }
    return stack.map((entry) => entry.name).join(' › ');
  }

  protected hasSelection(): boolean {
    return Boolean(this.categoryId().trim() && this.categoryFullName().trim());
  }
}
