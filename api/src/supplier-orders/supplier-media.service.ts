import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type { SupplierAttachment } from '@prisma/client';

import { SupabaseService } from '../auth/supabase.service';
import { PrismaService } from '../prisma/prisma.service';

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME = new Set(['application/pdf', 'application/xml', 'text/xml']);

@Injectable()
export class SupplierMediaService {
  private readonly bucket: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly supabase: SupabaseService,
    private readonly config: ConfigService,
  ) {
    this.bucket =
      this.config.get<string>('SUPABASE_SUPPLIER_ATTACHMENTS_BUCKET') ?? 'supplier-attachments';
  }

  async listAttachments(tenantId: string, supplierId: string): Promise<SupplierAttachment[]> {
    await this.assertSupplier(tenantId, supplierId);
    return this.prisma.supplierAttachment.findMany({
      where: { tenantId, supplierId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async uploadAttachment(
    tenantId: string,
    supplierId: string,
    file: Express.Multer.File,
    createdByName: string,
  ): Promise<SupplierAttachment> {
    await this.assertSupplier(tenantId, supplierId);
    this.assertValidFile(file);

    const client = this.supabase.getStorageClient();
    if (!client) {
      throw new ServiceUnavailableException(
        'Storage allegati non configurato (Supabase). Crea il bucket supplier-attachments nel progetto Supabase.',
      );
    }

    const ext = this.extensionForMime(file.mimetype);
    const storagePath = `${tenantId}/${supplierId}/${randomUUID()}.${ext}`;

    const { error: uploadError } = await client.storage
      .from(this.bucket)
      .upload(storagePath, file.buffer, {
        contentType: file.mimetype,
        upsert: false,
      });

    if (uploadError) {
      throw new InternalServerErrorException(
        `Caricamento allegato non riuscito: ${uploadError.message.slice(0, 200)}`,
      );
    }

    return this.prisma.supplierAttachment.create({
      data: {
        tenantId,
        supplierId,
        fileName: file.originalname?.slice(0, 255) || `allegato.${ext}`,
        mimeType: file.mimetype,
        storagePath,
        sizeBytes: file.size,
        createdByName,
      },
    });
  }

  async deleteAttachment(
    tenantId: string,
    supplierId: string,
    attachmentId: string,
  ): Promise<void> {
    await this.assertSupplier(tenantId, supplierId);

    const attachment = await this.prisma.supplierAttachment.findFirst({
      where: { id: attachmentId, supplierId, tenantId },
    });
    if (!attachment) {
      throw new NotFoundException('Allegato non trovato');
    }

    const client = this.supabase.getStorageClient();
    if (client && attachment.storagePath) {
      await client.storage.from(this.bucket).remove([attachment.storagePath]);
    }

    await this.prisma.supplierAttachment.delete({ where: { id: attachmentId } });
  }

  private async assertSupplier(tenantId: string, supplierId: string): Promise<void> {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: supplierId, tenantId },
      select: { id: true },
    });
    if (!supplier) {
      throw new NotFoundException('Fornitore non trovato');
    }
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
