import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin, of, switchMap } from 'rxjs';

import { AuthService } from '@core/auth';
import { APP_CONFIG } from '@core/config/app-config.token';
import { canManageInventory } from '@core/permissions/tenant-permissions.util';
import { AppErrorKind, isAppError } from '@core/models/app-error.model';
import type { AppError } from '@core/models/app-error.model';
import type { InventoryLevel } from '@core/models/inventory-level.model';
import type { Location } from '@core/models/location.model';
import { LocationContextService } from '@core/services/location-context.service';
import { OperationalLocationsService } from '@core/services/operational-locations.service';
import { PwaInstallService } from '@core/services/pwa-install.service';
import { ButtonComponent } from '@shared/components/button/button.component';
import { BarcodeScannerComponent } from '@shared/components/barcode-scanner/barcode-scanner.component';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { TableSkeletonComponent } from '@shared/components/table-skeleton/table-skeleton.component';

import type { VariantByCodeDto } from '@features/products/models/product.dto';
import { ProductService } from '@features/products/services/product.service';

import { InventoryTabsComponent } from './components/inventory-tabs/inventory-tabs.component';
import { InventoryService } from './services/inventory.service';

type LookupState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | {
      readonly status: 'success';
      readonly variant: VariantByCodeDto;
      readonly levels: readonly InventoryLevel[];
      readonly locations: readonly Location[];
    }
  | { readonly status: 'not-found' }
  | { readonly status: 'error'; readonly error: AppError };

/**
 * Ricerca rapida SKU/barcode per magazzino mobile (PWA). Mostra giacenze per
 * location e link a movimento o dettaglio prodotto.
 */
@Component({
  selector: 'app-stock-lookup',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    ButtonComponent,
    BarcodeScannerComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    TableSkeletonComponent,
    InventoryTabsComponent,
  ],
  templateUrl: './stock-lookup.component.html',
  styleUrl: './stock-lookup.component.scss',
})
export class StockLookupComponent {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly authService = inject(AuthService);
  private readonly productService = inject(ProductService);
  private readonly inventoryService = inject(InventoryService);
  private readonly operationalLocations = inject(OperationalLocationsService);
  private readonly locationContext = inject(LocationContextService);
  private readonly pwaInstall = inject(PwaInstallService);
  private readonly config = inject(APP_CONFIG);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly barcodeScannerEnabled = this.config.features.barcodeScanner;

  protected readonly canInstallPwa = this.pwaInstall.canInstall;

  protected readonly lookupState = signal<LookupState>({ status: 'idle' });

  protected readonly canManageInventory = computed(() =>
    canManageInventory(this.authService.currentUser()),
  );

  protected readonly searchForm = this.fb.group({
    code: this.fb.control('', { validators: [Validators.required, Validators.maxLength(100)] }),
  });

  protected lookup(): void {
    if (this.searchForm.invalid) {
      this.searchForm.markAllAsTouched();
      return;
    }

    const code = this.searchForm.controls.code.value.trim();
    this.lookupState.set({ status: 'loading' });

    this.productService
      .findVariantByCode(code)
      .pipe(
        switchMap((variant) =>
          forkJoin({
            variant: of(variant),
            levels: this.inventoryService.getLevelsByVariant(variant.variantId),
            locations: this.inventoryService.getLocations(),
          }),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: ({ variant, levels, locations }) => {
          const operationalIds = new Set(
            this.operationalLocations.locations().map((location) => location.id),
          );
          this.lookupState.set({
            status: 'success',
            variant,
            levels: levels.filter((level) => operationalIds.has(level.locationId)),
            locations: locations.filter((location) => operationalIds.has(location.id)),
          });
        },
        error: (err: unknown) => {
          this.lookupState.set(this.toErrorState(err));
        },
      });
  }

  protected onScanned(code: string): void {
    this.searchForm.controls.code.setValue(code);
    this.lookup();
  }

  protected async installApp(): Promise<void> {
    await this.pwaInstall.promptInstall();
  }

  protected movementQueryParams(variantId: string): { variantId: string } {
    return { variantId };
  }

  protected isActiveLocation(locationId: string): boolean {
    return this.locationContext.activeLocationId() === locationId;
  }

  protected locationName(locationId: string, locations: readonly Location[]): string {
    return locations.find((location) => location.id === locationId)?.name ?? locationId;
  }

  private toErrorState(err: unknown): LookupState {
    const appError = isAppError(err)
      ? err
      : ({ kind: AppErrorKind.Unknown, message: 'Ricerca non riuscita.' } satisfies AppError);
    if (appError.kind === AppErrorKind.NotFound) {
      return { status: 'not-found' };
    }
    return { status: 'error', error: appError };
  }
}
