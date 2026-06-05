import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  ApplicationConfig,
  ErrorHandler,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter } from '@angular/router';

import { AUTH_GATEWAY, AuthService, authInterceptor } from '@core/auth';
import { MockAuthGateway } from '@core/auth/mock-auth.gateway';
import { APP_CONFIG } from '@core/config/app-config.token';
import { GlobalErrorHandler } from '@core/handlers/global-error.handler';
import { errorInterceptor } from '@core/interceptors/error.interceptor';
import { loadingInterceptor } from '@core/interceptors/loading.interceptor';
import { environment } from '@env/environment';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    // Ordine: loading → auth → error. error resta ultimo (piu' vicino al backend):
    // sul percorso di risposta e' il primo a normalizzare l'HttpErrorResponse.
    provideHttpClient(withInterceptors([loadingInterceptor, authInterceptor, errorInterceptor])),
    { provide: APP_CONFIG, useValue: environment },
    { provide: ErrorHandler, useClass: GlobalErrorHandler },
    // Provider auth: gateway mock sostituibile (es. FirebaseAuthGateway in futuro).
    { provide: AUTH_GATEWAY, useClass: MockAuthGateway },
    // Risolve lo stato auth iniziale prima che l'app diventi stabile.
    provideAppInitializer(() => inject(AuthService).initialize()),
  ],
};
