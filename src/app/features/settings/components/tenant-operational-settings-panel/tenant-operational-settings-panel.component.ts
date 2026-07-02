import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { catchError, of } from 'rxjs';

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

@Component({
  selector: 'app-tenant-operational-settings-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, ButtonComponent, ErrorStateComponent, TableSkeletonComponent],
  templateUrl: './tenant-operational-settings-panel.component.html',
  styleUrl: './tenant-operational-settings-panel.component.scss',
})
export class TenantOperationalSettingsPanelComponent {
  private readonly service = inject(TenantFeatureSettingsService);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly pricePolicyOptions = PRICE_POLICY_OPTIONS;
  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);
  protected readonly saving = signal(false);
  protected readonly saveMessage = signal<string | null>(null);
  protected readonly saveError = signal<string | null>(null);

  protected readonly form = this.fb.group({
    lotsEnabled: this.fb.control(false),
    serialsEnabled: this.fb.control(false),
    updateSupplierPriceOnLoad: this.fb.control<SupplierPriceUpdatePolicy>('ask'),
    defaultUnitOfMeasure: this.fb.control('pz'),
    defaultVatRatePercent: this.fb.control(22),
    warnNegativeInventory: this.fb.control(true),
    blockNegativeInventory: this.fb.control(false),
  });

  constructor() {
    this.reload();
  }

  protected reload(): void {
    this.loading.set(true);
    this.loadError.set(false);
    this.service
      .getSettings()
      .pipe(
        catchError(() => {
          this.loadError.set(true);
          return of(null);
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((settings) => {
        this.loading.set(false);
        if (!settings) {
          return;
        }
        this.form.patchValue({
          lotsEnabled: settings.lotsEnabled,
          serialsEnabled: settings.serialsEnabled,
          updateSupplierPriceOnLoad: settings.updateSupplierPriceOnLoad,
          defaultUnitOfMeasure: settings.defaultUnitOfMeasure,
          defaultVatRatePercent: settings.defaultVatRatePercent,
          warnNegativeInventory: settings.warnNegativeInventory,
          blockNegativeInventory: settings.blockNegativeInventory,
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
    this.service
      .updateSettings(this.form.getRawValue())
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
