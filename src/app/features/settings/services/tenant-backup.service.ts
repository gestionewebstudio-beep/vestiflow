import { inject, Injectable } from '@angular/core';
import { map, type Observable, timeout } from 'rxjs';

import { APP_CONFIG } from '@core/config/app-config.token';
import { ApiHttpClient } from '@core/http/api-http.client';

import {
  tenantBackupImportResultFromDto,
  type TenantBackupImportResult,
  type TenantBackupImportResultDto,
} from '../models/tenant-backup.model';

const EXPORT_TIMEOUT_MS = 300_000;
const IMPORT_TIMEOUT_MS = 300_000;

@Injectable({ providedIn: 'root' })
export class TenantBackupService {
  private readonly http = inject(ApiHttpClient);
  private readonly config = inject(APP_CONFIG);

  exportBackupZip(): Observable<Blob> {
    return this.http
      .get(`${this.config.apiBaseUrl}/tenant/backup/export`, {
        responseType: 'blob',
      })
      .pipe(timeout(EXPORT_TIMEOUT_MS));
  }

  importBackupZip(file: File): Observable<TenantBackupImportResult> {
    const formData = new FormData();
    formData.append('file', file, file.name);
    return this.http
      .post<TenantBackupImportResultDto>(
        `${this.config.apiBaseUrl}/tenant/backup/import?confirm=REPLACE`,
        formData,
      )
      .pipe(timeout(IMPORT_TIMEOUT_MS), map(tenantBackupImportResultFromDto));
  }
}
