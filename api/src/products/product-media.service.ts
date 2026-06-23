import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type { ProductImage } from '@prisma/client';

import { SupabaseService } from '../auth/supabase.service';
import { PrismaService } from '../prisma/prisma.service';
import { ChannelSyncFacade } from '../channels/channel-sync.facade';
import { assertShopifyCatalogMediaMutationAllowed } from './catalog-origin.util';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

@Injectable()
export class ProductMediaService {
  private readonly bucket: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly supabase: SupabaseService,
    private readonly config: ConfigService,
    private readonly channelSync: ChannelSyncFacade,
  ) {
    this.bucket = this.config.get<string>('SUPABASE_PRODUCT_MEDIA_BUCKET') ?? 'product-media';
  }

  async uploadImage(
    tenantId: string,
    productId: string,
    file: Express.Multer.File,
  ): Promise<ProductImage> {
    await this.assertProduct(tenantId, productId);
    this.assertValidFile(file);

    const client = this.supabase.getStorageClient();
    if (!client) {
      throw new ServiceUnavailableException(
        'Storage immagini non configurato (Supabase). Crea il bucket product-media nel progetto Supabase.',
      );
    }

    const ext = this.extensionForMime(file.mimetype);
    const storagePath = `${tenantId}/${productId}/${randomUUID()}.${ext}`;

    const { error: uploadError } = await client.storage
      .from(this.bucket)
      .upload(storagePath, file.buffer, {
        contentType: file.mimetype,
        upsert: false,
      });

    if (uploadError) {
      throw new InternalServerErrorException(
        `Caricamento immagine non riuscito: ${uploadError.message.slice(0, 200)}`,
      );
    }

    const publicUrl = this.publicObjectUrl(storagePath);
    const sortOrder = await this.nextSortOrder(productId);

    const image = await this.prisma.productImage.create({
      data: {
        tenantId,
        productId,
        url: publicUrl,
        storagePath,
        sortOrder,
      },
    });

    this.channelSync.enqueueProductPush(tenantId, productId);
    return image;
  }

  async deleteImage(tenantId: string, productId: string, imageId: string): Promise<void> {
    await this.assertProduct(tenantId, productId);

    const image = await this.prisma.productImage.findFirst({
      where: { id: imageId, productId, tenantId },
    });
    if (!image) {
      throw new NotFoundException('Immagine non trovata');
    }

    if (image.storagePath) {
      const client = this.supabase.getStorageClient();
      if (client) {
        await client.storage.from(this.bucket).remove([image.storagePath]);
      }
    }

    await this.prisma.productImage.delete({ where: { id: imageId } });
    this.channelSync.enqueueProductPush(tenantId, productId);
  }

  private async assertProduct(tenantId: string, productId: string): Promise<void> {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, tenantId },
      select: { id: true, catalogOrigin: true },
    });
    if (!product) {
      throw new NotFoundException('Prodotto non trovato');
    }
    assertShopifyCatalogMediaMutationAllowed(product.catalogOrigin);
  }

  private assertValidFile(file: Express.Multer.File): void {
    if (!file?.buffer?.length) {
      throw new BadRequestException('File immagine mancante');
    }
    if (file.size > MAX_IMAGE_BYTES) {
      throw new BadRequestException('Immagine troppo grande (max 5 MB)');
    }
    if (!ALLOWED_MIME.has(file.mimetype)) {
      throw new BadRequestException('Formato non supportato. Usa JPEG, PNG o WebP.');
    }
    if (!this.matchesMagicBytes(file.buffer, file.mimetype)) {
      throw new BadRequestException("Il file non è un'immagine valida");
    }
  }

  private matchesMagicBytes(buffer: Buffer, mime: string): boolean {
    if (mime === 'image/jpeg') {
      return buffer[0] === 0xff && buffer[1] === 0xd8;
    }
    if (mime === 'image/png') {
      return buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
    }
    if (mime === 'image/webp') {
      return (
        buffer.slice(0, 4).toString('ascii') === 'RIFF' &&
        buffer.slice(8, 12).toString('ascii') === 'WEBP'
      );
    }
    return false;
  }

  private extensionForMime(mime: string): string {
    switch (mime) {
      case 'image/jpeg':
        return 'jpg';
      case 'image/png':
        return 'png';
      case 'image/webp':
        return 'webp';
      default:
        return 'bin';
    }
  }

  private publicObjectUrl(storagePath: string): string {
    const base = this.config.get<string>('SUPABASE_URL')?.replace(/\/$/, '');
    if (!base) {
      throw new ServiceUnavailableException('SUPABASE_URL non configurato');
    }
    return `${base}/storage/v1/object/public/${this.bucket}/${storagePath}`;
  }

  private async nextSortOrder(productId: string): Promise<number> {
    const last = await this.prisma.productImage.findFirst({
      where: { productId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    return (last?.sortOrder ?? -1) + 1;
  }
}
