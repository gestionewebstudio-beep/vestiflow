import { BadRequestException, Logger, type ValidationError } from '@nestjs/common';

/**
 * Messaggio generico mostrato al client per qualunque errore di validazione
 * DTO (campo mancante, tipo sbagliato, proprietà non prevista, ecc.). Non
 * deve mai contenere nomi di proprietà o vincoli tecnici del DTO.
 */
export const GENERIC_VALIDATION_MESSAGE =
  'I dati inviati non sono validi. Controlla i campi e riprova.';

/**
 * Appiattisce l'albero di `ValidationError` di class-validator in righe
 * leggibili "campo.sotto-campo: vincolo violato", per uso SOLO nei log
 * server-side (mai nella risposta HTTP al client).
 */
export function flattenValidationErrors(
  errors: readonly ValidationError[],
  path = '',
): string[] {
  const messages: string[] = [];
  for (const error of errors) {
    const propertyPath = path ? `${path}.${error.property}` : error.property;
    if (error.constraints) {
      messages.push(
        ...Object.values(error.constraints).map((detail) => `${propertyPath}: ${detail}`),
      );
    }
    if (error.children && error.children.length > 0) {
      messages.push(...flattenValidationErrors(error.children, propertyPath));
    }
  }
  return messages;
}

/**
 * Fabbrica dell'eccezione usata da `ValidationPipe` (main.ts) quando un DTO
 * in ingresso non supera la validazione (class-validator/whitelist).
 *
 * Il problema che risolve: di default NestJS restituisce al client i
 * messaggi tecnici grezzi di class-validator (es. "property xyz should not
 * exist", "quantity must be an integer number"), che espongono i nomi dei
 * campi/DTO interni. Qui invece rispondiamo SEMPRE con un messaggio generico
 * comprensibile, e mandiamo il dettaglio tecnico solo al logger (server-side)
 * per il debug.
 */
export function createValidationExceptionFactory(
  logger: Pick<Logger, 'warn'> = new Logger('ValidationPipe'),
): (errors: ValidationError[]) => BadRequestException {
  return (errors: ValidationError[]): BadRequestException => {
    const details = flattenValidationErrors(errors);
    logger.warn(`Validazione DTO fallita: ${details.join('; ') || 'nessun dettaglio'}`);
    return new BadRequestException(GENERIC_VALIDATION_MESSAGE);
  };
}
