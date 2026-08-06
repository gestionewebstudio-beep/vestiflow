import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  model,
  output,
  signal,
  viewChild,
  ElementRef,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { ButtonComponent } from '@shared/components/button/button.component';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { InlineSpinnerComponent } from '@shared/components/inline-spinner/inline-spinner.component';

import { normalizeShopDomainInput } from '../../models/normalize-shop-domain.util';
import type { ShopifyShopChangePreviewDto } from '../../models/shopify-shop-change.dto';
import { ShopifyConnectionService } from '../../services/shopify-connection.service';

type WizardStep = 'preview' | 'confirm' | 'connect';

@Component({
  selector: 'app-shopify-shop-change-wizard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ButtonComponent,
    ErrorStateComponent,
    InlineSpinnerComponent,
    ReactiveFormsModule,
    RouterLink,
  ],
  templateUrl: './shopify-shop-change-wizard.component.html',
  styleUrl: './shopify-shop-change-wizard.component.scss',
})
export class ShopifyShopChangeWizardComponent {
  private readonly shopifyConnectionService = inject(ShopifyConnectionService);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  readonly open = model<boolean>(false);
  /** `change`: cambio negozio; `disconnect`: rimuovi dati e disconnetti. */
  readonly mode = input<'change' | 'disconnect'>('change');

  readonly completed = output<void>();
  readonly dismissed = output<void>();

  protected readonly dialogTitle = computed(() =>
    this.mode() === 'disconnect' ? 'Rimuovi dati Shopify' : 'Cambia negozio Shopify',
  );

  protected readonly step = signal<WizardStep>('preview');
  protected readonly previewLoading = signal(false);
  protected readonly actionLoading = signal(false);
  protected readonly preview = signal<ShopifyShopChangePreviewDto | null>(null);
  protected readonly error = signal<string | null>(null);

  protected readonly purgeCatalog = signal(true);
  protected readonly purgeCustomers = signal(true);
  protected readonly purgeOrders = signal(true);
  protected readonly acknowledgeLoss = signal(false);

  protected readonly confirmForm = this.fb.group({
    confirmShopDomain: this.fb.control('', Validators.required),
  });

  protected readonly connectForm = this.fb.group({
    shop: this.fb.control('', Validators.required),
  });

  protected readonly hasCatalogBlockers = signal(false);

  protected readonly catalogPurgeBlocked = computed(() => {
    const data = this.preview();
    if (!data) {
      return false;
    }
    return data.blockers.some((blocker) => blocker.code === 'supplier_orders_open');
  });

  protected readonly canContinueFromPreview = computed(() => {
    if (this.hasCatalogBlockers()) {
      return false;
    }
    return this.purgeCatalog() || this.purgeCustomers() || this.purgeOrders();
  });

  protected readonly continueBlockedHint = computed(() => {
    if (!this.hasCatalogBlockers()) {
      return null;
    }
    return 'Per rimuovere il catalogo chiudi o annulla gli ordini fornitore elencati sopra, oppure deseleziona il catalogo per continuare con clienti/ordini.';
  });

  private readonly dialogRef = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  constructor() {
    effect(() => {
      const dialog = this.dialogRef().nativeElement;
      if (this.open() && !dialog.open) {
        dialog.showModal();
      } else if (!this.open() && dialog.open) {
        dialog.close();
      }
    });

    effect(() => {
      if (this.open()) {
        this.resetWizard();
        this.loadPreview();
      }
    });

    effect(() => {
      const data = this.preview();
      if (!data) {
        this.hasCatalogBlockers.set(false);
        return;
      }
      const catalogBlocked =
        this.purgeCatalog() &&
        data.blockers.some((blocker) => blocker.code === 'supplier_orders_open');
      this.hasCatalogBlockers.set(catalogBlocked);
    });
  }

  protected onPurgeCustomersChange(checked: boolean): void {
    this.purgeCustomers.set(checked);
    if (checked) {
      this.purgeOrders.set(true);
    }
  }

  protected onContinueFromPreview(): void {
    if (this.hasCatalogBlockers()) {
      return;
    }
    this.step.set('confirm');
    this.error.set(null);
  }

  protected onBackToPreview(): void {
    this.step.set('preview');
    this.error.set(null);
  }

