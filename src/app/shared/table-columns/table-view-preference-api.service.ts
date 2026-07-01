import { inject, Injectable } from '@angular/core';
import { catchError, map, type Observable, of, timeout } from 'rxjs';

import { APP_CONFIG } from '@core/config/app-config.token';
import { ApiHttpClient } from '@core/http/api-http.client';

import type { TableViewState } from './table-column.model';
import { parseTableViewStateJson } from './table-view-state.util';

const HTTP_TIMEOUT_MS = 15000;

interface TableViewPreferenceRow {
  readonly stateJson: string;
}

/**
 * Persistenza preferenze colonne tabella lato server (C3).
 * Fallback localStorage gestito da TableColumnPreferenceService.
 */
@Injectable({ providedIn: 'root' })
export class TableViewPreferenceApiService {
  private readonly http = inject(ApiHttpClient);
  private readonly config = inject(APP_CONFIG);

  load(viewId: string): Observable<TableViewState | null> {
    return this.http
      .get<TableViewPreferenceRow | null>(this.url(`/users/me/table-views/${viewId}`))
      .pipe(
        timeout(HTTP_TIMEOUT_MS),
        map((row) => (row?.stateJson ? parseTableViewStateJson(row.stateJson) : null)),
        catchError(() => of(null)),
      );
  }

  save(viewId: string, state: TableViewState): Observable<void> {
    return this.http
      .put<TableViewPreferenceRow>(this.url(`/users/me/table-views/${viewId}`), {
        stateJson: JSON.stringify(state),
      })
      .pipe(
        timeout(HTTP_TIMEOUT_MS),
        map(() => undefined),
        catchError(() => of(undefined)),
      );
  }

  private url(path: string): string {
    return `${this.config.apiBaseUrl}${path}`;
  }
}
