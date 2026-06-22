import { HttpErrorResponse } from '@angular/common/http';
import { describe, expect, it } from 'vitest';

import { AppErrorKind } from '@core/models';

import { mapHttpErrorToAppError } from './http-error.mapper';

describe('mapHttpErrorToAppError', () => {
  it('mappa status HTTP in AppErrorKind', () => {
    expect(mapHttpErrorToAppError(new HttpErrorResponse({ status: 401 })).kind).toBe(
      AppErrorKind.Unauthorized,
    );
    expect(mapHttpErrorToAppError(new HttpErrorResponse({ status: 403 })).kind).toBe(
      AppErrorKind.Forbidden,
    );
    expect(mapHttpErrorToAppError(new HttpErrorResponse({ status: 404 })).kind).toBe(
      AppErrorKind.NotFound,
    );
    expect(mapHttpErrorToAppError(new HttpErrorResponse({ status: 409 })).kind).toBe(
      AppErrorKind.Conflict,
    );
    expect(mapHttpErrorToAppError(new HttpErrorResponse({ status: 422 })).kind).toBe(
      AppErrorKind.Validation,
    );
    expect(mapHttpErrorToAppError(new HttpErrorResponse({ status: 429 })).kind).toBe(
      AppErrorKind.RateLimited,
    );
    expect(mapHttpErrorToAppError(new HttpErrorResponse({ status: 500 })).kind).toBe(
      AppErrorKind.Server,
    );
    expect(mapHttpErrorToAppError(new HttpErrorResponse({ status: 0 })).kind).toBe(
      AppErrorKind.Network,
    );
  });

  it('estrae messaggio dal body stringa o oggetto', () => {
    const fromString = mapHttpErrorToAppError(
      new HttpErrorResponse({ status: 400, error: '  SKU duplicato  ' }),
    );
    expect(fromString.message).toBe('SKU duplicato');

    const fromObject = mapHttpErrorToAppError(
      new HttpErrorResponse({ status: 400, error: { message: 'Campo obbligatorio' } }),
    );
    expect(fromObject.message).toBe('Campo obbligatorio');

    const fromArray = mapHttpErrorToAppError(
      new HttpErrorResponse({ status: 400, error: { message: ['Primo errore', 'Secondo'] } }),
    );
    expect(fromArray.message).toBe('Primo errore');
  });

  it('usa messaggio generico se body assente', () => {
    const result = mapHttpErrorToAppError(new HttpErrorResponse({ status: 404 }));
    expect(result.message).toContain('Risorsa non trovata');
  });

  it('gestisce errori non-HTTP', () => {
    const result = mapHttpErrorToAppError(new Error('boom'));
    expect(result.kind).toBe(AppErrorKind.Unknown);
    expect(result.message).toContain('imprevisto');
  });
});
