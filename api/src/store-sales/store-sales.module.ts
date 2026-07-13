import { Module } from '@nestjs/common';

import { ChannelsModule } from '../channels/channels.module';
import { DocumentsModule } from '../documents/documents.module';
import { StoreSaleLookupService } from './store-sale-lookup.service';
import { StoreSalesController } from './store-sales.controller';
import { StoreSalesService } from './store-sales.service';

/**
 * Cassa negozio (fase 3): Vendita in negozio e Reso vendita negozio.
 * Documenti + movimenti in transazione; nessun Ordine cliente, nessun impegno.
 */
@Module({
  imports: [ChannelsModule, DocumentsModule],
  controllers: [StoreSalesController],
  providers: [StoreSalesService, StoreSaleLookupService],
})
export class StoreSalesModule {}
