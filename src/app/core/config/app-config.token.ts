import { InjectionToken } from '@angular/core';

import type { AppConfig } from './app-config.model';

/**
 * Token DI per la config applicativa pubblica.
 * I service iniettano APP_CONFIG invece di importare `environment` direttamente
 * (disaccoppiamento + testabilita').
 */
export const APP_CONFIG = new InjectionToken<AppConfig>('APP_CONFIG');
