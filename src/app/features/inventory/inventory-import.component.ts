import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';

import { AppErrorKind, isAppError } from '@core/models/app-error.model';
import type { AppError } from '@core/models/app-error.model';
import { BadgeComponent } from '@shared/components/badge/badge.component';
import { ButtonComponent } from '@shared/components/button/button.component';

import type {
  InventoryImportPreview,
  InventoryImportPreviewItem,
  InventoryImportResult,
} from './models/inventory-import.model';
import { InventoryService } from './services/inventory.service';

type ImportPhase = 'upload' | 'preview' | 'done';

@Component({
  selector: 'app-inventory-import',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonComponent, BadgeComponent],
  templateUrl: './inventory-import.component.html',
  styleUrl: './inventory-import.component.scss',
})
export class InventoryImportComponent {
  private readonly inventoryService = inject(InventoryService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly phase = signal<ImportPhase>('upload');
  protected readonly selectedFile = signal<File | null>(null);
  protected readonly preview = signal<InventoryImportPreview | null>(null);
  protected readonly result = signal<InventoryImportResult | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal<AppError | null>(null);

  protected readonly readyKeys = computed(() => {
    const data = this.preview();
    if (!data) {
      return [] as string[];
    }
    return data.rows.filter((item) => item.status === 'ready').map((item) => item.key);
  });

  protected readonly canImport = computed(() => this.readyKeys().length > 0 && !this.loading());

  /** Tutte le righe valide del file sono già allineate alle giacenze a sistema. */
  protected readonly allUnchanged = computed(() => {
    const data = this.preview();
    if (!data || data.summary.total === 0) {
      return false;
    }
    return data.summary.ready === 0 && data.summary.errors === 0 && data.summary.unchanged > 0;
  });

  protected backToList(): void {
    if (this.loading()) {
      return;
    }
    void this.router.navigate(['/app/inventory']);
  }

  protected onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.selectedFile.set(file);
    this.preview.set(null);
    this.result.set(null);
    this.error.set(null);
    this.phase.set('upload');
  }

  protected analyzeFile(): void {
    const file = this.selectedFile();
    if (!file || this.loading()) {
      return;
    }

    this.loading.set(true);
    this.error.set(null);
    this.inventoryService
      .previewInventoryImport(file)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => {
          this.preview.set(data);
          this.phase.set('preview');
          this.loading.set(false);
        },
        error: (err: unknown) => {
          this.loading.set(false);
          this.error.set(
            isAppError(err)
              ? err
              : { kind: AppErrorKind.Unknown, message: 'Anteprima import non riuscita.' },
          );
        },
      });
  }

  protected runImport(): void {
    const file = this.selectedFile();
    const keys = this.readyKeys();
    if (!file || keys.length === 0 || this.loading()) {
      return;
    }

    this.loading.set(true);
    this.error.set(null);
    this.inventoryService
      .importInventoryCsv(file, keys)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => {
          this.result.set(data);
          this.phase.set('done');
          this.loading.set(false);
        },
        error: (err: unknown) => {
          this.loading.set(false);
          this.error.set(
            isAppError(err)
              ? err
              : { kind: AppErrorKind.Unknown, message: 'Import giacenze non riuscito.' },
          );
        },
      });
  }

  protected statusTone(
    item: InventoryImportPreviewItem,
  ): 'success' | 'warning' | 'error' | 'neutral' {
    if (item.status === 'ready') {
      return 'success';
    }
    if (item.status === 'unchanged') {
      return 'neutral';
    }
    return 'error';
  }

  protected statusLabel(item: InventoryImportPreviewItem): string {
    if (item.status === 'ready') {
      return 'Pronta';
    }
    if (item.status === 'unchanged') {
      return 'Invariata';
    }
    return 'Errore';
  }

  protected readonly resultTone = computed<'success' | 'warning' | 'error'>(() => {
    const data = this.result();
    if (!data) {
      return 'success';
    }
    if (data.updated === 0 && data.failed > 0) {
      return 'error';
    }
    if (data.failed > 0 || data.skipped > 0) {
      return 'warning';
    }
    return 'success';
  });

  protected readonly resultMessage = computed(() => {
    const data = this.result();
    if (!data) {
      return '';
    }
    if (data.updated === 0 && data.failed === 0) {
      return 'Nessuna giacenza aggiornata: le righe erano già allineate o sono state saltate.';
    }
    if (data.updated === 0) {
      return 'Import non riuscito: nessuna giacenza è stata aggiornata. Controlla i dettagli qui sotto.';
    }
    const parts = [`${data.updated} giacenze aggiornate`];
    if (data.unchanged > 0) {
      parts.push(`${data.unchanged} già allineate`);
    }
    if (data.skipped > 0) {
      parts.push(`${data.skipped} saltate`);
    }
    if (data.failed > 0) {
      parts.push(`${data.failed} non aggiornate per errori`);
    }
    return `${parts.join(' · ')}.`;
  });

  protected resultStatusLabel(status: 'updated' | 'unchanged' | 'skipped' | 'failed'): string {
    if (status === 'updated') {
      return 'Aggiornata';
    }
    if (status === 'unchanged') {
      return 'Invariata';
    }
    if (status === 'skipped') {
      return 'Saltata';
    }
    return 'Fallita';
  }

  protected resultStatusTone(
    status: 'updated' | 'unchanged' | 'skipped' | 'failed',
  ): 'success' | 'warning' | 'error' | 'neutral' {
    if (status === 'updated') {
      return 'success';
    }
    if (status === 'unchanged') {
      return 'neutral';
    }
    if (status === 'skipped') {
      return 'warning';
    }
    return 'error';
  }
}
