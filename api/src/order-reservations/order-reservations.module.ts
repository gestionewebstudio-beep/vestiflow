import { Module } from '@nestjs/common';

import { OnlineOrderLifecycleService } from './online-order-lifecycle.service';
import { OnlineSaleFulfillmentService } from './online-sale-fulfillment.service';
import { StockReservationService } from './stock-reservation.service';

/**
 * Dominio quantità Impegnata + ciclo di vita canonico ordini online
 * (fase 1) + trasformazione evasione → Vendita online/Corrispettivo (fase 2).
 * Nessuna dipendenza dai connettori canale: sono i connettori (Shopify) a
 * importare questo modulo e tradurre i propri webhook in eventi canonici.
 */
@Module({
  providers: [
    StockReservationService,
    OnlineOrderLifecycleService,
    OnlineSaleFulfillmentService,
  ],
  exports: [
    StockReservationService,
    OnlineOrderLifecycleService,
    OnlineSaleFulfillmentService,
  ],
})
export class OrderReservationsModule {}
