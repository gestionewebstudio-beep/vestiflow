import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { ChannelSyncFacade } from '../channels/channel-sync.facade';
import { assertUploadImageMimeAndMagicBytes } from '../common/upload/image-optimize.util';
import { ALLOWED_MIME, ImageArchiveService, MAX_IMAGE_BYTES } from '../media/image-archive.service';
import { PrismaService } from '../prisma/prisma.service';

import type { ProductImage } from '@prisma/client';

/**
 * Le immagini di prodotto dal punto di vista del CATALOGO: chi le carica, chi
 * le toglie, e il canale da avvisare.
 *
 * ⭐ **Scaricare, ottimizzare e conservare NON stanno più qui**: sono
 *    dell'archivio (`media/image-archive.service.ts`), che usa anche la
 *    sincronizzazione Shopify. Qui resta ciò che è del catalogo — la validazione
 *    del file caricato, i permessi sul prodotto, e l'avviso al canale.
 *
 * ⚠️ **L'avviso al canale è la differenza fra i due mondi.** Qui a muovere
 *    un'immagine è l'operatore, quindi Shopify va aggiornato; nella
 *    sincronizzazione l'immagine ARRIVA da Shopify, e rimandargliela sarebbe
 *    un'eco.
 */
@Injectable()
export class ProductMediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly archivio: ImageArchiveService,
    private readonly channelSync: ChannelSyncFacade,
  ) {}

  async uploadImage(
    tenantId: string,
    productId: string,
    file: Express.Multer.File,
  ): Promise<ProductImage> {
    await this.assertProduct(tenantId, productId);
    this.assertValidFile(file);

    const image = await this.archivio.archiviaBuffer(tenantId, productId, file.buffer);

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

    await this.archivio.rimuoviDalBucket(image.storagePath);
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
  }

  private assertValidFile(file: Express.Multer.File): void {
    if (!file?.buffer?.length) {
      throw new BadRequestException('File immagine mancante');
    }
    if (file.size > MAX_IMAGE_BYTES) {
      throw new BadRequestException('Immagine troppo grande (max 5 MB)');
    }
    assertUploadImageMimeAndMagicBytes(file.buffer, file.mimetype, ALLOWED_MIME);
  }
}
