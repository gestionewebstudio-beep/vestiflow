import { inject, Injectable } from '@angular/core';
import { map, type Observable, timeout } from 'rxjs';

import { APP_CONFIG } from '@core/config/app-config.token';
import { ApiHttpClient } from '@core/http/api-http.client';
import type { TikTokConnection } from '@core/models/tiktok-connection.model';

import { tiktokConnectionFromDto } from '../models/tiktok-connection.mapper';
import type { TikTokClearErrorsDto, TikTokConnectionDto } from '../models/tiktok-connection.dto';

const HTTP_TIMEOUT_MS = 15_000;

@Injectable({ providedIn: 'root' })
export class TikTokConnectionService {
  private readonly http = inject(ApiHttpClient);
  private readonly config = inject(APP_CONFIG);

  getConnection(): Observable<TikTokConnection> {
    return this.http
      .get<TikTokConnectionDto>(`${this.config.apiBaseUrl}/tiktok/connection`)
      .pipe(timeout(HTTP_TIMEOUT_MS), map(tiktokConnectionFromDto));
  }

  beginAuth(): Observable<{ authorizeUrl: string }> {
    return this.http
      .post<{ authorizeUrl: string }>(`${this.config.apiBaseUrl}/tiktok/auth/begin`, {})
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  disconnect(): Observable<{ disconnected: true }> {
    return this.http
      .delete<{ disconnected: true }>(`${this.config.apiBaseUrl}/tiktok/connection`)
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  clearErrors(): Observable<TikTokClearErrorsDto> {
    return this.http
      .post<TikTokClearErrorsDto>(`${this.config.apiBaseUrl}/tiktok/connection/clear-errors`, {})
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }
}
