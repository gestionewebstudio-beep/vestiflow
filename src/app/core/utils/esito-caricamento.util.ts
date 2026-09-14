import { catchError, map, of } from 'rxjs';
import type { Observable, OperatorFunction } from 'rxjs';

/**
 * L’esito di un caricamento di RIFERIMENTO (Codici IVA, impostazioni aziendali…):
 * arrivato con i dati, oppure fallito. Mai «vuoto per errore».
 *
 * ⛔ `catchError(() => of([]))` trasforma connessione rifiutata, 500 e 403 nella
 *    stessa cosa di «davvero nessun dato», e la schermata lo presenta come una
 *    configurazione legittima (misurato l’11/09/2026 sulla scheda articolo:
 *    «Prezzi netti: senza un Codice IVA…» e Listini vuoti con l’API spenta).
 *    Chi conserva l’esito può dire l’errore, e lasciare che si ritenti.
 */
export type EsitoCaricamento<T> = { readonly ok: true; readonly data: T } | { readonly ok: false };

/** Avvolge la sorgente: dati → `{ ok: true, data }`, errore → `{ ok: false }`. */
export function conEsito<T>(): OperatorFunction<T, EsitoCaricamento<T>> {
  return (source: Observable<T>) =>
    source.pipe(
      map((data): EsitoCaricamento<T> => ({ ok: true, data })),
      catchError(() => of<EsitoCaricamento<T>>({ ok: false })),
    );
}

/** I dati se arrivati, altrimenti il ripiego — dichiarato da chi lo chiede. */
export function datiOppure<T>(esito: EsitoCaricamento<T> | null | undefined, ripiego: T): T {
  return esito?.ok ? esito.data : ripiego;
}
