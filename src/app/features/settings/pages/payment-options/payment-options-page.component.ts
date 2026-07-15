import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { DestroyRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { catchError, map, of, startWith, switchMap, take } from 'rxjs';

import { isAppError } from '@core/models/app-error.model';
import type { PaymentOption, PaymentOptionKind } from '@core/models/payment-option.model';
import { PaymentOptionsService } from '@core/services/payment-options.service';
import { ToastService } from '@core/services/toast.service';
import { ButtonComponent } from '@shared/components/button/button.component';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { TableSkeletonComponent } from '@shared/components/table-skeleton/table-skeleton.component';

interface LoadState {
  readonly status: 'loading' | 'ready' | 'error';
  readonly options: readonly PaymentOption[];
}

/**
 * Impostazioni → Pagamenti (logica Danea): due elenchi separati e gestibili,
 * modalità di pagamento e condizioni di pagamento, usati dalle anagrafiche
 * cliente e fornitore. Le anagrafiche salvano il nome della voce (snapshot):
 * rinominare o eliminare una voce non riscrive i ruoli già salvati.
 */
@Component({
  selector: 'app-payment-options-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, ButtonComponent, ErrorStateComponent, TableSkeletonComponent],
  templateUrl: './payment-options-page.component.html',
  styleUrl: './payment-options-page.component.scss',
})
export class PaymentOptionsPageComponent {
  private readonly service = inject(PaymentOptionsService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly kinds: readonly {
    readonly kind: PaymentOptionKind;
    readonly title: string;
    readonly hint: string;
  }[] = [
    {
      kind: 'method',
      title: 'Modalità di pagamento',
      hint: 'Es. Contanti, Bonifico bancario, Carta di pagamento.',
    },
    {
      kind: 'terms',
      title: 'Condizioni di pagamento',
      hint: 'Es. Vista fattura, 30 gg d.f., 60 gg f.m.',
    },
  ];

  private readonly reload = signal(0);
  private readonly loadState = toSignal(
    toObservable(this.reload).pipe(
      switchMap(() =>
        this.service.list().pipe(
          map((options): LoadState => ({ status: 'ready', options })),
          startWith({ status: 'loading', options: [] } satisfies LoadState),
          catchError(() => of({ status: 'error', options: [] } satisfies LoadState)),
        ),
      ),
    ),
    { initialValue: { status: 'loading', options: [] } satisfies LoadState },
  );

  protected readonly loading = computed(() => this.loadState().status === 'loading');
  protected readonly loadError = computed(() => this.loadState().status === 'error');

  protected readonly saving = signal(false);
  /** Bozze dei campi "nuova voce", per kind. */
  protected readonly drafts: Record<PaymentOptionKind, string> = { method: '', terms: '' };
  /** Voce in rinomina (id) e testo in modifica. */
  protected readonly editingId = signal<string | null>(null);
  protected editingName = '';

  protected optionsOf(kind: PaymentOptionKind): readonly PaymentOption[] {
    return this.loadState().options.filter((option) => option.kind === kind);
  }

  protected add(kind: PaymentOptionKind): void {
    const name = this.drafts[kind].trim();
    if (!name || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.service
      .create(kind, name)
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.drafts[kind] = '';
          this.finishMutation('Voce aggiunta.');
        },
        error: (err: unknown) => this.failMutation(err),
      });
  }

  protected startRename(option: PaymentOption): void {
    this.editingId.set(option.id);
    this.editingName = option.name;
  }

  protected cancelRename(): void {
    this.editingId.set(null);
    this.editingName = '';
  }

  protected confirmRename(option: PaymentOption): void {
    const name = this.editingName.trim();
    if (!name || this.saving()) {
      return;
    }
    if (name === option.name) {
      this.cancelRename();
      return;
    }
    this.saving.set(true);
    this.service
      .update(option.id, { name })
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.cancelRename();
          this.finishMutation('Voce rinominata. Le anagrafiche già salvate restano invariate.');
        },
        error: (err: unknown) => this.failMutation(err),
      });
  }

  protected toggleActive(option: PaymentOption): void {
    if (this.saving()) {
      return;
    }
    this.saving.set(true);
    this.service
      .update(option.id, { isActive: !option.isActive })
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.finishMutation(option.isActive ? 'Voce disattivata.' : 'Voce riattivata.'),
        error: (err: unknown) => this.failMutation(err),
      });
  }

  protected remove(option: PaymentOption): void {
    if (this.saving()) {
      return;
    }
    const confirmed = window.confirm(
      `Eliminare la voce "${option.name}"? Le anagrafiche che la usano non vengono modificate.`,
    );
    if (!confirmed) {
      return;
    }
    this.saving.set(true);
    this.service
      .delete(option.id)
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.finishMutation('Voce eliminata.'),
        error: (err: unknown) => this.failMutation(err),
      });
  }

  protected retry(): void {
    this.reload.update((value) => value + 1);
  }

  private finishMutation(message: string): void {
    this.saving.set(false);
    this.toast.showInfo(message);
    this.reload.update((value) => value + 1);
  }

  private failMutation(err: unknown): void {
    this.saving.set(false);
    this.toast.showError(isAppError(err) ? err.message : 'Operazione non riuscita');
  }
}
