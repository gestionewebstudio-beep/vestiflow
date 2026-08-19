import { DOCUMENT } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { DestroyRef, Injectable, effect, inject } from '@angular/core';
import { switchMap } from 'rxjs';

import { APP_CONFIG } from '@core/config/app-config.token';

import { AuthService } from './auth.service';
import { fetchUserProfile } from './fetch-user-profile.util';

/**
 * Rilegge il profilo — e con esso i permessi — mentre la sessione è aperta.
 *
 * Senza, un permesso revocato non arriva mai a chi sta lavorando: i permessi
 * non viaggiano nel token, entrano dal solo `GET /auth/me`, e quella chiamata
 * parte al bootstrap e al login. La sessione però è persistita e il token si
 * rinnova da solo, quindi una scheda aperta può mostrare per giorni i permessi
 * di quando è stata aperta. Chi revoca crede di aver revocato, chi lavora
 * continua a vedere i pulsanti.
 *
 * Non è un controllo di sicurezza — quello è e resta il server, che nega
 * comunque. È il pareggio fra ciò che l'operatore vede e ciò che può fare.
 */

/** Ogni quanto rileggere il profilo a scheda attiva. */
const REFRESH_INTERVAL_MS = 3 * 60 * 1000;

/**
 * Distanza minima fra due riletture: senza, un alt-tab ripetuto genererebbe
 * una raffica di chiamate.
 */
const MIN_GAP_MS = 30 * 1000;

@Injectable({ providedIn: 'root' })
export class ProfileRefreshService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(APP_CONFIG);
  private readonly auth = inject(AuthService);
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);

  private timerId: ReturnType<typeof setInterval> | null = null;
  private lastRefreshAt = 0;
  private inFlight = false;

  private readonly onVisibilityChange = (): void => {
    if (this.document.visibilityState === 'visible') {
      this.refresh();
    }
  };

  /**
   * Il timer esiste solo mentre la sessione è aperta: segue lo stato invece di
   * girare a vuoto sulla schermata di accesso. Il servizio va istanziato dal
   * composition root (`app.config.ts`) — nessuno lo inietta per usarlo.
   */
  constructor() {
    effect(() => {
      if (this.auth.isAuthenticated()) {
        this.startWatching();
      } else {
        this.stopWatching();
      }
    });

    this.destroyRef.onDestroy(() => this.stopWatching());
  }

  private startWatching(): void {
    if (this.timerId !== null) {
      return;
    }
    this.timerId = setInterval(() => this.refresh(), REFRESH_INTERVAL_MS);
    this.document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  private stopWatching(): void {
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    this.document.removeEventListener('visibilitychange', this.onVisibilityChange);
  }

  /**
   * Un errore qui non deve fare niente di visibile: una rete che cade non è
   * una sessione scaduta, e buttare fuori l'operatore a metà di un documento
   * sarebbe un danno peggiore del permesso stantio che stiamo correggendo.
   * Al prossimo giro riprova.
   */
  private refresh(): void {
    if (this.inFlight || !this.auth.isAuthenticated()) {
      return;
    }
    const now = Date.now();
    if (now - this.lastRefreshAt < MIN_GAP_MS) {
      return;
    }
    this.lastRefreshAt = now;
    this.inFlight = true;

    this.auth
      .getToken()
      .pipe(
        switchMap((token) => {
          if (!token) {
            throw new Error('nessun token');
          }
          return fetchUserProfile(this.http, this.config.apiBaseUrl, token);
        }),
      )
      .subscribe({
        next: (user) => {
          this.inFlight = false;
          if (this.auth.isAuthenticated()) {
            this.auth.setCurrentUser(user);
          }
        },
        error: () => {
          this.inFlight = false;
        },
      });
  }
}
