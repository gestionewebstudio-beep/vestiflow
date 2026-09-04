import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { SalesOrderSource, type Attachment } from '@prisma/client';

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
import type { UserProfileDto } from '../auth/dto/user-profile.dto';
import {
  assertLocationInUserScope,
  assertLocationReadableInUserScope,
} from '../inventory/user-location-scope.util';
import { PrismaService } from '../prisma/prisma.service';

/** Tipi di entità a cui si possono agganciare allegati (estendibile). */
export const ATTACHMENT_ENTITY_TYPES = ['document', 'sales_order', 'supplier_order'] as const;
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
 * Chi sta chiedendo. ⛔ NON è opzionale per comodità: è il contesto senza il
 * quale `assertEntity` non può decidere niente. Un chiamante che non ce l'ha
 * deve passare `undefined` **esplicitamente**, e sa che sta saltando il
 * controllo di sede (lavori di sistema, non richieste utente).
 */
export type AttachmentRequester = UserProfileDto | undefined;

/** Leggere e scrivere non hanno lo stesso ambito: `view_all_locations` legge ovunque, non scrive ovunque. */
export type AttachmentAccessMode = 'read' | 'write';

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
    user: AttachmentRequester,
  ): Promise<Attachment[]> {
    await this.assertEntity(tenantId, entityType, entityId, user, 'read');
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
    user: AttachmentRequester,
  ): Promise<AttachmentQuotaInfo> {
    await this.assertEntity(tenantId, entityType, entityId, user, 'read');
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
    user: AttachmentRequester,
  ): Promise<Attachment> {
    await this.assertEntity(tenantId, entityType, entityId, user, 'write');
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
    user: AttachmentRequester,
  ): Promise<Attachment> {
    const attachment = await this.findAttachment(
      tenantId,
      entityType,
      entityId,
      attachmentId,
      user,
      'write',
    );
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
    user: AttachmentRequester,
  ): Promise<AttachmentDownload> {
    const attachment = await this.findAttachment(
      tenantId,
      entityType,
      entityId,
      attachmentId,
      user,
      'read',
    );
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
    user: AttachmentRequester,
  ): Promise<void> {
    const attachment = await this.findAttachment(
      tenantId,
      entityType,
      entityId,
      attachmentId,
      user,
      'write',
    );

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
    user: AttachmentRequester,
    mode: AttachmentAccessMode,
  ): Promise<Attachment> {
    await this.assertEntity(tenantId, entityType, entityId, user, mode);
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

  /**
   * L'entità esiste nel tenant **e** l'utente può operare sulla sua sede.
   *
   * ⭐ È il punto comune di TUTTE le rotte allegati: le sei pubbliche ci
   * passano attraverso, tre direttamente e tre via `findAttachment`. Il
   * controllo di sede vive qui perché qui — e solo qui — si hanno insieme
   * `tenantId`, la sede del record e chi sta chiedendo.
   *
   * ⛔ **Conoscere un id non concede alcun diritto.** Filtrare un elenco è
   * ergonomia; autorizzare è rifiutare la richiesta diretta per id (`12` §0.8).
   * Prima del 28/08/2026 qui si verificava **solo il tenant**, e un commesso
   * poteva leggere, scaricare, rinominare ed eliminare gli allegati di un
   * ordine di una sede non sua conoscendone l’id.
   */
  private async assertEntity(
    tenantId: string,
    entityType: AttachmentEntityType,
    entityId: string,
    user: AttachmentRequester,
    mode: AttachmentAccessMode,
  ): Promise<void> {
    if (entityType === 'document') {
      const found = await this.prisma.document.findFirst({
        where: { id: entityId, tenantId },
        select: { id: true, locationId: true },
      });
      if (!found) {
        throw new NotFoundException('Documento non trovato');
      }
      this.assertLocation(found.locationId, user, mode);
      return;
    }
    if (entityType === 'sales_order') {
      const found = await this.prisma.salesOrder.findFirst({
        where: { id: entityId, tenantId },
        select: { id: true, locationId: true, source: true },
      });
      if (!found) {
        throw new NotFoundException('Ordine non trovato');
      }
      // ⚠️ Solo gli ordini MANUALI sono legati alla sede di chi li ha scritti:
      // è la stessa distinzione di `SalesOrdersService.getById`. Applicare lo
      // scope agli ordini di canale li renderebbe irraggiungibili a chi non ha
      // la sede che il canale ha assegnato loro.
      if (found.source === SalesOrderSource.manual) {
        this.assertLocation(found.locationId, user, mode);
      }
      return;
    }
    // 11/08/2026: l'ordine fornitore era l'unico documento senza allegati, e
    // non per scelta — la conferma d’ordine che il fornitore rimanda è
    // esattamente il file che si tiene attaccato all’ordine. Il meccanismo era
    // già dichiarato «estendibile»: qui si estende.
    if (entityType === 'supplier_order') {
      const found = await this.prisma.supplierOrder.findFirst({
        where: { id: entityId, tenantId },
        select: { id: true, destinationLocationId: true },
      });
      if (!found) {
        throw new NotFoundException('Ordine fornitore non trovato');
      }
      this.assertLocation(found.destinationLocationId, user, mode);
      return;
    }
    throw new BadRequestException('Tipo di entità non supportato per gli allegati');
  }

  /**
   * La politica di sede, in un posto solo.
   *
   * ⚠️ **Leggere e scrivere non hanno lo stesso ambito.** Chi ha
   * `inventory.view_all_locations` legge ovunque ma non scrive ovunque: la
   * variante di scrittura richiede la sede fra quelle assegnate.
   *
   * ⭐ **Record senza sede: passa, ed è esplicito.** Una fattura o un
   * corrispettivo non hanno una sede da confrontare — non è un ripiego, è il
   * contratto dichiarato di `assertLocationReadableInUserScope`.
   */
  private assertLocation(
    locationId: string | null,
    user: AttachmentRequester,
    mode: AttachmentAccessMode,
  ): void {
    if (!user || !locationId) {
      return;
    }
    if (mode === 'write') {
      assertLocationInUserScope(user, locationId);
      return;
    }
    assertLocationReadableInUserScope(
      user,
      locationId,
      'Non sei autorizzato ad accedere agli allegati di questo documento.',
    );
  }
}
