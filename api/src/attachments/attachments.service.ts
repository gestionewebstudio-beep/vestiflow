import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type { Attachment } from '@prisma/client';

import { SupabaseService } from '../auth/supabase.service';
import {
  MAX_ATTACHMENT_FILE_BYTES,
  MAX_ATTACHMENT_TOTAL_BYTES,
  assertAttachmentQuota,
  assertValidAttachmentFile,
  attachmentExtensionForMime,
  sanitizeAttachmentFileName,
} from '../common/attachments/attachment-rules.util';
import { ensureAttachmentBucket } from '../common/attachments/attachment-storage.util';
import { PrismaService } from '../prisma/prisma.service';

/** Tipi di entità a cui si possono agganciare allegati (estendibile). */
export const ATTACHMENT_ENTITY_TYPES = ['document', 'sales_order'] as const;
export type AttachmentEntityType = (typeof ATTACHMENT_ENTITY_TYPES)[number];

export function isAttachmentEntityType(value: string): value is AttachmentEntityType {
  return (ATTACHMENT_ENTITY_TYPES as readonly string[]).includes(value);
}

/** Spazio allegati di un'entità: usato, totale e residuo (byte). */
export interface AttachmentQuotaInfo {
  readonly usedBytes: number;
  readonly totalBytes: number;
  readonly remainingBytes: number;
}

/** File scaricato: byte + metadati per gli header HTTP. */
export interface AttachmentDownload {
  readonly buffer: Buffer;
  readonly fileName: string;
  readonly mimeType: string;
}

/**
 * Sottosistema Allegati generico (riusabile): metadati su `attachments`
 * (polimorfico via entityType + entityId), byte su Supabase Storage.
 * Sostituisce lo specifico DocumentAttachmentsService e serve documenti
 * (Arrivi merce) e ordini cliente allo stesso modo.
 */
