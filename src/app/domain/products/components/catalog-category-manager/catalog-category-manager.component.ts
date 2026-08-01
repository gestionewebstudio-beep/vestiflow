import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import type { EntityId } from '@core/models/common.model';
import { ButtonComponent } from '@shared/components/button/button.component';
import { ConfirmDialogComponent } from '@shared/components/confirm-dialog/confirm-dialog.component';

import type { CatalogCategory } from '../../services/catalog-category.service';
import { CatalogCategoryService } from '../../services/catalog-category.service';

/**
 * Gestione inline del vocabolario categorie/sottocategorie catalogo (crea,
 * rinomina, elimina) senza uscire dall'anagrafica prodotto — stesso pattern
 * del "Nuovo fornitore" inline nei documenti. Le voci arrivano dal parent;
 * le operazioni notificano `changed` per ricaricare il vocabolario.
 */
@Component({
  selector: 'app-catalog-category-manager',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonComponent, ConfirmDialogComponent],
  templateUrl: './catalog-category-manager.component.html',
  styleUrl: './catalog-category-manager.component.scss',
})
export class CatalogCategoryManagerComponent {
  private readonly service = inject(CatalogCategoryService);
  private readonly destroyRef = inject(DestroyRef);

  /** Voci da mostrare (già filtrate dal parent: radice o figli di una categoria). */
  readonly entries = input.required<readonly CatalogCategory[]>();
  /** null = gestione categorie; id = gestione sottocategorie di quella categoria. */
  readonly parentId = input<EntityId | null>(null);
  readonly title = input('Gestione categorie');
  readonly addPlaceholder = input('Nuova voce…');

  /** Emesso dopo ogni operazione riuscita: il parent ricarica il vocabolario. */
  readonly changed = output<void>();
  /** Voce appena creata: il parent può selezionarla nel campo. */
  readonly created = output<CatalogCategory>();
  readonly closed = output<void>();

  protected readonly draftName = signal('');
  protected readonly renamingId = signal<EntityId | null>(null);
  protected readonly renameDraft = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly deleteTarget = signal<CatalogCategory | null>(null);
  protected readonly deleteDialogOpen = signal(false);

  protected onDraftInput(event: Event): void {
    this.draftName.set((event.target as HTMLInputElement).value);
  }

  protected onRenameInput(event: Event): void {
    this.renameDraft.set((event.target as HTMLInputElement).value);
  }

  protected add(): void {
    const name = this.draftName().trim();
    if (!name || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.service
      .create(name, this.parentId())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (entry) => {
          this.busy.set(false);
          this.draftName.set('');
          this.created.emit(entry);
          this.changed.emit();
        },
        error: () => {
          this.busy.set(false);
          this.error.set('Impossibile creare la voce. Riprova.');
        },
      });
  }

  protected startRename(entry: CatalogCategory): void {
    this.renamingId.set(entry.id);
    this.renameDraft.set(entry.name);
    this.error.set(null);
  }

  protected cancelRename(): void {
    this.renamingId.set(null);
    this.renameDraft.set('');
  }

  protected confirmRename(entry: CatalogCategory): void {
    const name = this.renameDraft().trim();
    if (!name || this.busy()) {
      return;
    }
    if (name === entry.name) {
      this.cancelRename();
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.service
      .rename(entry.id, name)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.cancelRename();
          this.changed.emit();
        },
        error: () => {
          this.busy.set(false);
          this.error.set('Impossibile rinominare la voce (nome già in uso?).');
        },
      });
  }

  protected askDelete(entry: CatalogCategory): void {
    this.deleteTarget.set(entry);
    this.deleteDialogOpen.set(true);
  }

  protected confirmDelete(): void {
    const entry = this.deleteTarget();
    if (!entry || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.service
      .delete(entry.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.deleteDialogOpen.set(false);
          this.deleteTarget.set(null);
          this.changed.emit();
        },
        error: () => {
          this.busy.set(false);
          this.deleteDialogOpen.set(false);
          this.error.set('Impossibile eliminare la voce. Riprova.');
        },
      });
  }

  protected deleteMessage(): string {
    const entry = this.deleteTarget();
    if (!entry) {
      return '';
    }
    const cascade =
      entry.parentId === null ? ' Le sue sottocategorie verranno eliminate con lei.' : '';
    return (
      `La voce "${entry.name}" verrà rimossa dall'elenco.${cascade} ` +
      'I prodotti che la usano mantengono il valore attuale.'
    );
  }
}
