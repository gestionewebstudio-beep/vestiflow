import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of, startWith, switchMap } from 'rxjs';

import { AuthService } from '@core/auth';
import { canManageCatalog } from '@core/permissions/tenant-permissions.util';
import type { EntityId } from '@core/models/common.model';
import type { SupplierVariantLink } from '@core/models/supplier.model';
import { formatMoney } from '@core/utils/money.util';
import { SupplierService } from '@features/suppliers/services/supplier.service';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';
import { TableSkeletonComponent } from '@shared/components/table-skeleton/table-skeleton.component';

@Component({
  selector: 'app-product-supplier-links',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EmptyStateComponent, TableSkeletonComponent],
  templateUrl: './product-supplier-links.component.html',
  styleUrl: './product-supplier-links.component.scss',
})
export class ProductSupplierLinksComponent {
  private readonly supplierService = inject(SupplierService);
  private readonly authService = inject(AuthService);

  readonly productId = input.required<EntityId>();

  protected readonly canManage = computed(() => canManageCatalog(this.authService.currentUser()));
  private readonly refreshTick = signal(0);

  private readonly request = computed(() => ({
    id: this.productId(),
    tick: this.refreshTick(),
  }));

  private readonly linksState = toSignal(
    toObservable(this.request).pipe(
      switchMap(({ id }) =>
        this.supplierService.getVariantLinksByProduct(id).pipe(
          map((links) => ({ status: 'success' as const, links })),
          startWith({ status: 'loading' as const, links: [] as readonly SupplierVariantLink[] }),
          catchError(() =>
            of({ status: 'error' as const, links: [] as readonly SupplierVariantLink[] }),
          ),
        ),
      ),
    ),
    { initialValue: { status: 'loading' as const, links: [] as readonly SupplierVariantLink[] } },
  );

  protected readonly loading = computed(() => this.linksState().status === 'loading');
  protected readonly links = computed(() => this.linksState().links);

  protected formatPrice(link: SupplierVariantLink): string {
    if (link.lastPurchasePriceMinor == null) {
      return '—';
    }
    return formatMoney({
      amountMinor: link.lastPurchasePriceMinor,
      currencyCode: link.currency,
    });
  }
}
