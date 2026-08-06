import { ErrorHandler } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { AppErrorKind } from '@core/models/app-error.model';
import { GlobalErrorHandler } from './global-error.handler';
import { ObservabilityService } from '@core/services/observability.service';
import { ToastService } from '@core/services/toast.service';

describe('GlobalErrorHandler', () => {
  it('logga e mostra un toast per AppError', () => {
    const captureException = vi.fn();
    const showError = vi.fn();

    TestBed.configureTestingModule({
      providers: [
        { provide: ErrorHandler, useClass: GlobalErrorHandler },
        { provide: ObservabilityService, useValue: { captureException } },
        { provide: ToastService, useValue: { showError } },
      ],
    });

    const handler = TestBed.inject(ErrorHandler);
    handler.handleError({
      kind: AppErrorKind.Server,
      message: 'Errore del server. Riprova più tardi.',
    });

    expect(captureException).toHaveBeenCalled();
    expect(showError).toHaveBeenCalledWith('Errore del server. Riprova più tardi.');
  });
});
