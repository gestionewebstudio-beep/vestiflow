import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  ApplicationConfig,
  ErrorHandler,
  inject,
  isDevMode,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import {
  provideRouter,
  RouteReuseStrategy,
  withPreloading,
  PreloadAllModules,
} from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';
import { map, tap } from 'rxjs';

import { AUTH_GATEWAY, AuthService, authInterceptor } from '@core/auth';
import { MockAuthGateway } from '@core/auth/mock-auth.gateway';
import { SupabaseAuthGateway } from '@core/auth/supabase-auth.gateway';
import { APP_CONFIG } from '@core/config/app-config.token';
import { GlobalErrorHandler } from '@core/handlers/global-error.handler';
import { errorInterceptor } from '@core/interceptors/error.interceptor';
import { loadingInterceptor } from '@core/interceptors/loading.interceptor';
import { TabRouteReuseStrategy } from '@core/routing/tab-route-reuse.strategy';
import { supportSessionInterceptor } from '@core/support/support-session.interceptor';
import { SupportSessionService } from '@core/support/support-session.service';
import { environment } from '@env/environment';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withPreloading(PreloadAllModules)),
    { provide: RouteReuseStrategy, useClass: TabRouteReuseStrategy },
    // Ordine: loading → support session → auth → error (Bearer JWT Supabase).
    provideHttpClient(
      withInterceptors([
        loadingInterceptor,
        supportSessionInterceptor,
        authInterceptor,
        errorInterceptor,
      ]),
    ),
    { provide: APP_CONFIG, useValue: environment },
    { provide: ErrorHandler, useClass: GlobalErrorHandler },
    MockAuthGateway,
    SupabaseAuthGateway,
    {
      provide: AUTH_GATEWAY,
      useFactory: () => {
        const config = inject(APP_CONFIG);
        return config.supabase?.anonKey ? inject(SupabaseAuthGateway) : inject(MockAuthGateway);
      },
    },
    provideAppInitializer(() => {
      const supportSessions = inject(SupportSessionService);
      const auth = inject(AuthService);
      supportSessions.restoreFromStorage();
      return auth.initialize().pipe(
        tap(() => {
          const user = auth.currentUser();
          if (user?.supportSession) {
            supportSessions.syncFromProfile(user.supportSession);
            return;
          }
          if (supportSessions.sessionId()) {
            supportSessions.clearSession();
          }
        }),
        map(() => undefined),
      );
    }),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
