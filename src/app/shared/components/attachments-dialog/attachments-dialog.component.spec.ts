import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Attachment } from '@core/models/attachment.model';

import { AttachmentsDialogComponent } from './attachments-dialog.component';

// jsdom non implementa il <dialog> nativo: stesso polyfill degli altri
// componenti che usano showModal() (es. tenant-backup-panel).
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function showModal(this: HTMLDialogElement) {
    this.open = true;
  });
  HTMLDialogElement.prototype.close = vi.fn(function close(this: HTMLDialogElement) {
    this.open = false;
  });
});

function attachment(overrides: Partial<Attachment> = {}): Attachment {
  return {
    id: 'att-1',
    fileName: 'fattura.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 1024 * 1024,
    createdByName: 'Mario',
    createdAt: '2026-07-20T10:00:00.000Z',
    ...overrides,
  };
}

/** File finto con una dimensione dichiarata (il contenuto reale è 1 byte). */
function file(name: string, type: string, sizeBytes: number): File {
  const created = new File(['x'], name, { type });
  Object.defineProperty(created, 'size', { value: sizeBytes });
  return created;
}

async function setup(options?: {
  readonly attachments?: readonly Attachment[];
  readonly canManage?: boolean;
}) {
  const filesSelected = vi.fn();
  const deleteRequested = vi.fn();
  const renameRequested = vi.fn();

  const { fixture } = await render(AttachmentsDialogComponent, {
    inputs: {
      open: true,
      attachments: options?.attachments ?? [],
      canManage: options?.canManage ?? true,
    },
    on: { filesSelected, deleteRequested, renameRequested },
  });

  return { fixture, filesSelected, deleteRequested, renameRequested };
}

/** L'input file è nascosto ma raggiungibile: userEvent.upload lo pilota. */
function fileInput(fixture: { nativeElement: HTMLElement }): HTMLInputElement {
  return fixture.nativeElement.querySelector<HTMLInputElement>('input[type="file"]')!;
}

describe('AttachmentsDialogComponent', () => {
  it('mostra lo spazio usato sul totale disponibile', async () => {
    await setup({
      attachments: [attachment({ sizeBytes: 3.2 * 1024 * 1024 })],
    });

    expect(screen.getByText('3,2 MB usati di 20 MB')).toBeTruthy();
  });

  it('accetta un PDF valido e lo propaga al contenitore', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0, applyAccept: false });
    const { fixture, filesSelected } = await setup();

    await user.upload(fileInput(fixture), file('fattura.pdf', 'application/pdf', 1024));

    expect(filesSelected).toHaveBeenCalledTimes(1);
  });

  // Il bug originale: un PDF veniva rifiutato. Qui si verifica che i formati
  // della spec passino tutti la validazione client.
  it('accetta tutti i formati previsti dalla spec', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0, applyAccept: false });
    const { fixture, filesSelected } = await setup();

    await user.upload(fileInput(fixture), [
      file('a.pdf', 'application/pdf', 1024),
      file('b.jpg', 'image/jpeg', 1024),
      file('c.png', 'image/png', 1024),
      // HEIC e Office arrivano spesso senza MIME: vale l'estensione.
      file('d.heic', '', 1024),
      file('e.docx', 'application/octet-stream', 1024),
      file('f.xlsx', 'application/octet-stream', 1024),
    ]);

    expect(filesSelected).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('rifiuta un formato non accettato con il messaggio della spec', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0, applyAccept: false });
    const { fixture, filesSelected } = await setup();

    await user.upload(fileInput(fixture), file('clip.mp4', 'video/mp4', 1024));

    expect(filesSelected).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        'Formato non supportato. Formati accettati: PDF, JPG, PNG, HEIC, DOCX, XLSX.',
      ),
    ).toBeTruthy();
  });

  it('rifiuta un file oltre 5 MB indicando il peso reale', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0, applyAccept: false });
    const { fixture, filesSelected } = await setup();

    await user.upload(fileInput(fixture), file('grosso.pdf', 'application/pdf', 7.3 * 1024 * 1024));

    expect(filesSelected).not.toHaveBeenCalled();
    expect(
      screen.getByText('File troppo grande. Massimo 5 MB per file. Il file pesa 7,3 MB.'),
    ).toBeTruthy();
  });

  it('blocca il superamento del totale documento elencando lo spazio usato', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0, applyAccept: false });
    const { fixture, filesSelected } = await setup({
      attachments: [attachment({ sizeBytes: 18 * 1024 * 1024 })],
    });

    await user.upload(fileInput(fixture), file('nuovo.pdf', 'application/pdf', 5 * 1024 * 1024));

    expect(filesSelected).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        'Spazio esaurito per questo documento. Massimo 20 MB totali di allegati. ' +
          'Usati: 18 MB. Il nuovo file: 5 MB. Elimina un allegato per far spazio.',
      ),
    ).toBeTruthy();
    // Gli allegati restano elencati: si libera spazio senza uscire dalla modale.
    expect(screen.getByRole('button', { name: 'Elimina fattura.pdf' })).toBeTruthy();
  });

  it('chiede l’eliminazione dell’allegato scelto', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0, applyAccept: false });
    const { deleteRequested } = await setup({ attachments: [attachment()] });

    await user.click(screen.getByRole('button', { name: 'Elimina fattura.pdf' }));

    expect(deleteRequested).toHaveBeenCalledTimes(1);
  });

  it('rinomina un allegato dalla riga', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0, applyAccept: false });
    const { renameRequested } = await setup({ attachments: [attachment()] });

    await user.click(screen.getByRole('button', { name: 'Rinomina fattura.pdf' }));
    const input = screen.getByLabelText<HTMLInputElement>('Nuovo nome per fattura.pdf');
    await user.clear(input);
    await user.type(input, 'fattura-acme.pdf');
    await user.click(screen.getByRole('button', { name: 'Salva' }));

    expect(renameRequested).toHaveBeenCalledWith({
      attachmentId: 'att-1',
      fileName: 'fattura-acme.pdf',
    });
  });

  it('senza permessi non mostra area di caricamento né azioni di modifica', async () => {
    await setup({ attachments: [attachment()], canManage: false });

    expect(screen.queryByText(/Trascina qui i file/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Elimina fattura.pdf' })).toBeNull();
    // Il download resta disponibile in sola lettura.
    expect(screen.getByRole('button', { name: 'Scarica fattura.pdf' })).toBeTruthy();
  });
});
