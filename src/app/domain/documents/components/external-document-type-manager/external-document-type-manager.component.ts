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
import { BadgeComponent } from '@shared/components/badge/badge.component';
import { ButtonComponent } from '@shared/components/button/button.component';
import { DeleteConfirmComponent } from '@shared/components/delete-confirm/delete-confirm.component';
import { InlineBannerComponent } from '@shared/components/inline-banner/inline-banner.component';

import type {
  ExternalDocumentType,
  ExternalDocumentTypeUsage,
} from '../../models/external-document-type.model';
import { ExternalDocumentTypeService } from '../../services/external-document-type.service';

/**
 * Gestione dei tipi documento della controparte: elenco, creazione, modifica,
 * ordine, disattivazione ed eliminazione.
 *
 * Vive in `domain/` perché non appartiene a una schermata sola: lo montano la
 * scheda «Tipi documento» di Impostazioni documenti e — dietro la voce
 * «Gestisci tipi documento…» in fondo alla tendina — ogni maschera documento.
 *
 * **Disattiva ed elimina non sono lo stesso gesto**, ed è la distinzione che
 * questo pannello deve rendere leggibile:
 *
 * - **disattivare** toglie la voce dalle tendine dei documenti nuovi ma la
 *   lascia qui, con il suo badge, riattivabile in un click;
 * - **eliminare** la toglie anche da qui, e non si torna indietro.
 *
 * Quello che i due gesti hanno in comune è ciò che NON fanno: nessuno dei due
 * tocca i documenti già salvati. Un arrivo merce che dice «DDT 145 del
 * 08/05/2026» continuerà a dirlo, perché l'etichetta è fotografata sul
 * documento. Per questo la conferma di eliminazione mostra quanti documenti lo
 * portano: non è un avviso di pericolo, è la risposta alla domanda che
 * l'operatore si sta facendo.
 */
