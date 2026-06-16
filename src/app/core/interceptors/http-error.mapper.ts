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
    case 422:
      return AppErrorKind.Validation;
    case 429:
      return AppErrorKind.RateLimited;
    default:
      return status >= 500 ? AppErrorKind.Server : AppErrorKind.Unknown;
  }
}

/**
 * Normalizza un errore HTTP (o qualsiasi errore) in AppError di dominio.
 * Funzione pura: facilmente testabile in isolamento.
 */
export function mapHttpErrorToAppError(error: unknown): AppError {
  if (error instanceof HttpErrorResponse) {
    const kind = kindFromStatus(error.status);
    return {
      kind,
      message: MESSAGES[kind],
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
