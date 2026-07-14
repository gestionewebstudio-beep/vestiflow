import { BadRequestException, type ValidationError } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import {
  GENERIC_VALIDATION_MESSAGE,
  createValidationExceptionFactory,
  flattenValidationErrors,
} from './validation-exception.factory';

function buildError(overrides: Partial<ValidationError>): ValidationError {
  return {
    target: {},
    property: 'field',
    children: [],
    ...overrides,
  } as ValidationError;
}

describe('flattenValidationErrors', () => {
  it('produce righe leggibili con il percorso completo della proprietà', () => {
    const errors: ValidationError[] = [
      buildError({
        property: 'quantity',
        constraints: { isInt: 'quantity must be an integer number' },
      }),
    ];

    expect(flattenValidationErrors(errors)).toEqual(['quantity: quantity must be an integer number']);
  });

  it('scende ricorsivamente nei children con il percorso concatenato', () => {
    const errors: ValidationError[] = [
      buildError({
        property: 'lines',
        constraints: undefined,
        children: [
          buildError({
            property: '0',
            children: [
              buildError({
                property: 'sku',
                constraints: { isString: 'sku must be a string' },
              }),
            ],
          }),
        ],
      }),
    ];

    expect(flattenValidationErrors(errors)).toEqual(['lines.0.sku: sku must be a string']);
  });
});

describe('createValidationExceptionFactory', () => {
  it('restituisce un BadRequestException con messaggio generico, senza dettagli tecnici', () => {
    const logger = { warn: vi.fn() };
    const factory = createValidationExceptionFactory(logger);

    const errors: ValidationError[] = [
      buildError({
        property: 'unexpectedField',
        constraints: { whitelistValidation: 'property unexpectedField should not exist' },
      }),
      buildError({
        property: 'quantity',
        constraints: { isInt: 'quantity must be an integer number' },
      }),
    ];

    const exception = factory(errors);
    const response = exception.getResponse() as { message: string };

    expect(exception).toBeInstanceOf(BadRequestException);
    expect(response.message).toBe(GENERIC_VALIDATION_MESSAGE);
    expect(response.message).not.toContain('unexpectedField');
    expect(response.message).not.toContain('property');
    expect(response.message).not.toContain('should not exist');
    expect(response.message).not.toContain('quantity');
  });

  it('logga il dettaglio tecnico originale server-side per il debug', () => {
    const logger = { warn: vi.fn() };
    const factory = createValidationExceptionFactory(logger);

    const errors: ValidationError[] = [
      buildError({
        property: 'unexpectedField',
        constraints: { whitelistValidation: 'property unexpectedField should not exist' },
      }),
    ];

    factory(errors);

    expect(logger.warn).toHaveBeenCalledTimes(1);
    const logged = logger.warn.mock.calls[0]?.[0] as string;
    expect(logged).toContain('unexpectedField');
    expect(logged).toContain('should not exist');
  });

  it('non fallisce quando non ci sono dettagli disponibili', () => {
    const logger = { warn: vi.fn() };
    const factory = createValidationExceptionFactory(logger);

    expect(() => factory([])).not.toThrow();
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('nessun dettaglio'));
  });
});
