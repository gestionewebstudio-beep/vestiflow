import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';

import { TabRouteReuseStrategy } from './tab-route-reuse.strategy';

/**
 * Qualunque scrittura HTTP (non-GET) invalida le pagine tenute in memoria da
 * TabRouteReuseStrategy: dopo una mutazione le liste conservate potrebbero
 * mostrare dati vecchi, quindi si buttano e al prossimo ingresso si ricaricano.
 * La cache di reuse resta valida solo finché si sta soltanto consultando.
 */
export const reuseInvalidationInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS') {
    inject(TabRouteReuseStrategy).invalidate();
  }
  return next(req);
};
