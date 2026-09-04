import { Module } from '@nestjs/common';

import { CashSessionsController } from './cash-sessions.controller';
import { CashSessionsService } from './cash-sessions.service';

/**
 * Sessione di cassa (tranche C3): apertura, lettura, cassetto, dispositivo.
 *
 * ⛔ Nessuna dipendenza da `StoreSalesModule` e nessuna verso di lui: Cassa e
 * Vendita al banco sono due flussi distinti (`docs/25` §1), e legarli qui
 * rifarebbe il nodo che C0 ha sciolto.
 *
 * ⚠️ Il modulo esiste ma la funzione e' INCOMPLETA fino a C4B: manca la
 * chiusura, e C3/C4/C4B non si rilasciano separatamente.
 */
@Module({
  controllers: [CashSessionsController],
  providers: [CashSessionsService],
  exports: [CashSessionsService],
})
export class CashSessionsModule {}
