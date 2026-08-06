import { inject, Injectable } from '@angular/core';
import { timeout, type Observable } from 'rxjs';

import { APP_CONFIG } from '@core/config/app-config.token';
import { ApiHttpClient } from '@core/http/api-http.client';
import type { EntityId } from '@core/models/common.model';

import type {
  CreatePosTerminalPayload,
  PosTerminal,
  UpdatePosTerminalPayload,
} from '../models/pos-terminal.model';

const HTTP_TIMEOUT_MS = 15000;

/** Anagrafica terminali POS (adempimento portale, Impostazioni). */
@Injectable({ providedIn: 'root' })
export class PosTerminalsService {
  private readonly http = inject(ApiHttpClient);
  private readonly config = inject(APP_CONFIG);

  list(): Observable<readonly PosTerminal[]> {
    return this.http
      .get<readonly PosTerminal[]>(this.url('/pos-terminals'))
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  create(payload: CreatePosTerminalPayload): Observable<PosTerminal> {
    return this.http
      .post<PosTerminal>(this.url('/pos-terminals'), payload)
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  update(id: EntityId, payload: UpdatePosTerminalPayload): Observable<PosTerminal> {
    return this.http
      .patch<PosTerminal>(this.url(`/pos-terminals/${id}`), payload)
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  remove(id: EntityId): Observable<void> {
    return this.http.delete<void>(this.url(`/pos-terminals/${id}`)).pipe(timeout(HTTP_TIMEOUT_MS));
  }

  private url(path: string): string {
    return `${this.config.apiBaseUrl}${path}`;
  }
}
