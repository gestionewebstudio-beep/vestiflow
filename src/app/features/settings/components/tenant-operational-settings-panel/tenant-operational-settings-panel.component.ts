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

import { isPurchaseVatCode, vatCodeOptionLabel, type VatCode } from '@core/models/vat-code.model';
import { VatCodeService } from '@core/services/vat-code.service';
import { ButtonComponent } from '@shared/components/button/button.component';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { TableSkeletonComponent } from '@shared/components/table-skeleton/table-skeleton.component';

import {
  defaultListinoLabel,
  LISTINO_POSITIONS,
} from '@domain/products/models/product-listino.model';
import { TenantFeatureSettingsService } from '@domain/tenant/services/tenant-feature-settings.service';

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
    salesPricesIncludeVat: this.fb.control('gross'),
    defaultUnitOfMeasure: this.fb.control('pz'),
    defaultVatCodeId: this.fb.control(''),
    warnNegativeInventory: this.fb.control(true),
    blockNegativeInventory: this.fb.control(false),
    // Listini aggiuntivi (§B): tre posizioni fisse, nome e attivazione.
    listino1Name: this.fb.control(''),
    listino1Active: this.fb.control(true),
    listino2Name: this.fb.control(''),
    listino2Active: this.fb.control(false),
    listino3Name: this.fb.control(''),
    listino3Active: this.fb.control(false),
  });

  /** Le tre righe della sezione Listini, con il nome di default come segnaposto. */
  protected readonly listinoRows = LISTINO_POSITIONS.map((position) => ({
    position,
    placeholder: defaultListinoLabel(position),
    nameControl: `listino${position}Name` as const,
    activeControl: `listino${position}Active` as const,
    inputId: `tenant-ops-listino-${position}-name`,
  }));

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
          salesPricesIncludeVat: result.settings.salesPricesIncludeVat ? 'gross' : 'net',
          defaultUnitOfMeasure: result.settings.defaultUnitOfMeasure,
          defaultVatCodeId: result.settings.defaultVatCodeId ?? '',
          warnNegativeInventory: result.settings.warnNegativeInventory,
          blockNegativeInventory: result.settings.blockNegativeInventory,
          listino1Name: result.settings.listino1Name ?? '',
          listino1Active: result.settings.listino1Active,
          listino2Name: result.settings.listino2Name ?? '',
          listino2Active: result.settings.listino2Active,
          listino3Name: result.settings.listino3Name ?? '',
          listino3Active: result.settings.listino3Active,
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
        salesPricesIncludeVat: raw.salesPricesIncludeVat === 'gross',
        defaultUnitOfMeasure: raw.defaultUnitOfMeasure,
        defaultVatCodeId: raw.defaultVatCodeId || null,
        warnNegativeInventory: raw.warnNegativeInventory,
        blockNegativeInventory: raw.blockNegativeInventory,
        // Nome vuoto = `null`: il listino torna a chiamarsi «Listino N», non
        // resta senza nome.
        listino1Name: raw.listino1Name.trim() || null,
        listino1Active: raw.listino1Active,
        listino2Name: raw.listino2Name.trim() || null,
        listino2Active: raw.listino2Active,
        listino3Name: raw.listino3Name.trim() || null,
        listino3Active: raw.listino3Active,
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
