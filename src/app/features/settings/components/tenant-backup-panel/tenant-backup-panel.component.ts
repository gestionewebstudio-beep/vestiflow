import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { TENANT_BACKUP_ZIP_EXPORT_ID } from '@core/export/background-blob-export.constants';
import { BackgroundBlobExportService } from '@core/services/background-blob-export.service';
import { ButtonComponent } from '@shared/components/button/button.component';
import { ConfirmDialogComponent } from '@shared/components/confirm-dialog/confirm-dialog.component';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';

import { TenantBackupService } from '../../services/tenant-backup.service';

@Component({
  selector: 'app-tenant-backup-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonComponent, ConfirmDialogComponent, ErrorStateComponent],
  templateUrl: './tenant-backup-panel.component.html',
  styleUrl: './tenant-backup-panel.component.scss',
})
export class TenantBackupPanelComponent {
  private readonly backupService = inject(TenantBackupService);
  private readonly blobExport = inject(BackgroundBlobExportService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly importInput = viewChild<ElementRef<HTMLInputElement>>('importInput');

  protected readonly exporting = computed(() =>
    this.blobExport.isActive(TENANT_BACKUP_ZIP_EXPORT_ID),
  );
  protected readonly importDialogOpen = signal(false);
  protected readonly importing = signal(false);
  protected readonly importError = signal<string | null>(null);
  protected readonly importSuccess = signal<string | null>(null);
  protected readonly pendingImportFile = signal<File | null>(null);

  protected exportBackup(): void {
    if (this.exporting()) {
      return;
    }

    this.blobExport.start({
      exportId: TENANT_BACKUP_ZIP_EXPORT_ID,
      request: this.backupService.exportBackupZip(),
      filename: `vestiflow-backup-negozio-${new Date().toISOString().slice(0, 10)}.zip`,
      inProgressMessage:
        'Export backup negozio in corso. Puoi continuare a navigare: riceverai un avviso al termine.',
      successMessage: 'Backup negozio completato: download avviato.',
      errorMessage:
        'Export backup non riuscito. Riprova tra qualche istante o contatta il supporto.',
    });
  }

  protected openImportPicker(): void {
    this.importError.set(null);
    this.importSuccess.set(null);
    this.importInput()?.nativeElement.click();
  }

  protected onImportFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = '';
    if (!file) {
      return;
    }
    if (!file.name.toLowerCase().endsWith('.zip')) {
      this.importError.set('Seleziona un file ZIP di backup VestiFlow.');
      return;
    }
    this.pendingImportFile.set(file);
    this.importDialogOpen.set(true);
  }

  protected cancelImport(): void {
    this.importDialogOpen.set(false);
    this.pendingImportFile.set(null);
  }

  protected confirmImport(): void {
    const file = this.pendingImportFile();
    if (!file) {
      return;
    }
    this.importing.set(true);
    this.importError.set(null);
    this.importSuccess.set(null);
    this.backupService
      .importBackupZip(file)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.importing.set(false);
          this.importDialogOpen.set(false);
          this.pendingImportFile.set(null);
          const totalEntities = Object.values(result.entityCounts).reduce(
            (sum, count) => sum + count,
            0,
          );
          this.importSuccess.set(
            `Backup ripristinato: ${totalEntities} record e ${result.attachmentFilesUploaded} allegati. Ricarica la pagina se i dati non si aggiornano subito.`,
          );
        },
        error: () => {
          this.importing.set(false);
          this.importDialogOpen.set(false);
          this.pendingImportFile.set(null);
          this.importError.set(
            'Import non riuscito. Verifica che il file sia un backup di questo negozio e riprova.',
          );
        },
      });
  }
}
