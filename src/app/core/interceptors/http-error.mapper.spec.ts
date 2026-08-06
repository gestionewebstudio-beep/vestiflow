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

  describe('seconda linea di difesa: messaggi tecnici residui', () => {
    it('sostituisce un messaggio di validazione grezzo (class-validator) con quello generico', () => {
      const result = mapHttpErrorToAppError(
        new HttpErrorResponse({
          status: 400,
          error: { message: 'property unexpectedField should not exist' },
        }),
      );
      expect(result.message).not.toContain('unexpectedField');
      expect(result.message).not.toContain('property');
      expect(result.message).not.toContain('should not exist');
    });

    it('sostituisce un vincolo "must be" grezzo con il messaggio generico', () => {
      const result = mapHttpErrorToAppError(
        new HttpErrorResponse({
          status: 400,
          error: { message: 'quantity must be an integer number' },
        }),
      );
      expect(result.message).not.toContain('quantity');
      expect(result.message).not.toContain('must be');
    });

    it("sostituisce il nome di un'eccezione tecnica (es. Prisma) con il messaggio generico", () => {
      const result = mapHttpErrorToAppError(
        new HttpErrorResponse({
          status: 500,
          error: { message: 'PrismaClientKnownRequestError: Unique constraint failed' },
        }),
      );
      expect(result.message).not.toContain('Prisma');
      expect(result.message).not.toContain('Unique constraint');
    });

    it('sostituisce una traccia di stack residua con il messaggio generico', () => {
      const result = mapHttpErrorToAppError(
        new HttpErrorResponse({
          status: 500,
          error: { message: 'Error: boom\n    at Object.<anonymous> (/app/src/foo.ts:12:34)' },
        }),
      );
      expect(result.message).not.toContain('boom');
      expect(result.message).not.toContain('.ts:12:34');
    });

    it('lascia passare inalterato un messaggio di dominio ben scritto in italiano', () => {
      const result = mapHttpErrorToAppError(
        new HttpErrorResponse({
          status: 400,
          error: { message: "Seleziona un fornitore prima di salvare l'arrivo merce." },
        }),
      );
      expect(result.message).toBe("Seleziona un fornitore prima di salvare l'arrivo merce.");
    });
  });
});
