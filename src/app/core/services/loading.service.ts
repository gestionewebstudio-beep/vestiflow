import { Injectable, computed, signal } from '@angular/core';

/**
 * Stato di caricamento globale basato su un contatore di richieste attive.
 * Robusto con richieste concorrenti: `isLoading` resta true finche' almeno
 * una richiesta e' in volo. Nessuna UI qui: solo lo stato.
 */
@Injectable({ providedIn: 'root' })
export class LoadingService {
  private readonly _activeRequests = signal(0);

  /** Numero di richieste attualmente in corso. */
  readonly activeRequests = this._activeRequests.asReadonly();

  /** True quando c'e' almeno una richiesta in corso. */
  readonly isLoading = computed(() => this._activeRequests() > 0);

  /** Segnala l'inizio di una richiesta. */
  start(): void {
    this._activeRequests.update((count) => count + 1);
  }

  /** Segnala la fine di una richiesta (clamp a 0 per evitare valori negativi). */
  stop(): void {
    this._activeRequests.update((count) => (count > 0 ? count - 1 : 0));
  }
}
