import { Module } from '@nestjs/common';

import { CorrispettivoRegisterService } from './corrispettivo-register.service';
import { OnlineSalesController } from './online-sales.controller';
import { OnlineSalesService } from './online-sales.service';

/**
 * Read-model Vendite online + registro Corrispettivi (fase 2). La creazione
 * delle vendite NON passa da qui: avviene nel dominio quantità
 * (OnlineSaleFulfillmentService) alla ricezione dell'evento canonico.
 */
@Module({
  controllers: [OnlineSalesController],
  providers: [OnlineSalesService, CorrispettivoRegisterService],
  exports: [OnlineSalesService, CorrispettivoRegisterService],
})
export class OnlineSalesModule {}
