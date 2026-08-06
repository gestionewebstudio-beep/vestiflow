import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { APP_CONFIG } from '@core/config/app-config.token';
import { ApiHttpClient } from '@core/http/api-http.client';

import { TenantBackupService } from './tenant-backup.service';

const API_BASE = 'http://localhost:3000/api/v1';

describe('TenantBackupService (HTTP)', () => {
  let service: TenantBackupService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        TenantBackupService,
        ApiHttpClient,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: APP_CONFIG, useValue: { apiBaseUrl: API_BASE } },
      ],
    });
    service = TestBed.inject(TenantBackupService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('exportBackupZip scarica blob ZIP dal endpoint export', async () => {
    const promise = firstValueFrom(service.exportBackupZip());

    const req = httpMock.expectOne(`${API_BASE}/tenant/backup/export`);
    expect(req.request.method).toBe('GET');
    expect(req.request.responseType).toBe('blob');
    req.flush(new Blob(['zip-content'], { type: 'application/zip' }));

    const blob = await promise;
    expect(blob.type).toBe('application/zip');
  });

  it('importBackupZip invia FormData con confirm REPLACE', async () => {
    const file = new File(['zip-content'], 'backup.zip', { type: 'application/zip' });
    const promise = firstValueFrom(service.importBackupZip(file));

    const req = httpMock.expectOne(`${API_BASE}/tenant/backup/import?confirm=REPLACE`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toBeInstanceOf(FormData);
    req.flush({
      tenantId: 'tenant-1',
      importedAt: '2026-01-01T00:00:00.000Z',
      entityCounts: { stores: 1, products: 5 },
      attachmentFilesUploaded: 2,
    });

    const result = await promise;
    expect(result.tenantId).toBe('tenant-1');
    expect(result.entityCounts).toEqual({ stores: 1, products: 5 });
    expect(result.attachmentFilesUploaded).toBe(2);
  });
});
