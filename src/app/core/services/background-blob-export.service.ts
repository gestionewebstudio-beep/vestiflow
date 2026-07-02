import { Injectable, inject, signal } from '@angular/core';
import { finalize, type Observable, Subscription } from 'rxjs';

import { ToastService } from '@core/services/toast.service';

export interface BackgroundBlobExportOptions {
  /** Identificativo univoco per evitare export duplicati e riflettere lo stato in UI. */
  readonly exportId: string;
  readonly request: Observable<Blob>;
  readonly filename: string;
  readonly inProgressMessage?: string;
  readonly successMessage?: string;
  readonly errorMessage?: string;
}

/**
 * Export blob (CSV, ZIP, …) sopravvive al cambio pagina: la subscription vive in root
 * e al completamento avvia il download + toast informativo.
 */
@Injectable({ providedIn: 'root' })
export class BackgroundBlobExportService {
  private readonly toast = inject(ToastService);

  private readonly _activeExportIds = signal<ReadonlySet<string>>(new Set());
  readonly activeExportIds = this._activeExportIds.asReadonly();

  private readonly subscriptions = new Map<string, Subscription>();

  isActive(exportId: string): boolean {
    return this._activeExportIds().has(exportId);
  }

  start(options: BackgroundBlobExportOptions): void {
    if (this.isActive(options.exportId)) {
      return;
    }

    this.setActive(options.exportId, true);

    if (options.inProgressMessage) {
      this.toast.showInfo(options.inProgressMessage);
    }

    const subscription = options.request
      .pipe(
        finalize(() => {
          this.setActive(options.exportId, false);
          this.subscriptions.delete(options.exportId);
        }),
      )
      .subscribe({
        next: (blob) => {
          this.downloadBlob(blob, options.filename);
          this.toast.showInfo(options.successMessage ?? 'Export completato.');
        },
        error: () => {
          this.toast.showError(options.errorMessage ?? 'Export non riuscito.');
        },
      });

    this.subscriptions.set(options.exportId, subscription);
  }

  private setActive(exportId: string, active: boolean): void {
    this._activeExportIds.update((current) => {
      const next = new Set(current);
      if (active) {
        next.add(exportId);
      } else {
        next.delete(exportId);
      }
      return next;
    });
  }

  private downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }
}