@Injectable()
export class AttachmentsService {
  private readonly bucket: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly supabase: SupabaseService,
    private readonly config: ConfigService,
  ) {
    this.bucket =
      this.config.get<string>('SUPABASE_DOCUMENT_ATTACHMENTS_BUCKET') ?? 'document-attachments';
  }

  async list(
    tenantId: string,
    entityType: AttachmentEntityType,
    entityId: string,
  ): Promise<Attachment[]> {
    await this.assertEntity(tenantId, entityType, entityId);
    return this.prisma.attachment.findMany({
      where: { tenantId, entityType, entityId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Spazio occupato dagli allegati dell'entità (indicatore nella modale). */
  async quota(
    tenantId: string,
    entityType: AttachmentEntityType,
    entityId: string,
  ): Promise<AttachmentQuotaInfo> {
    await this.assertEntity(tenantId, entityType, entityId);
    const usedBytes = await this.usedBytes(tenantId, entityType, entityId);
    return {
      usedBytes,
      totalBytes: MAX_ATTACHMENT_TOTAL_BYTES,
      remainingBytes: Math.max(0, MAX_ATTACHMENT_TOTAL_BYTES - usedBytes),
    };
  }

  async upload(
    tenantId: string,
    entityType: AttachmentEntityType,
    entityId: string,
    file: Express.Multer.File,
    createdByName: string,
  ): Promise<Attachment> {
    await this.assertEntity(tenantId, entityType, entityId);
    const mimeType = assertValidAttachmentFile(file);
    assertAttachmentQuota(await this.usedBytes(tenantId, entityType, entityId), file.size);

    const client = this.requireStorageClient();
    await ensureAttachmentBucket(client, this.bucket, MAX_ATTACHMENT_FILE_BYTES);

    const ext = attachmentExtensionForMime(mimeType);
    const storagePath = `${tenantId}/${entityType}/${entityId}/${randomUUID()}.${ext}`;

    const { error: uploadError } = await client.storage
      .from(this.bucket)
      .upload(storagePath, file.buffer, { contentType: mimeType, upsert: false });

    if (uploadError) {
      throw new InternalServerErrorException(
        `Caricamento allegato non riuscito: ${uploadError.message.slice(0, 200)}`,
      );
    }

    return this.prisma.attachment.create({
      data: {
        tenantId,
        entityType,
        entityId,
        fileName: sanitizeAttachmentFileName(file.originalname ?? '', ext),
        mimeType,
        storagePath,
        sizeBytes: file.size,
        createdByName,
      },
    });
  }

  /** Rinomina l'allegato: cambia solo il metadato, i byte restano dove sono. */
  async rename(
    tenantId: string,
    entityType: AttachmentEntityType,
    entityId: string,
    attachmentId: string,
    fileName: string,
  ): Promise<Attachment> {
    const attachment = await this.findAttachment(tenantId, entityType, entityId, attachmentId);
    const ext = attachmentExtensionForMime(attachment.mimeType);
    const nextName = sanitizeAttachmentFileName(fileName, ext);
    if (!nextName.trim()) {
      throw new BadRequestException('Il nome del file non può essere vuoto.');
    }
    return this.prisma.attachment.update({
      where: { id: attachmentId },
      data: { fileName: nextName },
    });
  }

  /** Byte dell'allegato: il download passa sempre dall'API (bucket privato). */
  async download(
    tenantId: string,
    entityType: AttachmentEntityType,
    entityId: string,
    attachmentId: string,
  ): Promise<AttachmentDownload> {
    const attachment = await this.findAttachment(tenantId, entityType, entityId, attachmentId);
    const client = this.requireStorageClient();

    const { data, error } = await client.storage.from(this.bucket).download(attachment.storagePath);
    if (error || !data) {
      throw new NotFoundException('File allegato non disponibile nello storage.');
    }

    return {
      buffer: Buffer.from(await data.arrayBuffer()),
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
    };
  }

  async delete(
    tenantId: string,
    entityType: AttachmentEntityType,
    entityId: string,
    attachmentId: string,
  ): Promise<void> {
    const attachment = await this.findAttachment(tenantId, entityType, entityId, attachmentId);

    const client = this.supabase.getStorageClient();
    if (client && attachment.storagePath) {
      await client.storage.from(this.bucket).remove([attachment.storagePath]);
    }

    await this.prisma.attachment.delete({ where: { id: attachmentId } });
  }

  private async usedBytes(
    tenantId: string,
    entityType: AttachmentEntityType,
    entityId: string,
  ): Promise<number> {
    const aggregate = await this.prisma.attachment.aggregate({
      where: { tenantId, entityType, entityId },
      _sum: { sizeBytes: true },
    });
    return aggregate._sum.sizeBytes ?? 0;
  }

  private async findAttachment(
    tenantId: string,
    entityType: AttachmentEntityType,
    entityId: string,
    attachmentId: string,
  ): Promise<Attachment> {
    await this.assertEntity(tenantId, entityType, entityId);
    const attachment = await this.prisma.attachment.findFirst({
      where: { id: attachmentId, entityType, entityId, tenantId },
    });
    if (!attachment) {
      throw new NotFoundException('Allegato non trovato');
    }
    return attachment;
  }

  private requireStorageClient() {
    const client = this.supabase.getStorageClient();
    if (!client) {
      throw new ServiceUnavailableException(
        'Storage allegati non configurato: imposta SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.',
      );
    }
    return client;
  }

  /** Verifica che l'entità collegata esista nel tenant (integrità applicativa). */
  private async assertEntity(
    tenantId: string,
    entityType: AttachmentEntityType,
    entityId: string,
  ): Promise<void> {
    if (entityType === 'document') {
      const found = await this.prisma.document.findFirst({
        where: { id: entityId, tenantId },
        select: { id: true },
      });
      if (!found) {
        throw new NotFoundException('Documento non trovato');
      }
      return;
    }
    if (entityType === 'sales_order') {
      const found = await this.prisma.salesOrder.findFirst({
        where: { id: entityId, tenantId },
        select: { id: true },
      });
      if (!found) {
        throw new NotFoundException('Ordine non trovato');
      }
      return;
    }
    throw new BadRequestException('Tipo di entità non supportato per gli allegati');
  }
}
