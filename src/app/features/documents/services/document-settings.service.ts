import { inject, Injectable } from '@angular/core';
import { map, type Observable, timeout } from 'rxjs';

import { APP_CONFIG } from '@core/config/app-config.token';
import { ApiHttpClient } from '@core/http/api-http.client';
import type { DocumentType, DocumentTypeSetting } from '@core/models/document.model';

const HTTP_TIMEOUT_MS = 15000;

/** Aggiornamento parziale della configurazione di un tipo documento (§2.2). */
export interface DocumentTypeSettingPatch {
  readonly printTitle?: string;
  readonly autoNumbering?: boolean;
  readonly numberPrefix?: string;
  readonly defaultSeries?: string;
  // ⚠️ `pricesIncludeVat` non c'è più: era un default netto/ivato per TIPO
  // documento che nessun pannello esponeva e che il ripiego del server non
  // raggiungeva mai. Al suo posto c'è la convenzione aziendale
  // (Impostazioni → Prezzi), che è di tenant e non di tipo.
  readonly defaultNotes?: string;
}

@Injectable({ providedIn: 'root' })
export class DocumentSettingsService {
  private readonly http = inject(ApiHttpClient);
  private readonly config = inject(APP_CONFIG);

  getSettings(): Observable<readonly DocumentTypeSetting[]> {
    return this.http.get<DocumentTypeSetting[]>(this.url('/document-settings')).pipe(
      timeout(HTTP_TIMEOUT_MS),
      map((rows) => rows),
    );
  }

  updateSetting(
    type: DocumentType,
    patch: DocumentTypeSettingPatch,
  ): Observable<DocumentTypeSetting> {
    return this.http
      .patch<DocumentTypeSetting>(this.url(`/document-settings/${type}`), patch)
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  private url(path: string): string {
    return `${this.config.apiBaseUrl}${path}`;
  }
}
