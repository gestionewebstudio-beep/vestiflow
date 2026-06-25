import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type { Subscription } from 'rxjs';

import { APP_CONFIG } from '@core/config/app-config.token';
import { AppErrorKind, isAppError } from '@core/models/app-error.model';
import type { EntityId } from '@core/models/common.model';
import { LocationContextService } from '@core/services/location-context.service';
import { OperationalLocationsService } from '@core/services/operational-locations.service';
import { BarcodeScannerComponent } from '@shared/components/barcode-scanner/barcode-scanner.component';
import { ButtonComponent } from '@shared/components/button/button.component';
import { SelectMenuComponent } from '@shared/components/select-menu/select-menu.component';
import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';

import {
  InventoryService,
  type RetailScanResult,
} from '@features/inventory/services/inventory.service';

type ScanAction = 'sale' | 'return';

interface SessionEntry {
  readonly id: string;
  readonly action: ScanAction;
  readonly productName: string;
  readonly sku: string;
  readonly remainingAvailable: number;
  readonly at: Date;
}

let sessionEntryCounter = 0;

/**
 * Vendita e storno al banco per profilo solo gestionale.
 * Ottimizzato per pistola barcode USB (input + Invio) e fotocamera (BarcodeDetector).
 */
@Component({
  selector: 'app-retail-sale-register',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    BarcodeScannerComponent,
    ButtonComponent,
    SelectMenuComponent,
  ],
  templateUrl: './retail-sale-register.component.html',
  styleUrl: './retail-sale-register.component.scss',
})
export class RetailSaleRegisterComponent {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly inventoryService = inject(InventoryService);
  private readonly operationalLocations = inject(OperationalLocationsService);
  private readonly locationContext = inject(LocationContextService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly document = inject(DOCUMENT);
  private readonly config = inject(APP_CONFIG);

  private readonly saleInputRef = viewChild<ElementRef<HTMLInputElement>>('saleInput');

  protected readonly barcodeScannerEnabled = this.config.features.barcodeScanner;

  protected readonly saleForm = this.fb.group({
    code: this.fb.control('', { validators: [Validators.required, Validators.maxLength(100)] }),
  });

  protected readonly returnForm = this.fb.group({
    code: this.fb.control('', { validators: [Validators.required, Validators.maxLength(100)] }),
  });

  protected readonly locationOptions = computed((): readonly SelectMenuOption[] =>
    this.operationalLocations.locations().map((location) => ({
      value: location.id,
      label: location.name,
    })),
  );

  protected readonly selectedLocationId = signal<EntityId | null>(
    this.locationContext.activeLocationId(),
  );

  protected readonly salePending = signal(false);
  protected readonly returnPending = signal(false);
  protected readonly saleFeedback = signal<{ tone: 'success' | 'error'; message: string } | null>(
    null,
  );
  protected readonly returnFeedback = signal<{ tone: 'success' | 'error'; message: string } | null>(
    null,
  );
  protected readonly sessionLog = signal<readonly SessionEntry[]>([]);

  // takeUntilDestroyed() gestisce l'unsubscribe; il campo evita subscription "ignorate".
  private retailScanSubscription: Subscription | null = null;

  constructor() {
    afterNextRender(() => {
      this.focusSaleInput();
    });
  }

  protected onLocationChange(value: string | null): void {
    this.selectedLocationId.set(value);
    this.locationContext.setActiveLocation(value);
  }

  protected submitSale(): void {
    this.submitScan('sale', this.saleForm, this.salePending, this.saleFeedback, () =>
      this.focusSaleInput(),
    );
  }

  protected submitReturn(): void {
    this.submitScan('return', this.returnForm, this.returnPending, this.returnFeedback, () =>
      this.focusReturnInput(),
    );
  }

  protected onSaleScanned(code: string): void {
    this.saleForm.controls.code.setValue(code);
    this.submitSale();
  }

  protected onReturnScanned(code: string): void {
    this.returnForm.controls.code.setValue(code);
    this.submitReturn();
  }

  protected actionLabel(action: ScanAction): string {
    return action === 'sale' ? 'Vendita' : 'Storno';
  }

  protected formatTime(at: Date): string {
    return at.toLocaleTimeString('it-IT', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }

  private submitScan(
    action: ScanAction,
    form: typeof this.saleForm,
    pending: ReturnType<typeof signal<boolean>>,
    feedback: ReturnType<typeof signal<{ tone: 'success' | 'error'; message: string } | null>>,
    refocus: () => void,
  ): void {
    if (pending()) {
      return;
    }

    if (form.invalid) {
      form.markAllAsTouched();
      return;
    }

    const locationId = this.selectedLocationId();
    if (!locationId) {
      feedback.set({ tone: 'error', message: 'Seleziona la location del negozio.' });
      return;
    }

    const code = form.controls.code.value.trim();
    pending.set(true);
    feedback.set(null);

    this.retailScanSubscription = this.inventoryService
      .registerRetailScan({ code, locationId, action })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          pending.set(false);
          form.reset();
          this.pushSessionEntry(action, result);
          feedback.set({
            tone: 'success',
            message: this.successMessage(action, result),
          });
          refocus();
        },
        error: (err: unknown) => {
          pending.set(false);
          feedback.set({ tone: 'error', message: this.errorMessage(err) });
          refocus();
        },
      });
  }

  private pushSessionEntry(action: ScanAction, result: RetailScanResult): void {
    const entry: SessionEntry = {
      id: `scan-${++sessionEntryCounter}`,
      action,
      productName: result.productName,
      sku: result.sku,
      remainingAvailable: result.remainingAvailable,
      at: new Date(),
    };
    this.sessionLog.update((entries) => [entry, ...entries].slice(0, 30));
  }

  private successMessage(action: ScanAction, result: RetailScanResult): string {
    const verb = action === 'sale' ? 'Vendita registrata' : 'Storno registrato';
    return `${verb}: ${result.productName} (${result.sku}). Disponibile: ${result.remainingAvailable}`;
  }

  private errorMessage(err: unknown): string {
    if (isAppError(err)) {
      if (err.kind === AppErrorKind.NotFound) {
        return 'Nessuna variante trovata per questo SKU o barcode.';
      }
      return err.message;
    }
    return 'Registrazione non riuscita. Riprova.';
  }

  private focusSaleInput(): void {
    this.saleInputRef()?.nativeElement.focus();
  }

  private focusReturnInput(): void {
    this.document.getElementById('retail-return-code')?.focus();
  }
}
