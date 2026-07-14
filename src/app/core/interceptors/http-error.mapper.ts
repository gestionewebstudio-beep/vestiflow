import { HttpErrorResponse } from '@angular/common/http';

import { AppErrorKind } from '@core/models';
import type { AppError } from '@core/models';

// Messaggi generici per l'utente (nessun dettaglio tecnico esposto).
const MESSAGES: Record<AppErrorKind, string> = {
  [AppErrorKind.Network]: 'Impossibile contattare il server. Controlla la connessione.',
  [AppErrorKind.Timeout]: 'La richiesta ha impiegato troppo tempo. Riprova.',
  [AppErrorKind.Unauthorized]: 'Sessione non valida o scaduta. Effettua di nuovo l’accesso.',
  [AppErrorKind.Forbidden]: 'Non hai i permessi per eseguire questa operazione.',
  [AppErrorKind.NotFound]: 'Risorsa non trovata.',
  [AppErrorKind.Conflict]: 'Conflitto con lo stato attuale dei dati.',
  [AppErrorKind.Validation]: 'Alcuni dati non sono validi.',
  [AppErrorKind.RateLimited]: 'Troppe richieste. Attendi qualche istante e riprova.',
  [AppErrorKind.MfaRequired]: 'Completa la verifica a due fattori per continuare.',
  [AppErrorKind.Server]: 'Errore del server. Riprova più tardi.',
  [AppErrorKind.Unknown]: 'Si è verificato un errore imprevisto.',
};

function kindFromStatus(status: number): AppErrorKind {
  switch (status) {
    case 0:
      return AppErrorKind.Network;
    case 401:
      return AppErrorKind.Unauthorized;
    case 403:
      return AppErrorKind.Forbidden;
    case 404:
      return AppErrorKind.NotFound;
    case 409:
      return AppErrorKind.Conflict;
    case 400:
      return AppErrorKind.Validation;
    case 422:
      return AppErrorKind.Validation;
    case 429:
      return AppErrorKind.RateLimited;
    default:
      return status >= 500 ? AppErrorKind.Server : AppErrorKind.Unknown;
  }
}

/**
 * Seconda linea di difesa (la primaria è lato backend: vedi
 * api/src/common/validation/validation-exception.factory.ts e
 * api/src/main.ts). Se per qualunque motivo un messaggio tecnico grezzo
 * dovesse comunque arrivare dal server (endpoint non aggiornato, proxy,
 * eccezione non prevista), questi pattern intercettano i segnali più
 * comuni e forzano un messaggio generico invece di mostrarlo all'utente.
 * Non è un elenco esaustivo di casi noti: è euristico, per stringhe che
 * "sembrano" un dettaglio interno piuttosto che un messaggio di dominio
 * scritto per l'utente (che nel progetto è sempre in italiano).
 */
const TECHNICAL_MESSAGE_PATTERNS: readonly RegExp[] = [
  // "Error: qualcosa" — tipico di Error#toString() lasciato passare grezzo.
  /\bError:\s/,
  // Riga di stack trace: "at Function (file.ts:12:34)".
  /\bat\s+\S+\s*\([^)]*:\d+:\d+\)/,
  // Nome di eccezione tecnica (Prisma, TypeORM, JS runtime, ecc.).
  /\b[A-Z][A-Za-z0-9]*(Exception|Error)\b/,
  // Messaggi grezzi di class-validator: "property xyz should not exist",
  // "xyz must be a string", "xyz should not be empty".
  /\bproperty\s+\S+\s+should not exist\b/i,
  /\b[a-zA-Z0-9_.]+\s+(must|should)\s+(be|not be|match|contain)\b/i,
];

function looksLikeTechnicalMessage(message: string): boolean {
  return TECHNICAL_MESSAGE_PATTERNS.some((pattern) => pattern.test(message));
}

function extractServerMessage(error: HttpErrorResponse): string | undefined {
  const body: unknown = error.error;
  if (typeof body === 'string' && body.trim().length > 0) {
    return body.trim();
  }
  if (typeof body === 'object' && body !== null && 'message' in body) {
    const message = (body as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim().length > 0) {
      return message.trim();
    }
    if (Array.isArray(message) && typeof message[0] === 'string') {
      return message[0].trim();
    }
  }
  return undefined;
}

/**
 * Normalizza un errore HTTP (o qualsiasi errore) in AppError di dominio.
 * Funzione pura: facilmente testabile in isolamento.
 */
export function mapHttpErrorToAppError(error: unknown): AppError {
  if (error instanceof HttpErrorResponse) {
    const kind = kindFromStatus(error.status);
    const serverMessage = extractServerMessage(error);
    const safeServerMessage =
      serverMessage && !looksLikeTechnicalMessage(serverMessage) ? serverMessage : undefined;
    return {
      kind,
      message: safeServerMessage ?? MESSAGES[kind],
      status: error.status,
      details: error,
    };
  }

  return {
    kind: AppErrorKind.Unknown,
    message: MESSAGES[AppErrorKind.Unknown],
    details: error,
  };
}
