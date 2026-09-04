import { Module } from '@nestjs/common';

import { ChannelsModule } from '../channels/channels.module';
import { CreationIntentService } from '../common/idempotency/creation-intent.util';
import { DocumentsModule } from '../documents/documents.module';

import { CashCheckoutService } from './cash-checkout.service';
import { CashClosingService } from './cash-closing.service';
import { CashReturnService } from './cash-return.service';
import { CashSessionsController } from './cash-sessions.controller';
import { CashSessionsService } from './cash-sessions.service';

/**
 * Sessione di cassa (tranche C3): apertura, lettura, cassetto, dispositivo.
 *
 * ⛔ Nessuna dipendenza da `StoreSalesModule` e nessuna verso di lui: Cassa e
 * Vendita al banco sono due flussi distinti (`docs/25` §1), e legarli qui
 * rifarebbe il nodo che C0 ha sciolto.
 *
 * ⭐ Da C4B il ciclo e' completo: apertura, cassetto, dispositivo, checkout,
 * reso e chiusura con quadratura congelata.
 */
@Module({
  imports: [ChannelsModule, DocumentsModule],
  controllers: [CashSessionsController],
  providers: [
    CashSessionsService,
    CashCheckoutService,
    CashReturnService,
    CashClosingService,
    CreationIntentService,
  ],
  exports: [CashSessionsService, CashCheckoutService, CashReturnService, CashClosingService],
})
export class CashSessionsModule {}
