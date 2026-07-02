import { fireEvent, render, screen, waitFor } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BackgroundBlobExportService } from '@core/services/background-blob-export.service';
import { ToastService } from '@core/services/toast.service';
import { TenantBackupService } from '../../services/tenant-backup.service';
import { TenantBackupPanelComponent } from './tenant-backup-panel.component';

describe('TenantBackupPanelComponent', () => {
  const backupService = {
    exportBackupZip: vi.fn(),
    importBackupZip: vi.fn(),
  };

  const showError = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    showError.mockReset();
    HTMLDialogElement.prototype.showModal = vi.fn(function showModal(this: HTMLDialogElement) {
      this.open = true;
    });
    HTMLDialogElement.prototype.close = vi.fn(function close(this: HTMLDialogElement) {
      this.open = false;
    });
    backupService.exportBackupZip.mockReturnValue(
      of(new Blob(['zip'], { type: 'application/zip' })),
    );
    backupService.importBackupZip.mockReturnValue(
      of({
        tenantId: 'tenant-1',
        importedAt: '2026-01-01T00:00:00.000Z',
        entityCounts: { stores: 2, products: 3 },
        attachmentFilesUploaded: 1,
      }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function setup() {
    return render(TenantBackupPanelComponent, {
      providers: [
        BackgroundBlobExportService,
        { provide: TenantBackupService, useValue: backupService },
        { provide: ToastService, useValue: { showInfo: vi.fn(), showError } },
      ],
    });
  }

  function mockDownload() {
    const createObjectURL = vi.fn(() => 'blob:mock-url');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });

    const anchorClick = vi.fn();
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName === 'a') {
        return {
          click: anchorClick,
          href: '',
          download: '',
        } as unknown as HTMLAnchorElement;
      }
      return originalCreateElement(tagName);
    });

    return { createObjectURL, revokeObjectURL, anchorClick };
  }

  function selectImportFile(container: HTMLElement, file: File): void {
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
  }

  it('mostra azioni export e import', async () => {
    await setup();

    expect(screen.getByRole('button', { name: 'Esporta backup negozio' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ripristina da backup' })).toBeTruthy();
  });

  it('exportBackup scarica il blob restituito dal service', async () => {
    const user = userEvent.setup();
    const download = mockDownload();
    await setup();

    await user.click(screen.getByRole('button', { name: 'Esporta backup negozio' }));

    expect(backupService.exportBackupZip).toHaveBeenCalledOnce();
    expect(download.createObjectURL).toHaveBeenCalled();
    expect(download.anchorClick).toHaveBeenCalled();
    expect(download.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });

  it('mostra toast errore export se la chiamata fallisce', async () => {
    const user = userEvent.setup();
    backupService.exportBackupZip.mockReturnValue(throwError(() => new Error('network')));
    await setup();

    await user.click(screen.getByRole('button', { name: 'Esporta backup negozio' }));

    expect(showError).toHaveBeenCalledWith(
      'Export backup non riuscito. Riprova tra qualche istante o contatta il supporto.',
    );
  });

  it('rifiuta file import non ZIP', async () => {
    const { container } = await setup();
    selectImportFile(container, new File(['data'], 'backup.txt', { type: 'text/plain' }));

    expect(screen.getByText('Seleziona un file ZIP di backup VestiFlow.')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Ripristinare il backup?' })).toBeNull();
  });

  it('apre dialog conferma per file ZIP valido', async () => {
    const { container } = await setup();
    selectImportFile(container, new File(['zip'], 'backup.zip', { type: 'application/zip' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Ripristinare il backup?' })).toBeTruthy();
    });
  });

  it('confirmImport mostra messaggio di successo', async () => {
    const user = userEvent.setup();
    const { container } = await setup();
    const file = new File(['zip'], 'backup.zip', { type: 'application/zip' });
    selectImportFile(container, file);

    await user.click(await screen.findByRole('button', { name: 'Ripristina backup' }));

    expect(backupService.importBackupZip).toHaveBeenCalledWith(file);
    expect(
      screen.getByText(
        'Backup ripristinato: 5 record e 1 allegati. Ricarica la pagina se i dati non si aggiornano subito.',
      ),
    ).toBeTruthy();
  });

  it('mostra errore import se la chiamata fallisce', async () => {
    const user = userEvent.setup();
    backupService.importBackupZip.mockReturnValue(throwError(() => new Error('conflict')));
    const { container } = await setup();
    selectImportFile(container, new File(['zip'], 'backup.zip', { type: 'application/zip' }));

    await user.click(await screen.findByRole('button', { name: 'Ripristina backup' }));

    expect(screen.getByText('Import non riuscito')).toBeTruthy();
  });
});
