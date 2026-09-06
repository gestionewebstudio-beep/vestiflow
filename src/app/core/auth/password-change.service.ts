import { inject, Injectable } from '@angular/core';
import { map, tap, type Observable } from 'rxjs';

import { APP_CONFIG } from '@core/config/app-config.token';
import { ApiHttpClient } from '@core/http/api-http.client';

import { AuthService } from './auth.service';

/**
 * Chiusura del flusso «cambia la password iniziale»: il cambio vero avviene su
 * Supabase (AuthService.updatePassword); qui si registra sull'API che il
 * promemoria non serve più e si aggiorna il profilo in memoria.
 */
@Injectable({ providedIn: 'root' })
export class PasswordChangeService {
  private readonly http = inject(ApiHttpClient);
  private readonly config = inject(APP_CONFIG);
  private readonly auth = inject(AuthService);

  confirmPasswordChanged(): Observable<void> {
    return this.http
      .post<{ readonly mustChangePassword: boolean }>(
        `${this.config.apiBaseUrl}/auth/password-changed`,
        {},
      )
      .pipe(
        tap(() => {
          const user = this.auth.currentUser();
          if (user) {
            this.auth.setCurrentUser({ ...user, mustChangePassword: false });
          }
        }),
        map(() => undefined),
      );
  }
}
