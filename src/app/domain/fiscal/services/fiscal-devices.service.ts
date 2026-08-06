import { inject, Injectable } from '@angular/core';
import { timeout, type Observable } from 'rxjs';

import { APP_CONFIG } from '@core/config/app-config.token';
import { ApiHttpClient } from '@core/http/api-http.client';
import type { EntityId } from '@core/models/common.model';

import type { FiscalDevice, UpsertFiscalDevicePayload } from '../models/fiscal-device.model';

const HTTP_TIMEOUT_MS = 15000;

/**
 * Configurazione stampanti fiscali per sede. La lettura serve a Impostazioni
 * e alla cassa (per sapere se la sede attiva emette); la scrittura è di
 * Impostazioni.
 */
@Injectable({ providedIn: 'root' })
export class FiscalDevicesService {
  private readonly http = inject(ApiHttpClient);
  private readonly config = inject(APP_CONFIG);

  list(): Observable<readonly FiscalDevice[]> {
    return this.http
      .get<readonly FiscalDevice[]>(this.url('/fiscal-devices'))
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  upsert(locationId: EntityId, payload: UpsertFiscalDevicePayload): Observable<FiscalDevice> {
    return this.http
      .put<FiscalDevice>(this.url(`/fiscal-devices/${locationId}`), payload)
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  remove(locationId: EntityId): Observable<void> {
    return this.http
      .delete<void>(this.url(`/fiscal-devices/${locationId}`))
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  private url(path: string): string {
    return `${this.config.apiBaseUrl}${path}`;
  }
}
