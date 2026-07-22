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
import { PrismaService } from '../prisma/prisma.service';

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME = new Set(['application/pdf', 'application/xml', 'text/xml']);

/** Tipi di entità a cui si possono agganciare allegati (estendibile). */
export const ATTACHMENT_ENTITY_TYPES = ['document', 'sales_order'] as const;
export type AttachmentEntityType = (typeof ATTACHMENT_ENTITY_TYPES)[number];

export function isAttachmentEntityType(value: string): value is AttachmentEntityType {
  return (ATTACHMENT_ENTITY_TYPES as readonly string[]).includes(value);
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

  async upload(
    tenantId: string,
    entityType: AttachmentEntityType,
    entityId: string,
    file: Express.Multer.File,
    createdByName: string,
  ): Promise<Attachment> {
    await this.assertEntity(tenantId, entityType, entityId);
    this.assertValidFile(file);

    const client = this.supabase.getStorageClient();
    if (!client) {
      throw new ServiceUnavailableException(
        'Storage allegati non configurato (Supabase). Crea il bucket document-attachments nel progetto Supabase.',
      );
    }

    const ext = this.extensionForMime(file.mimetype);
    const storagePath = `${tenantId}/${entityType}/${entityId}/${randomUUID()}.${ext}`;

    const { error: uploadError } = await client.storage
      .from(this.bucket)
      .upload(storagePath, file.buffer, { contentType: file.mimetype, upsert: false });

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
        fileName: file.originalname?.slice(0, 255) || `allegato.${ext}`,
        mimeType: file.mimetype,
        storagePath,
        sizeBytes: file.size,
        createdByName,
      },
    });
  }

  async delete(
    tenantId: string,
    entityType: AttachmentEntityType,
    entityId: string,
    attachmentId: string,
  ): Promise<void> {
    await this.assertEntity(tenantId, entityType, entityId);

    const attachment = await this.prisma.attachment.findFirst({
      where: { id: attachmentId, entityType, entityId, tenantId },
    });
    if (!attachment) {
      throw new NotFoundException('Allegato non trovato');
    }

    const client = this.supabase.getStorageClient();
    if (client && attachment.storagePath) {
      await client.storage.from(this.bucket).remove([attachment.storagePath]);
    }

    await this.prisma.attachment.delete({ where: { id: attachmentId } });
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

  private assertValidFile(file: Express.Multer.File): void {
    if (!file?.buffer?.length) {
      throw new BadRequestException('File allegato mancante');
    }
    if (file.size > MAX_ATTACHMENT_BYTES) {
      throw new BadRequestException('Allegato troppo grande (max 10 MB)');
    }
    if (!ALLOWED_MIME.has(file.mimetype)) {
      throw new BadRequestException('Formato non supportato. Usa PDF o XML.');
    }
    if (!this.matchesMagicBytes(file.buffer, file.mimetype)) {
      throw new BadRequestException('Il file non è un documento valido');
    }
  }

  private matchesMagicBytes(buffer: Buffer, mime: string): boolean {
    if (mime === 'application/pdf') {
      return buffer.slice(0, 5).toString('ascii') === '%PDF-';
    }
    if (mime === 'application/xml' || mime === 'text/xml') {
      const head = buffer.slice(0, 256).toString('utf8').trimStart();
      return head.startsWith('<?xml') || head.startsWith('<');
    }
    return false;
  }

  private extensionForMime(mime: string): string {
    switch (mime) {
      case 'application/pdf':
        return 'pdf';
      case 'application/xml':
      case 'text/xml':
        return 'xml';
      default:
        return 'bin';
    }
  }
}
