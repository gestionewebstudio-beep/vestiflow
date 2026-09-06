import { Module } from '@nestjs/common';

import { OnlineSalesController } from './online-sales.controller';
import { OnlineSalesService } from './online-sales.service';

/**
 * Read-model Vendite online (fase 2). La creazione delle vendite NON passa da
 * qui: avviene nel dominio quantità (OnlineSaleFulfillmentService) alla
 * ricezione dell'evento canonico.
 *
 * ⚠️ Il registro Corrispettivi legacy stava qui accanto — `CorrispettivoRegisterService`,
 * ritirato il 17/08/2026 col resto della verticale. Il Registro attuale è una vista
 * DERIVATA e vive in `api/src/corrispettivi/`.
 */
@Module({
  controllers: [OnlineSalesController],
  providers: [OnlineSalesService],
  exports: [OnlineSalesService],
})
export class OnlineSalesModule {}