  protected onConfirmPurge(): void {
    const previewData = this.preview();
    if (!previewData?.currentShopDomain || this.actionLoading()) {
      return;
    }

    if (this.confirmForm.invalid || !this.acknowledgeLoss()) {
      this.confirmForm.markAllAsTouched();
      return;
    }

    const confirmShopDomain = normalizeShopDomainInput(
      this.confirmForm.controls.confirmShopDomain.value,
    );
    if (confirmShopDomain !== previewData.currentShopDomain) {
      this.error.set('Il dominio inserito non corrisponde al negozio attualmente collegato.');
      return;
    }

    this.actionLoading.set(true);
    this.error.set(null);

    this.shopifyConnectionService
      .purgeShopifyData({
        confirmShopDomain,
        purgeCatalog: this.purgeCatalog(),
        purgeCustomers: this.purgeCustomers(),
        purgeOrders: this.purgeOrders(),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.actionLoading.set(false);
          if (this.mode() === 'disconnect') {
            this.finishDisconnect();
            return;
          }
          this.step.set('connect');
          this.connectForm.reset();
        },
        error: (err: unknown) => {
          this.actionLoading.set(false);
          this.error.set(this.extractErrorMessage(err));
        },
      });
  }

  protected onDisconnectAndConnect(): void {
    if (this.connectForm.invalid || this.actionLoading()) {
      this.connectForm.markAllAsTouched();
      return;
    }

    this.actionLoading.set(true);
    this.error.set(null);

    this.shopifyConnectionService
      .disconnect()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.shopifyConnectionService
            .beginAuth(normalizeShopDomainInput(this.connectForm.controls.shop.value))
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
              next: ({ authorizeUrl }) => {
                window.location.assign(authorizeUrl);
              },
              error: (err: unknown) => {
                this.actionLoading.set(false);
                this.error.set(this.extractErrorMessage(err));
              },
            });
        },
        error: (err: unknown) => {
          this.actionLoading.set(false);
          this.error.set(this.extractErrorMessage(err));
        },
      });
  }

  protected onClose(): void {
    this.open.set(false);
    this.dismissed.emit();
  }

  protected onNativeClose(): void {
    if (this.open()) {
      this.open.set(false);
      this.dismissed.emit();
    }
  }

  protected onDisconnectWithoutPurge(): void {
    if (this.actionLoading()) {
      return;
    }

    this.actionLoading.set(true);
    this.error.set(null);

    this.shopifyConnectionService
      .disconnect()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.actionLoading.set(false);
          this.open.set(false);
          this.completed.emit();
        },
        error: (err: unknown) => {
          this.actionLoading.set(false);
          this.error.set(this.extractErrorMessage(err));
        },
      });
  }

  private finishDisconnect(): void {
    this.shopifyConnectionService
      .disconnect()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.actionLoading.set(false);
          this.open.set(false);
          this.completed.emit();
        },
        error: (err: unknown) => {
          this.actionLoading.set(false);
          this.error.set(this.extractErrorMessage(err));
        },
      });
  }

  protected loadPreview(): void {
    this.previewLoading.set(true);
    this.error.set(null);

    this.shopifyConnectionService
      .previewShopChange()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => {
          this.previewLoading.set(false);
          this.preview.set(data);
          const catalogBlocked = data.blockers.some(
            (blocker) => blocker.code === 'supplier_orders_open',
          );
          if (catalogBlocked) {
            this.purgeCatalog.set(false);
          }
          this.hasCatalogBlockers.set(catalogBlocked && this.purgeCatalog());
        },
        error: (err: unknown) => {
          this.previewLoading.set(false);
          this.error.set(this.extractErrorMessage(err));
        },
      });
  }

  private resetWizard(): void {
    this.step.set('preview');
    this.preview.set(null);
    this.error.set(null);
    this.purgeCatalog.set(true);
    this.purgeCustomers.set(true);
    this.purgeOrders.set(true);
    this.acknowledgeLoss.set(false);
    this.hasCatalogBlockers.set(false);
    this.confirmForm.reset();
    this.connectForm.reset();
  }

  private extractErrorMessage(err: unknown): string {
    if (typeof err === 'object' && err !== null && 'error' in err) {
      const payload = (err as { error?: unknown }).error;
      if (typeof payload === 'object' && payload !== null && 'message' in payload) {
        const message = (payload as { message?: unknown }).message;
        if (typeof message === 'string') {
          return message;
        }
        if (Array.isArray(message)) {
          return message.join(', ');
        }
      }
      if (typeof payload === 'string') {
        return payload;
      }
    }
    return 'Operazione non riuscita. Riprova tra qualche minuto.';
  }
}
