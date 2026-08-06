import { inject, Injectable } from '@angular/core';
import { timeout, type Observable } from 'rxjs';

import { APP_CONFIG } from '@core/config/app-config.token';
import { ApiHttpClient } from '@core/http/api-http.client';
import type {
  Attachment,
  AttachmentEntityType,
  AttachmentQuota,
} from '@core/models/attachment.model';
import type { EntityId } from '@core/models/common.model';

const HTTP_TIMEOUT_MS = 20000;
const DOWNLOAD_TIMEOUT_MS = 60000;

/**
 * Client del sottosistema Allegati generico. Gli endpoint restano sui
 * controller delle entità (così i gate di accesso non vengono aggirati):
 * qui si mappa solo entityType → segmento di rotta.
 */
@Injectable({ providedIn: 'root' })
export class AttachmentsApiService {
  private readonly http = inject(ApiHttpClient);
  private readonly config = inject(APP_CONFIG);

  list(entityType: AttachmentEntityType, entityId: EntityId): Observable<readonly Attachment[]> {
    return this.http
      .get<readonly Attachment[]>(this.baseUrl(entityType, entityId))
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  upload(entityType: AttachmentEntityType, entityId: EntityId, file: File): Observable<Attachment> {
    const formData = new FormData();
    formData.append('file', file, file.name);
    return this.http
      .post<Attachment>(this.baseUrl(entityType, entityId), formData)
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  /** Spazio allegati dell'entità (indicatore nella modale). */
  quota(entityType: AttachmentEntityType, entityId: EntityId): Observable<AttachmentQuota> {
    return this.http
      .get<AttachmentQuota>(`${this.baseUrl(entityType, entityId)}/quota`)
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  /** Rinomina: cambia solo il nome mostrato, i byte restano dove sono. */
  rename(
    entityType: AttachmentEntityType,
    entityId: EntityId,
    attachmentId: EntityId,
    fileName: string,
  ): Observable<Attachment> {
    return this.http
      .patch<Attachment>(`${this.baseUrl(entityType, entityId)}/${attachmentId}`, { fileName })
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  /** Byte dell'allegato: il bucket è privato, il download passa dall'API. */
  download(
    entityType: AttachmentEntityType,
    entityId: EntityId,
    attachmentId: EntityId,
  ): Observable<Blob> {
    return this.http
      .get(`${this.baseUrl(entityType, entityId)}/${attachmentId}/download`, {
        responseType: 'blob',
      })
      .pipe(timeout(DOWNLOAD_TIMEOUT_MS));
  }

  delete(
    entityType: AttachmentEntityType,
    entityId: EntityId,
    attachmentId: EntityId,
  ): Observable<void> {
    return this.http
      .delete<void>(`${this.baseUrl(entityType, entityId)}/${attachmentId}`)
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  private baseUrl(entityType: AttachmentEntityType, entityId: EntityId): string {
    const segment = entityType === 'document' ? 'documents' : 'sales-orders';
    return `${this.config.apiBaseUrl}/${segment}/${entityId}/attachments`;
  }
}
