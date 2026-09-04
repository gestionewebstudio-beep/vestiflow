import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, map, of, startWith, switchMap, take } from 'rxjs';

import { AppErrorKind, isAppError } from '@core/models/app-error.model';
import type { AppError } from '@core/models/app-error.model';
import type { CanComponentDeactivate } from '@core/guards/unsaved-changes.guard';
import type { Customer } from '@core/models/customer.model';
import type { PaymentOption } from '@core/models/payment-option.model';
import { PaymentOptionsService } from '@core/services/payment-options.service';
import { CustomerFormFieldsComponent } from '@domain/customers/components/customer-form-fields/customer-form-fields.component';
import {
  createCustomerFormGroup,
  mapCustomerFormToInput,
  patchCustomerFormGroup,
  setCustomerAnagraficaReadOnly,
} from '@domain/customers/utils/customer-form.util';
import { ConfirmDialogComponent } from '@shared/components/confirm-dialog/confirm-dialog.component';
import { BackButtonComponent } from '@shared/components/back-button/back-button.component';
import { ButtonComponent } from '@shared/components/button/button.component';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { TableSkeletonComponent } from '@shared/components/table-skeleton/table-skeleton.component';

import { CustomerService } from '@domain/customers/services/customer.service';

@Component({
  selector: 'app-customer-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    ReactiveFormsModule,
    BackButtonComponent,
    ButtonComponent,
    ErrorStateComponent,
    TableSkeletonComponent,
    CustomerFormFieldsComponent,
    ConfirmDialogComponent,
  ],
  templateUrl: './customer-form.component.html',
  styleUrl: './customer-form.component.scss',
})
export class CustomerFormComponent implements CanComponentDeactivate {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly service = inject(CustomerService);
  private readonly paymentOptionsService = inject(PaymentOptionsService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly listPath = '/app/customers';
  protected readonly saving = signal(false);
  protected readonly saveError = signal<string | null>(null);

  private readonly params = toSignal(this.route.paramMap, { requireSync: true });
  protected readonly customerId = computed(() => this.params().get('id'));
  protected readonly isEdit = computed(() => Boolean(this.customerId()));

  private readonly loadState = toSignal(
    toObservable(this.customerId).pipe(
      switchMap((id) => {
        if (!id) {
          return of({ status: 'ready' as const, customer: null });
        }
        return this.service.getCustomerById(id).pipe(
          map((customer) => ({ status: 'ready' as const, customer })),
          startWith({ status: 'loading' as const, customer: null }),
          catchError((err: unknown) =>
            of({
              status: 'error' as const,
              customer: null,
              error: isAppError(err)
                ? err
                : ({ kind: AppErrorKind.Unknown, message: 'Errore imprevisto' } satisfies AppError),
            }),
          ),
        );
      }),
    ),
    { initialValue: { status: 'loading' as const, customer: null } },
  );

  protected readonly loading = computed(() => this.loadState().status === 'loading');
  protected readonly loadError = computed(() => {
    const state = this.loadState();
    return state.status === 'error' ? state.error : null;
  });

  protected readonly anagraficaReadOnly = computed(
    () => this.loadState().customer?.source === 'shopify',
  );

  /** Voci pagamento del tenant per le tendine modalità/condizioni. */
  protected readonly paymentOptions = toSignal(
    this.paymentOptionsService.list().pipe(catchError(() => of([] as readonly PaymentOption[]))),
    { initialValue: [] as readonly PaymentOption[] },
  );

  protected readonly form = createCustomerFormGroup(this.fb);

  // ── Uscita con modifiche non salvate (pattern Ordine fornitore) ──
  protected readonly dirtySinceLastSave = signal(false);
  protected readonly exitDialogOpen = signal(false);
  private pendingDeactivate: ((allow: boolean) => void) | null = null;
  /** True durante il patch programmatico del form (caricamento in modifica). */
  private suppressDirtyMarking = false;

  constructor() {
    toObservable(this.loadState)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((state) => {
        if (state.status === 'ready' && state.customer) {
          // Patch programmatico: non è una modifica dell'utente.
          this.suppressDirtyMarking = true;
          try {
            patchCustomerFormGroup(this.form, state.customer);
            setCustomerAnagraficaReadOnly(this.form, state.customer.source === 'shopify');
          } finally {
            this.suppressDirtyMarking = false;
          }
        }
      });

    this.form.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.markFormDirty();
    });
  }

  /**
   * ⛔ Qui c'era un parametro `onSaved`, e lo passava UN solo chiamante:
   * «Salva e chiudi» del dialogo d'uscita. Tolto quel pulsante il 25/08/2026,
   * il parametro non ha piu' chiamanti e i suoi rami erano irraggiungibili.
   */
  protected submit(): void {
    this.form.markAllAsTouched();
    if (this.form.hasError('identityRequired')) {
      this.saveError.set('Indica la ragione sociale oppure nome e cognome del cliente.');
      return;
    }
    if (this.form.invalid || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.saveError.set(null);
    const payload = mapCustomerFormToInput(this.form.getRawValue());
    const id = this.customerId();
    const request$ = id
      ? this.service.updateCustomer(id, payload)
      : this.service.createCustomer(payload);

    request$.pipe(take(1), takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (customer: Customer) => {
        this.saving.set(false);
        // Cliente salvato: il guard di uscita non deve più fermare la navigazione.
        this.dirtySinceLastSave.set(false);
        void this.router.navigate(['/app/customers', customer.id]);
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.saveError.set(isAppError(err) ? err.message : 'Salvataggio non riuscito');
      },
    });
  }

  canDeactivate(): boolean | Promise<boolean> {
    if (!this.dirtySinceLastSave()) {
      return true;
    }
    this.exitDialogOpen.set(true);
    return new Promise<boolean>((resolve) => {
      this.pendingDeactivate = resolve;
    });
  }

  protected cancelExitDialog(): void {
    this.exitDialogOpen.set(false);
    this.pendingDeactivate?.(false);
    this.pendingDeactivate = null;
  }

  protected confirmExitWithoutSaving(): void {
    this.exitDialogOpen.set(false);
    this.dirtySinceLastSave.set(false);
    this.pendingDeactivate?.(true);
    this.pendingDeactivate = null;
  }

  // ⛔ Qui c'era il gestore di «Salva e chiudi» del dialogo d'uscita, tolto il
  // 25/08/2026 con quel pulsante: il dialogo ha DUE azioni — Annulla · Esci
  // senza salvare — e il salvataggio resta il pulsante Salva della barra.
  // (decisione del proprietario, 24/08/2026)

  private markFormDirty(): void {
    if (!this.suppressDirtyMarking) {
      this.dirtySinceLastSave.set(true);
    }
  }
}
