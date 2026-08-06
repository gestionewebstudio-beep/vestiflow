import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { catchError, forkJoin, of } from 'rxjs';

import type { Location } from '@core/models/location.model';
import { formatDateTime } from '@core/utils/date.util';
import { ButtonComponent } from '@shared/components/button/button.component';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { TableSkeletonComponent } from '@shared/components/table-skeleton/table-skeleton.component';

import { InventoryService } from '@domain/inventory/services/inventory.service';
import {
  FISCAL_DEVICE_BRAND_OPTIONS,
  isFiscalDeviceBrand,
  type FiscalDevice,
} from '@domain/fiscal/models/fiscal-device.model';
import { FiscalDevicesService } from '@domain/fiscal/services/fiscal-devices.service';

/**
 * Impostazioni → Dispositivo fiscale: la stampante RT di ogni sede. Finché una
 * sede non ha un dispositivo abilitato, la cassa resta la registrazione
 * interna non fiscale di sempre — configurarlo qui è il passo che accende
 * l'emissione (il driver di stampa arriva con la tranche successiva).
 */
@Component({
  selector: 'app-fiscal-device-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, ButtonComponent, ErrorStateComponent, TableSkeletonComponent],
  templateUrl: './fiscal-device-panel.component.html',
  styleUrl: './fiscal-device-panel.component.scss',
})
export class FiscalDevicePanelComponent {
  private readonly fiscalDevices = inject(FiscalDevicesService);
  private readonly inventoryService = inject(InventoryService);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly brandOptions = FISCAL_DEVICE_BRAND_OPTIONS;
  protected readonly formatDateTime = formatDateTime;

  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);
  protected readonly saving = signal(false);
  protected readonly saveMessage = signal<string | null>(null);
  protected readonly saveError = signal<string | null>(null);

  private readonly locations = signal<readonly Location[]>([]);
  private readonly devices = signal<ReadonlyMap<string, FiscalDevice>>(new Map());

  /** Sedi operative del tenant: le sole su cui ha senso una stampante. */
  protected readonly locationOptions = computed(() =>
    this.locations()
      .filter((location) => location.isActive && location.licensedInVf)
      .map((location) => ({ value: location.id, label: location.name })),
  );

  protected readonly selectedLocationId = signal<string | null>(null);

  /** Dispositivo della sede selezionata (null = non configurato). */
  protected readonly selectedDevice = computed(() => {
    const locationId = this.selectedLocationId();
    return locationId ? (this.devices().get(locationId) ?? null) : null;
  });

  protected readonly form = this.fb.group({
    brand: this.fb.control('epson'),
    model: this.fb.control(''),
    endpoint: this.fb.control('', {
      validators: [Validators.required, Validators.pattern(/^https?:\/\/\S+$/)],
    }),
    serialNumber: this.fb.control(''),
    enabled: this.fb.control(true),
    notes: this.fb.control(''),
  });

  /**
   * Mappa aliquota → reparto: quattro coppie fisse (le RT hanno pochi
   * reparti). Riga vuota = non usata; si salva solo ciò che è compilato.
   */
  protected readonly departmentRows = Array.from({ length: 4 }, (_, index) => ({
    rateControl: this.fb.control(''),
    departmentControl: this.fb.control(''),
    rateId: `fiscal-device-rate-${index}`,
    departmentId: `fiscal-device-department-${index}`,
  }));

  constructor() {
    this.reload();
  }

  protected reload(): void {
    this.loading.set(true);
    this.loadError.set(false);
    forkJoin({
      locations: this.inventoryService.getLocations(),
      devices: this.fiscalDevices.list(),
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
        this.locations.set(result.locations);
        this.devices.set(new Map(result.devices.map((device) => [device.locationId, device])));
        const firstOption = this.locationOptions()[0];
        if (!this.selectedLocationId() && firstOption) {
          this.selectLocation(firstOption.value);
        } else if (this.selectedLocationId()) {
          this.patchFormFromDevice();
        }
      });
  }

  protected onLocationSelect(event: Event): void {
    this.selectLocation((event.target as HTMLSelectElement).value || null);
  }

  protected save(): void {
    const locationId = this.selectedLocationId();
    if (!locationId || this.saving() || this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.saveError.set(null);
    this.saveMessage.set(null);
    const raw = this.form.getRawValue();
    this.fiscalDevices
      .upsert(locationId, {
        brand: isFiscalDeviceBrand(raw.brand) ? raw.brand : 'other',
        model: raw.model.trim() || undefined,
        endpoint: raw.endpoint.trim(),
        serialNumber: raw.serialNumber.trim() || undefined,
        enabled: raw.enabled,
        vatDepartments: this.collectVatDepartments(),
        notes: raw.notes.trim() || undefined,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (device) => {
          this.saving.set(false);
          this.devices.update((map) => new Map(map).set(device.locationId, device));
          this.saveMessage.set(
            device.enabled
              ? 'Dispositivo salvato: la cassa di questa sede emetterà il documento commerciale appena il driver di stampa sarà attivo.'
              : 'Dispositivo salvato (disabilitato): la cassa resta non fiscale.',
          );
        },
        error: () => {
          this.saving.set(false);
          this.saveError.set('Salvataggio non riuscito. Riprova.');
        },
      });
  }

  protected remove(): void {
    const locationId = this.selectedLocationId();
    if (!locationId || this.saving() || !this.selectedDevice()) {
      return;
    }
    this.saving.set(true);
    this.saveError.set(null);
    this.saveMessage.set(null);
    this.fiscalDevices
      .remove(locationId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.devices.update((map) => {
            const next = new Map(map);
            next.delete(locationId);
            return next;
          });
          this.patchFormFromDevice();
          this.saveMessage.set(
            'Configurazione rimossa: la cassa di questa sede torna non fiscale.',
          );
        },
        error: () => {
          this.saving.set(false);
          this.saveError.set('Rimozione non riuscita. Riprova.');
        },
      });
  }

  private selectLocation(locationId: string | null): void {
    this.selectedLocationId.set(locationId);
    this.saveMessage.set(null);
    this.saveError.set(null);
    this.patchFormFromDevice();
  }

  private patchFormFromDevice(): void {
    const device = this.selectedDevice();
    this.form.reset({
      brand: device?.brand ?? 'epson',
      model: device?.model ?? '',
      endpoint: device?.endpoint ?? '',
      serialNumber: device?.serialNumber ?? '',
      enabled: device?.enabled ?? true,
      notes: device?.notes ?? '',
    });
    this.departmentRows.forEach((row, index) => {
      const entry = device?.vatDepartments?.[index];
      row.rateControl.setValue(entry ? String(entry.ratePercent) : '');
      row.departmentControl.setValue(entry ? String(entry.department) : '');
    });
  }

  /** Solo le righe compilate per intero e numeriche entrano nella mappa. */
  private collectVatDepartments(): readonly { ratePercent: number; department: number }[] {
    const inRange = (value: number, min: number, max: number): boolean =>
      Number.isInteger(value) && value >= min && value <= max;
    return this.departmentRows
      .filter(
        (row) => row.rateControl.value.trim() !== '' && row.departmentControl.value.trim() !== '',
      )
      .map((row) => ({
        ratePercent: Number(row.rateControl.value.trim()),
        department: Number(row.departmentControl.value.trim()),
      }))
      .filter((entry) => inRange(entry.ratePercent, 0, 100) && inRange(entry.department, 1, 99));
  }
}
