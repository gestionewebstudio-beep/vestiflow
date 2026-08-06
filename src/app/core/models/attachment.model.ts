import type { EntityId, IsoDateString } from './common.model';

/** Tipi di entità a cui si possono agganciare allegati (sottosistema generico). */
export type AttachmentEntityType = 'document' | 'sales_order';

/** Allegato (metadati; i byte stanno su Supabase Storage). */
export interface Attachment {
  readonly id: EntityId;
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly createdByName: string;
  readonly createdAt: IsoDateString;
}

/** Spazio allegati di un'entità: usato, totale e residuo (byte). */
export interface AttachmentQuota {
  readonly usedBytes: number;
  readonly totalBytes: number;
  readonly remainingBytes: number;
}
