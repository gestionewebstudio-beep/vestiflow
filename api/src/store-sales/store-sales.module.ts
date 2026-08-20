import { Module } from '@nestjs/common';

import { ChannelsModule } from '../channels/channels.module';
import { DocumentsModule } from '../documents/documents.module';
import { VatModule } from '../vat/vat.module';
import { StoreSaleLookupService } from './store-sale-lookup.service';
import { StoreSalesController } from './store-sales.controller';
import { StoreSalesService } from './store-sales.service';

/**
 * Modulo del banco (fase 3): Vendita al banco e Reso al banco.
 * Documenti + movimenti in transazione; nessun Ordine cliente, nessun impegno.
 */
@Module({
  imports: [ChannelsModule, DocumentsModule, VatModule],
  controllers: [StoreSalesController],
  providers: [StoreSalesService, StoreSaleLookupService],
})
export class StoreSalesModule {}
