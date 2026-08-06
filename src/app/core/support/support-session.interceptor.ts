import { DOCUMENT } from '@angular/common';
import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';

import { APP_CONFIG } from '@core/config/app-config.token';
import { isApiRequest } from '@core/http/api-url.util';

import { SUPPORT_SESSION_HEADER } from './support-session.constants';
import { SupportSessionService } from './support-session.service';

/** Allega l'header sessione assistenza alle richieste API quando attiva. */
export const supportSessionInterceptor: HttpInterceptorFn = (req, next) => {
  const config = inject(APP_CONFIG);
  const document = inject(DOCUMENT);
  const supportSessions = inject(SupportSessionService);

  if (!isApiRequest(req.url, config.apiBaseUrl, document)) {
    return next(req);
  }

  const sessionId = supportSessions.sessionId();
  if (!sessionId) {
    return next(req);
  }

  return next(
    req.clone({
      setHeaders: { [SUPPORT_SESSION_HEADER]: sessionId },
    }),
  );
};
