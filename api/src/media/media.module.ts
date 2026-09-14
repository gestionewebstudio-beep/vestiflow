import { Module } from '@nestjs/common';

import { ImageArchiveService } from './image-archive.service';

/**
 * L'archivio delle immagini di prodotto, in un modulo SUO.
 *
 * ⛔ **Dipende solo da Prisma, Supabase e la configurazione**, e questo è il
 *    punto: lo importano sia `ProductsModule` sia `ShopifyModule`. Se vivesse
 *    dentro il primo, il secondo avrebbe dovuto importarlo — e
 *    `ProductsModule → ShopifyModule` esiste già, quindi sarebbe stato un
 *    ciclo. Il progetto non usa `forwardRef` in nessun punto.
 *
 * ⚠️ **Non deve mai dipendere dai canali.** Il giorno in cui l'archivio potesse
 *    accodare un push, il ciclo tornerebbe da `ChannelsModule → ShopifyModule`,
 *    e con lui l'eco che teniamo fuori: chi archivia non decide se rimandare
 *    qualcosa a Shopify.
 */
@Module({
  providers: [ImageArchiveService],
  exports: [ImageArchiveService],
})
export class MediaModule {}
