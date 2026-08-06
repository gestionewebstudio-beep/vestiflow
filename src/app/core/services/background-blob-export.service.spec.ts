import { TestBed } from '@angular/core/testing';
import { NEVER, of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BackgroundBlobExportService } from './background-blob-export.service';
import { ToastService } from './toast.service';

describe('BackgroundBlobExportService', () => {
  let service: BackgroundBlobExportService;
  let showInfo: ReturnType<typeof vi.fn>;
  let showError: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    showInfo = vi.fn();
    showError = vi.fn();

    TestBed.configureTestingModule({
      providers: [
        BackgroundBlobExportService,
        {
          provide: ToastService,
          useValue: { showInfo, showError },
        },
      ],
    });

    service = TestBed.inject(BackgroundBlobExportService);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('avvia download e toast al successo', () => {
    const click = vi.fn();
    const createElement = vi.spyOn(document, 'createElement').mockReturnValue({
      click,
    } as unknown as HTMLAnchorElement);
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);

    service.start({
      exportId: 'test-export',
      request: of(new Blob(['a,b'], { type: 'text/csv' })),
      filename: 'test.csv',
      successMessage: 'Fatto',
    });

    expect(service.isActive('test-export')).toBe(false);
    expect(showInfo).toHaveBeenCalledWith('Fatto');
    expect(click).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test');

    createElement.mockRestore();
    createObjectURL.mockRestore();
    revokeObjectURL.mockRestore();
  });

  it('ignora un secondo export con lo stesso id', () => {
    service.start({
      exportId: 'dup',
      request: NEVER,
      filename: 'a.csv',
      inProgressMessage: 'In corso',
    });

    expect(service.isActive('dup')).toBe(true);
    expect(showInfo).toHaveBeenCalledTimes(1);

    service.start({
      exportId: 'dup',
      request: of(new Blob()),
      filename: 'b.csv',
    });

    expect(showInfo).toHaveBeenCalledTimes(1);
  });

  it('mostra toast di errore se la richiesta fallisce', () => {
    service.start({
      exportId: 'fail',
      request: throwError(() => new Error('boom')),
      filename: 'x.csv',
      errorMessage: 'Export fallito',
    });

    expect(service.isActive('fail')).toBe(false);
    expect(showError).toHaveBeenCalledWith('Export fallito');
  });
});
