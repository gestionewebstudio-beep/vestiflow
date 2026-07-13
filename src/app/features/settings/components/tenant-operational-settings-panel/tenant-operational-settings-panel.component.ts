import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { catchError, forkJoin, of } from 'rxjs';

import {
  isPurchaseVatCode,
  vatCodeOptionLabel,
  type PurchaseCostEntryMode,
  type VatCode,
} from '@core/models/vat-code.model';
import { VatCodeService } from '@core/services/vat-code.service';
import { ButtonComponent } from '@shared/components/button/button.component';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { TableSkeletonComponent } from '@shared/components/table-skeleton/table-skeleton.component';

import type { SupplierPriceUpdatePolicy } from '../../models/tenant-feature-settings.model';
import { TenantFeatureSettingsService } from '../../services/tenant-feature-settings.service';

const PRICE_POLICY_OPTIONS: readonly {
  readonly value: SupplierPriceUpdatePolicy;
  readonly label: string;
}[] = [
  { value: 'always', label: 'Sempre aggiorna' },
  { value: 'ask', label: 'Chiedi conferma' },
  { value: 'never', label: 'Non aggiornare' },
];

const COST_ENTRY_MODE_OPTIONS: readonly {
  readonly value: PurchaseCostEntryMode;
  readonly label: string;
}[] = [
  { value: 'vat_excluded', label: 'Costi netti' },
  { value: 'vat_included', label: 'Costi ivati' },
];

@Component({
  selector: 'app-tenant-operational-settings-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    ButtonComponent,
    ErrorStateComponent,
    TableSkeletonComponent,
  ],
  templateUrl: './tenant-operational-settings-panel.component.html',
  styleUrl: './tenant-operational-settings-panel.component.scss',
})
export class TenantOperationalSettingsPanelComponent {
  private readonly service = inject(TenantFeatureSettingsService);
  private readonly vatCodeService = inject(VatCodeService);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly pricePolicyOptions = PRICE_POLICY_OPTIONS;
  protected readonly costEntryModeOptions = COST_ENTRY_MODE_OPTIONS;
  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);
  protected readonly saving = signal(false);
  protected readonly saveMessage = signal<string | null>(null);
  protected readonly saveError = signal<string | null>(null);

  private readonly vatCodes = signal<readonly VatCode[]>([]);
  /** Voci attive per la tendina + l'eventuale voce selezionata non più attiva. */
  protected readonly vatCodeOptions = computed(() => {
    const selectedId = this.selectedVatCodeId();
    return this.vatCodes()
      .filter((entry) => entry.isActive || entry.id === selectedId)
      .map((entry) => ({ value: entry.id, label: vatCodeOptionLabel(entry) }));
  });
  private readonly selectedVatCodeId = signal<string | null>(null);

  protected readonly form = this.fb.group({
    lotsEnabled: this.fb.control(false),
    serialsEnabled: this.fb.control(false),
    updateSupplierPriceOnLoad: this.fb.control<SupplierPriceUpdatePolicy>('ask'),
    defaultUnitOfMeasure: this.fb.control('pz'),
    defaultVatCodeId: this.fb.control(''),
    defaultPurchaseCostEntryMode: this.fb.control<PurchaseCostEntryMode>('vat_excluded'),
    warnNegativeInventory: this.fb.control(true),
    blockNegativeInventory: this.fb.control(false),
  });

  constructor() {
    this.reload();
  }

  protected reload(): void {
    this.loading.set(true);
    this.loadError.set(false);
    forkJoin({
      settings: this.service.getSettings(),
      vatCodes: this.vatCodeService.list(),
    })
      .pipe(
        catchError(() => {
          this.loadError.set(true);
          return of(null);
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((result) => {
        this.loading.set(false);
        if (!result) {
          return;
        }
        this.vatCodes.set(result.vatCodes.filter(isPurchaseVatCode));
        this.selectedVatCodeId.set(result.settings.defaultVatCodeId);
        this.form.patchValue({
          lotsEnabled: result.settings.lotsEnabled,
          serialsEnabled: result.settings.serialsEnabled,
          updateSupplierPriceOnLoad: result.settings.updateSupplierPriceOnLoad,
          defaultUnitOfMeasure: result.settings.defaultUnitOfMeasure,
          defaultVatCodeId: result.settings.defaultVatCodeId ?? '',
          defaultPurchaseCostEntryMode: result.settings.defaultPurchaseCostEntryMode,
          warnNegativeInventory: result.settings.warnNegativeInventory,
          blockNegativeInventory: result.settings.blockNegativeInventory,
        });
      });
  }

  protected save(): void {
    if (this.saving()) {
      return;
    }
    this.saving.set(true);
    this.saveError.set(null);
    this.saveMessage.set(null);
    const raw = this.form.getRawValue();
    this.service
      .updateSettings({
        lotsEnabled: raw.lotsEnabled,
        serialsEnabled: raw.serialsEnabled,
        updateSupplierPriceOnLoad: raw.updateSupplierPriceOnLoad,
        defaultUnitOfMeasure: raw.defaultUnitOfMeasure,
        defaultVatCodeId: raw.defaultVatCodeId || null,
        defaultPurchaseCostEntryMode: raw.defaultPurchaseCostEntryMode,
        warnNegativeInventory: raw.warnNegativeInventory,
        blockNegativeInventory: raw.blockNegativeInventory,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.saveMessage.set('Impostazioni operative salvate.');
        },
        error: () => {
          this.saving.set(false);
          this.saveError.set('Salvataggio non riuscito. Riprova.');
        },
      });
  }
}