@Component({
  selector: 'app-external-document-type-manager',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BadgeComponent, ButtonComponent, DeleteConfirmComponent, InlineBannerComponent],
  templateUrl: './external-document-type-manager.component.html',
  styleUrl: './external-document-type-manager.component.scss',
})
export class ExternalDocumentTypeManagerComponent {
  private readonly service = inject(ExternalDocumentTypeService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  /**
   * Quando il pannello è dentro un contenitore che si apre e si chiude, il
   * contenitore alza questo flag: la lista si ricarica a ogni apertura invece
   * che una volta sola alla costruzione. Montato inline (Impostazioni) resta a
   * `true` e il caricamento avviene subito.
   */
  readonly active = input<boolean>(true);

  /** Emesso dopo ogni modifica: chi ospita ricarica la propria copia. */
  readonly changed = output<void>();
  /** Tipo appena creato: chi ospita può selezionarlo subito. */
  readonly created = output<ExternalDocumentType>();

  private readonly _types = signal<readonly ExternalDocumentType[]>([]);
  readonly types = this._types.asReadonly();
  private readonly _loadError = signal<string | null>(null);
  protected readonly loadError = this._loadError.asReadonly();
  protected readonly loading = signal(false);

  protected readonly busy = signal(false);
  protected readonly actionError = signal<string | null>(null);

  // ── Nuovo tipo ─────────────────────────────────────────────────────────────
  protected readonly newName = signal('');
  protected readonly newShortLabel = signal('');
  protected readonly newTemplate = signal('');

  // ── Modifica in riga ───────────────────────────────────────────────────────
  protected readonly editingId = signal<EntityId | null>(null);
  protected readonly editName = signal('');
  protected readonly editShortLabel = signal('');
  protected readonly editTemplate = signal('');

  // ── Conferma eliminazione ──────────────────────────────────────────────────
  private readonly pendingDelete = signal<ExternalDocumentType | null>(null);
  private readonly pendingUsage = signal<ExternalDocumentTypeUsage | null>(null);
  protected readonly confirmOpen = signal(false);
  protected readonly confirmTitle = computed(() => {
    const type = this.pendingDelete();
    return type ? `Elimina «${type.name}»` : 'Elimina tipo documento';
  });
  protected readonly confirmMessage = computed(() => {
    const usage = this.pendingUsage();
    if (!usage) {
      return 'Verifica in corso…';
    }
    if (usage.total === 0) {
      return "Nessun documento usa questo tipo: verrà eliminato del tutto. L'operazione non si annulla.";
    }
    const noun = usage.total === 1 ? 'documento lo usa' : 'documenti lo usano';
    return (
      `${usage.total} ${noun}. Eliminandolo sparisce dalle tendine e da questo elenco, ` +
      'ma i documenti che lo portano continuano a mostrarlo. Non si torna indietro: ' +
      'per toglierlo solo dalle tendine, disattivalo.'
    );
  });

  constructor() {
    // Il caricamento segue l'apertura del contenitore: un pannello chiuso non
    // deve chiamare l'API a ogni maschera documento che si apre.
    effect(() => {
      if (this.active()) {
        this.load();
      }
    });
  }

  /** Ricarica dall'esterno (dopo un'azione fatta altrove). */
  refresh(): void {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.service
      .list()
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (types) => {
          this.loading.set(false);
          this._loadError.set(null);
          this._types.set(types);
        },
        error: (err: unknown) => {
          this.loading.set(false);
          // Una tendina vuota senza spiegazione è peggio di un errore scritto:
          // l'operatore crederebbe di non avere tipi configurati.
          this._loadError.set(this.toAppError(err).message);
        },
      });
  }

  protected create(): void {
    const name = this.newName().trim();
    if (!name || this.busy()) {
      return;
    }
    const shortLabel = this.newShortLabel().trim() || name;
    this.run(
      this.service.create({
        name,
        shortLabel,
        causalTemplate: this.newTemplate().trim() || `${shortLabel} {numero} del {data}`,
      }),
      'Tipo documento creato.',
      (type) => {
        this.newName.set('');
        this.newShortLabel.set('');
        this.newTemplate.set('');
        if (type) {
          this.created.emit(type);
        }
      },
    );
  }

  protected startEdit(type: ExternalDocumentType): void {
    this.editingId.set(type.id);
    this.editName.set(type.name);
    this.editShortLabel.set(type.shortLabel);
    this.editTemplate.set(type.causalTemplate ?? '');
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
    this.run(
      this.service.update(id, {
        name,
        shortLabel: this.editShortLabel().trim() || name,
        causalTemplate: this.editTemplate().trim(),
      }),
      'Tipo documento aggiornato.',
      () => this.editingId.set(null),
    );
  }

  protected duplicate(type: ExternalDocumentType): void {
    if (this.busy()) {
      return;
    }
    // Anche l'etichetta breve prende «(copia)»: due voci con lo stesso short
    // label sono indistinguibili proprio dove si scelgono, nella tendina.
    this.run(
      this.service.create({
        name: `${type.name} (copia)`,
        shortLabel: `${type.shortLabel} (copia)`,
        causalTemplate: type.causalTemplate,
      }),
      'Tipo documento duplicato.',
    );
  }

  protected toggleActive(type: ExternalDocumentType): void {
    if (this.busy()) {
      return;
    }
    this.run(
      this.service.update(type.id, { isActive: !type.isActive }),
      type.isActive ? 'Tipo disattivato: non compare più nei documenti nuovi.' : 'Tipo riattivato.',
    );
  }

  protected move(type: ExternalDocumentType, direction: -1 | 1): void {
    if (this.busy()) {
      return;
    }
    const ordered = this._types().map((item) => item.id);
    const index = ordered.indexOf(type.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= ordered.length) {
      return;
    }
    const swapped = ordered[target];
    if (swapped === undefined) {
      return;
    }
    ordered[target] = type.id;
    ordered[index] = swapped;
    this.run(this.service.reorder(ordered), 'Ordine aggiornato.');
  }

  /** Chiede quanti documenti lo portano, poi apre la conferma. */
  protected requestDelete(type: ExternalDocumentType): void {
    if (this.busy()) {
      return;
    }
    this.pendingDelete.set(type);
    this.pendingUsage.set(null);
    this.confirmOpen.set(true);
    this.service
      .usage(type.id)
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (usage) => this.pendingUsage.set(usage),
        // Il conteggio è un di più: se non arriva si conferma lo stesso, con il
        // messaggio prudente al posto del numero.
        error: () =>
          this.pendingUsage.set({
            documents: 0,
            salesOrders: 0,
            supplierOrders: 0,
            total: 0,
          }),
      });
  }

  protected onConfirmDelete(): void {
    const type = this.pendingDelete();
    this.confirmOpen.set(false);
    this.pendingDelete.set(null);
    this.pendingUsage.set(null);
    if (!type) {
      return;
    }
    this.run(this.service.delete(type.id), `«${type.name}» eliminato.`);
  }

  protected trackById(_index: number, type: ExternalDocumentType): EntityId {
    return type.id;
  }

  protected onDismissDelete(): void {
    this.confirmOpen.set(false);
    this.pendingDelete.set(null);
    this.pendingUsage.set(null);
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
