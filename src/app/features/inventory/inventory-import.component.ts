import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
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

  protected backToList(): void {
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
    this.inventoryService.previewInventoryImport(file).subscribe({
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
    this.inventoryService.importInventoryCsv(file, keys).subscribe({
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
}
