import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { catchError, distinctUntilChanged, of, switchMap, tap } from 'rxjs';

import type { ShopifyCategoryMetafieldValue } from '@core/models/shopify-category-metafield.model';
import { InlineSpinnerComponent } from '@shared/components/inline-spinner/inline-spinner.component';
import { SelectMenuComponent } from '@shared/components/select-menu/select-menu.component';
import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';

import type { ShopifyTaxonomyCategoryAttribute } from '@features/integrations/shopify/services/shopify-taxonomy.service';
import { ShopifyTaxonomyService } from '@features/integrations/shopify/services/shopify-taxonomy.service';

@Component({
  selector: 'app-shopify-category-attributes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SelectMenuComponent, InlineSpinnerComponent],
  templateUrl: './shopify-category-attributes.component.html',
  styleUrl: './shopify-category-attributes.component.scss',
})
export class ShopifyCategoryAttributesComponent {
  private readonly taxonomyService = inject(ShopifyTaxonomyService);
  private readonly destroyRef = inject(DestroyRef);

  readonly categoryId = input('');
  readonly values = input<readonly ShopifyCategoryMetafieldValue[]>([]);

  readonly valuesChange = output<readonly ShopifyCategoryMetafieldValue[]>();

  protected readonly loading = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly attributes = signal<readonly ShopifyTaxonomyCategoryAttribute[]>([]);

  constructor() {
    toObservable(this.categoryId)
      .pipe(
        distinctUntilChanged(),
        tap(() => {
          this.loading.set(true);
          this.loadError.set(null);
        }),
        switchMap((categoryId) => {
          const trimmed = categoryId.trim();
          if (!trimmed) {
            this.attributes.set([]);
            return of([] as readonly ShopifyTaxonomyCategoryAttribute[]);
          }
          return this.taxonomyService.listCategoryAttributes(trimmed).pipe(
            catchError(() => {
              this.loadError.set('Impossibile caricare gli attributi categoria Shopify.');
              return of([] as readonly ShopifyTaxonomyCategoryAttribute[]);
            }),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((items) => {
        this.attributes.set(items);
        this.loading.set(false);
      });

    effect(() => {
      const categoryId = this.categoryId().trim();
      const attrs = this.attributes();
      if (!categoryId || attrs.length === 0) {
        return;
      }
      this.syncValuesWithAttributes(attrs);
    });
  }

  protected attributeOptions(
    attribute: ShopifyTaxonomyCategoryAttribute,
  ): readonly SelectMenuOption[] {
    return attribute.values.map((value) => ({ value: value.id, label: value.name }));
  }

  protected selectedValueId(attribute: ShopifyTaxonomyCategoryAttribute): string | null {
    const current = this.values().find((entry) => entry.attributeId === attribute.id);
    return current?.values[0]?.id ?? null;
  }

  protected onAttributeSelect(
    attribute: ShopifyTaxonomyCategoryAttribute,
    taxonomyValueId: string | null,
  ): void {
    const others = this.values().filter((entry) => entry.attributeId !== attribute.id);
    if (!taxonomyValueId) {
      this.valuesChange.emit(others);
      return;
    }

    const selected = attribute.values.find((value) => value.id === taxonomyValueId);
    if (!selected) {
      return;
    }

    this.valuesChange.emit([
      ...others,
      {
        attributeId: attribute.id,
        attributeName: attribute.name,
        namespace: attribute.namespace,
        key: attribute.key,
        metafieldType: attribute.metafieldType,
        values: [{ id: selected.id, name: selected.name }],
      },
    ]);
  }

  private syncValuesWithAttributes(attrs: readonly ShopifyTaxonomyCategoryAttribute[]): void {
    const allowedIds = new Set(attrs.map((entry) => entry.id));
    const filtered = this.values().filter((entry) => allowedIds.has(entry.attributeId));
    if (filtered.length !== this.values().length) {
      this.valuesChange.emit(filtered);
    }
  }
}
