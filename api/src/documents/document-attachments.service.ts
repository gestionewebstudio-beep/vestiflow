import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type { DocumentAttachment } from '@prisma/client';

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

/** Spazio allegati del documento: usato, totale e residuo (byte). */
export interface DocumentAttachmentQuota {
  readonly usedBytes: number;
  readonly totalBytes: number;
  readonly remainingBytes: number;
}

/** File scaricato: byte + metadati per gli header HTTP. */
export interface DocumentAttachmentDownload {
  readonly buffer: Buffer;
  readonly fileName: string;
  readonly mimeType: string;
}

@Injectable()
export class DocumentAttachmentsService {
  private readonly bucket: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly supabase: SupabaseService,
    private readonly config: ConfigService,
  ) {
    this.bucket =
      this.config.get<string>('SUPABASE_DOCUMENT_ATTACHMENTS_BUCKET') ?? 'document-attachments';
  }

  async listAttachments(tenantId: string, documentId: string): Promise<DocumentAttachment[]> {
    await this.assertDocument(tenantId, documentId);
    return this.prisma.documentAttachment.findMany({
      where: { tenantId, documentId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Spazio occupato dagli allegati del documento (indicatore nella modale). */
  async quota(tenantId: string, documentId: string): Promise<DocumentAttachmentQuota> {
    await this.assertDocument(tenantId, documentId);
    const usedBytes = await this.usedBytes(tenantId, documentId);
    return {
      usedBytes,
      totalBytes: MAX_ATTACHMENT_TOTAL_BYTES,
      remainingBytes: Math.max(0, MAX_ATTACHMENT_TOTAL_BYTES - usedBytes),
    };
  }

  async uploadAttachment(
    tenantId: string,
    documentId: string,
    file: Express.Multer.File,
    createdByName: string,
  ): Promise<DocumentAttachment> {
    await this.assertDocument(tenantId, documentId);
    const mimeType = assertValidAttachmentFile(file);
    assertAttachmentQuota(await this.usedBytes(tenantId, documentId), file.size);

    const client = this.requireStorageClient();
    await ensureAttachmentBucket(client, this.bucket, MAX_ATTACHMENT_FILE_BYTES);

    const ext = attachmentExtensionForMime(mimeType);
    const storagePath = `${tenantId}/${documentId}/${randomUUID()}.${ext}`;

    const { error: uploadError } = await client.storage
      .from(this.bucket)
      .upload(storagePath, file.buffer, {
        contentType: mimeType,
        upsert: false,
      });

    if (uploadError) {
      throw new InternalServerErrorException(
        `Caricamento allegato non riuscito: ${uploadError.message.slice(0, 200)}`,
      );
    }

    return this.prisma.documentAttachment.create({
      data: {
        tenantId,
        documentId,
        fileName: sanitizeAttachmentFileName(file.originalname ?? '', ext),
        mimeType,
        storagePath,
        sizeBytes: file.size,
        createdByName,
      },
    });
  }

  /** Rinomina l'allegato: cambia solo il metadato, i byte restano dove sono. */
  async renameAttachment(
    tenantId: string,
    documentId: string,
    attachmentId: string,
    fileName: string,
  ): Promise<DocumentAttachment> {
    const attachment = await this.findAttachment(tenantId, documentId, attachmentId);
    const nextName = sanitizeAttachmentFileName(
      fileName,
      attachmentExtensionForMime(attachment.mimeType),
    );
    if (!nextName.trim()) {
      throw new BadRequestException('Il nome del file non può essere vuoto.');
    }
    return this.prisma.documentAttachment.update({
      where: { id: attachmentId },
      data: { fileName: nextName },
    });
  }

  /** Byte dell'allegato: il download passa sempre dall'API (bucket privato). */
  async downloadAttachment(
    tenantId: string,
    documentId: string,
    attachmentId: string,
  ): Promise<DocumentAttachmentDownload> {
    const attachment = await this.findAttachment(tenantId, documentId, attachmentId);
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

  async deleteAttachment(
    tenantId: string,
    documentId: string,
    attachmentId: string,
  ): Promise<void> {
    const attachment = await this.findAttachment(tenantId, documentId, attachmentId);

    const client = this.supabase.getStorageClient();
    if (client && attachment.storagePath) {
      await client.storage.from(this.bucket).remove([attachment.storagePath]);
    }

    await this.prisma.documentAttachment.delete({ where: { id: attachmentId } });
  }

  private async usedBytes(tenantId: string, documentId: string): Promise<number> {
    const aggregate = await this.prisma.documentAttachment.aggregate({
      where: { tenantId, documentId },
      _sum: { sizeBytes: true },
    });
    return aggregate._sum.sizeBytes ?? 0;
  }

  private async findAttachment(
    tenantId: string,
    documentId: string,
    attachmentId: string,
  ): Promise<DocumentAttachment> {
    await this.assertDocument(tenantId, documentId);
    const attachment = await this.prisma.documentAttachment.findFirst({
      where: { id: attachmentId, documentId, tenantId },
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

  private async assertDocument(tenantId: string, documentId: string): Promise<void> {
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, tenantId },
      select: { id: true },
    });
    if (!document) {
      throw new NotFoundException('Documento non trovato');
    }
  }
}
