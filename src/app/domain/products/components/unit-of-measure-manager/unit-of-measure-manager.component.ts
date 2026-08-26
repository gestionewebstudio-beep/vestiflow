import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { take, type Observable } from 'rxjs';

import { AppErrorKind, isAppError } from '@core/models/app-error.model';
import type { AppError } from '@core/models/app-error.model';
import type { EntityId } from '@core/models/common.model';
import { ToastService } from '@core/services/toast.service';
import { ButtonComponent } from '@shared/components/button/button.component';
import { ConfirmDialogComponent } from '@shared/components/confirm-dialog/confirm-dialog.component';
import { InlineBannerComponent } from '@shared/components/inline-banner/inline-banner.component';

import type { UnitOfMeasureOption } from '@domain/products/models/unit-of-measure-option.model';
import { UnitOfMeasureOptionService } from '@domain/products/services/unit-of-measure-option.service';

/**
 * Gestione delle unità di misura del tenant: **aggiungi, rinomina, elimina.**
 *
 * **Eliminare qui non è pericoloso**, ed è ciò che decide la forma del
 * pannello. Documenti e anagrafiche portano la stringa, non un riferimento a
 * questa riga: un arrivo merce che dice «3 conf» continuerà a dirlo anche dopo
 * che «conf» è sparita da qui. Sparisce il suggerimento, non il dato.
 *
 * Da lì discendono le tre assenze, che sono scelte e non dimenticanze:
 *
 * - **nessun conteggio d'uso nella conferma** — per i tipi documento rispondeva
 *   alla domanda che l'operatore si stava facendo; qui non risponderebbe a
 *   niente;
 * - **niente disattivazione.** Esiste per togliere una voce dalle tendine senza
 *   perderla: ma qui eliminare non perde niente, quindi sarebbe uno stato in più
 *   da capire in cambio di nulla;
 * - **niente riordino.** Il seed mette per prime le unità più usate e le nuove
 *   nascono in coda; spostarne una costerebbe due chiamate su un elenco di sei.
 */
@Component({
  selector: 'app-unit-of-measure-manager',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonComponent, ConfirmDialogComponent, InlineBannerComponent],
  templateUrl: './unit-of-measure-manager.component.html',
  styleUrl: './unit-of-measure-manager.component.scss',
})
export class UnitOfMeasureManagerComponent {
  private readonly service = inject(UnitOfMeasureOptionService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  /**
   * Dentro un contenitore che si apre e si chiude, il contenitore alza questo
   * flag: la lista si ricarica a ogni apertura invece che una volta sola.
   */
  readonly active = input<boolean>(true);

  /** Dopo ogni modifica: chi ospita ricarica la propria tendina. */
  readonly changed = output<void>();
  /** Unità appena creata: chi ospita può sceglierla subito. */
  readonly created = output<UnitOfMeasureOption>();

  private readonly _options = signal<readonly UnitOfMeasureOption[]>([]);
  readonly options = this._options.asReadonly();
  private readonly _loadError = signal<string | null>(null);
  protected readonly loadError = this._loadError.asReadonly();
  protected readonly loading = signal(false);

  protected readonly busy = signal(false);
  protected readonly actionError = signal<string | null>(null);

  protected readonly newName = signal('');

  protected readonly editingId = signal<EntityId | null>(null);
  protected readonly editName = signal('');

  private readonly pendingDelete = signal<UnitOfMeasureOption | null>(null);
  protected readonly confirmOpen = signal(false);
  protected readonly confirmTitle = computed(() => {
    const option = this.pendingDelete();
    return option ? `Elimina «${option.name}»` : 'Elimina unità di misura';
  });

  constructor() {
    effect(() => {
      if (this.active()) {
        this.load();
      }
    });
  }

  refresh(): void {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.service
      .list()
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (options) => {
          this.loading.set(false);
          this._loadError.set(null);
          this._options.set(options);
        },
        error: (err: unknown) => {
          this.loading.set(false);
          // Un elenco vuoto senza spiegazione farebbe credere di non avere
          // unità configurate, che è il contrario di quello che è successo.
          this._loadError.set(this.toAppError(err).message);
        },
      });
  }

  protected create(): void {
    const name = this.newName().trim();
    if (!name || this.busy()) {
      return;
    }
    this.run(this.service.create(name), 'Unità di misura aggiunta.', (option) => {
      this.newName.set('');
      if (option) {
        this.created.emit(option);
      }
    });
  }

  protected startEdit(option: UnitOfMeasureOption): void {
    this.editingId.set(option.id);
    this.editName.set(option.name);
  }

  protected cancelEdit(): void {
    this.editingId.set(null);
  }

  protected saveEdit(): void {
    const id = this.editingId();
    const name = this.editName().trim();
    if (!id || !name || this.busy()) {
      return;
    }
    this.run(this.service.update(id, { name }), 'Unità di misura aggiornata.', () =>
      this.editingId.set(null),
    );
  }

  protected requestDelete(option: UnitOfMeasureOption): void {
    if (this.busy()) {
      return;
    }
    this.pendingDelete.set(option);
    this.confirmOpen.set(true);
  }

  protected onConfirmDelete(): void {
    const option = this.pendingDelete();
    this.confirmOpen.set(false);
    this.pendingDelete.set(null);
    if (!option) {
      return;
    }
    this.run(this.service.delete(option.id), `«${option.name}» eliminata.`);
  }

  /**
   * Sceglie la predefinita, o la toglie se lo era già.
   *
   * ⛔ Il vincolo «al più una per tenant» sta nel DATABASE (indice parziale),
   * e il server spegne la precedente nella stessa transazione. Qui non si
   * spegne niente a mano: due scritture separate lascerebbero una finestra in
   * cui l’indice rifiuta.
   */
  protected toggleDefault(option: UnitOfMeasureOption): void {
    const attiva = !option.isDefault;
    this.run(
      this.service.update(option.id, { isDefault: attiva }),
      attiva ? `«${option.name}» è ora l’unità predefinita.` : 'Nessuna unità predefinita.',
    );
  }

  protected onDismissDelete(): void {
    this.confirmOpen.set(false);
    this.pendingDelete.set(null);
  }

  protected trackById(_index: number, option: UnitOfMeasureOption): EntityId {
    return option.id;
  }

  private run<T>(
    action$: Observable<T>,
    successMessage: string,
    onSuccess?: (value: T) => void,
  ): void {
    this.busy.set(true);
    this.actionError.set(null);
    action$.pipe(take(1), takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (value) => {
        this.busy.set(false);
        onSuccess?.(value);
        this.toast.showInfo(successMessage);
        this.load();
        this.changed.emit();
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.actionError.set(this.toAppError(err).message);
      },
    });
  }

  private toAppError(err: unknown): AppError {
    if (isAppError(err)) {
      return err;
    }
    return { kind: AppErrorKind.Unknown, message: 'Errore imprevisto. Riprova.' };
  }
}
