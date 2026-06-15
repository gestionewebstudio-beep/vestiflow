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

import { AUTH_GATEWAY, AuthService, authInterceptor } from '@core/auth';
import { MockAuthGateway } from '@core/auth/mock-auth.gateway';
import { SupabaseAuthGateway } from '@core/auth/supabase-auth.gateway';
import { APP_CONFIG } from '@core/config/app-config.token';
import { GlobalErrorHandler } from '@core/handlers/global-error.handler';
import { errorInterceptor } from '@core/interceptors/error.interceptor';
import { loadingInterceptor } from '@core/interceptors/loading.interceptor';
import { TabRouteReuseStrategy } from '@core/routing/tab-route-reuse.strategy';
import { environment } from '@env/environment';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withPreloading(PreloadAllModules)),
    { provide: RouteReuseStrategy, useClass: TabRouteReuseStrategy },
    // Ordine: loading → auth → error (Bearer JWT Supabase).
    provideHttpClient(withInterceptors([loadingInterceptor, authInterceptor, errorInterceptor])),
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
    provideAppInitializer(() => inject(AuthService).initialize()),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
