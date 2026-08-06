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
import { formatDate } from '@core/utils/date.util';
import { ButtonComponent } from '@shared/components/button/button.component';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { TableSkeletonComponent } from '@shared/components/table-skeleton/table-skeleton.component';

import { InventoryService } from '@domain/inventory/services/inventory.service';
import { posPortalStatusLabel, type PosTerminal } from '@domain/fiscal/models/pos-terminal.model';
import { PosTerminalsService } from '@domain/fiscal/services/pos-terminals.service';

/**
 * Impostazioni → Terminali POS: l'anagrafica per l'adempimento 2026 del
 * collegamento POS ↔ strumento di certificazione. L'associazione vera si fa
 * SUL PORTALE Fatture e Corrispettivi dall'esercente — qui si tiene l'elenco,
 * la finestra di comunicazione di ogni terminale e chi è in ritardo.
 */
@Component({
  selector: 'app-pos-terminals-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, ButtonComponent, ErrorStateComponent, TableSkeletonComponent],
  templateUrl: './pos-terminals-panel.component.html',
  styleUrl: './pos-terminals-panel.component.scss',
})
export class PosTerminalsPanelComponent {
  private readonly posTerminals = inject(PosTerminalsService);
  private readonly inventoryService = inject(InventoryService);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly formatDate = formatDate;
  protected readonly statusLabel = posPortalStatusLabel;

  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);
  protected readonly saving = signal(false);
  protected readonly feedback = signal<string | null>(null);
  protected readonly feedbackError = signal<string | null>(null);

  protected readonly terminals = signal<readonly PosTerminal[]>([]);
  private readonly locations = signal<readonly Location[]>([]);

  protected readonly locationOptions = computed(() =>
    this.locations()
      .filter((location) => location.isActive && location.licensedInVf)
      .map((location) => ({ value: location.id, label: location.name })),
  );

  protected readonly form = this.fb.group({
    locationId: this.fb.control('', { validators: [Validators.required] }),
    terminalId: this.fb.control('', {
      validators: [Validators.required, Validators.minLength(2)],
    }),
    acquirerName: this.fb.control('', {
      validators: [Validators.required, Validators.minLength(2)],
    }),
    activatedAt: this.fb.control('', { validators: [Validators.required] }),
    description: this.fb.control(''),
  });

  constructor() {
    this.reload();
  }

  protected reload(): void {
    this.loading.set(true);
    this.loadError.set(false);
    forkJoin({
      locations: this.inventoryService.getLocations(),
      terminals: this.posTerminals.list(),
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
        this.terminals.set(result.terminals);
        const firstOption = this.locationOptions()[0];
        if (!this.form.controls.locationId.value && firstOption) {
          this.form.controls.locationId.setValue(firstOption.value);
        }
      });
  }

  protected add(): void {
    if (this.saving() || this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    this.saving.set(true);
    this.clearFeedback();
    this.posTerminals
      .create({
        locationId: raw.locationId,
        terminalId: raw.terminalId.trim(),
        acquirerName: raw.acquirerName.trim(),
        activatedAt: raw.activatedAt,
        description: raw.description.trim() || undefined,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (terminal) => {
          this.saving.set(false);
          this.terminals.update((list) => [...list, terminal]);
          this.form.controls.terminalId.setValue('');
          this.form.controls.description.setValue('');
          this.feedback.set(
            `Terminale registrato: comunicalo sul portale tra il ${this.formatDate(terminal.portalWindowFrom)} e il ${this.formatDate(terminal.portalWindowTo)}.`,
          );
        },
        error: () => {
          this.saving.set(false);
          this.feedbackError.set(
            'Registrazione non riuscita (Terminal ID già presente?). Riprova.',
          );
        },
      });
  }

  /** Adempimento fatto sul portale (o riaperto se era segnato per errore). */
  protected togglePortalLinked(terminal: PosTerminal): void {
    if (this.saving()) {
      return;
    }
    this.saving.set(true);
    this.clearFeedback();
    this.posTerminals
      .update(terminal.id, { portalLinked: !terminal.portalLinkedAt })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.saving.set(false);
          this.terminals.update((list) =>
            list.map((entry) => (entry.id === updated.id ? updated : entry)),
          );
        },
        error: () => {
          this.saving.set(false);
          this.feedbackError.set('Aggiornamento non riuscito. Riprova.');
        },
      });
  }

  protected remove(terminal: PosTerminal): void {
    if (this.saving()) {
      return;
    }
    this.saving.set(true);
    this.clearFeedback();
    this.posTerminals
      .remove(terminal.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.terminals.update((list) => list.filter((entry) => entry.id !== terminal.id));
          this.feedback.set(
            'Terminale rimosso. Ricorda: anche la dismissione va comunicata sul portale.',
          );
        },
        error: () => {
          this.saving.set(false);
          this.feedbackError.set('Rimozione non riuscita. Riprova.');
        },
      });
  }

  private clearFeedback(): void {
    this.feedback.set(null);
    this.feedbackError.set(null);
  }
}
