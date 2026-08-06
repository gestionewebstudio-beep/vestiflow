import { Module } from '@nestjs/common';

import { PaymentOptionsController } from './payment-options.controller';
import { PaymentOptionsService } from './payment-options.service';

@Module({
  controllers: [PaymentOptionsController],
  providers: [PaymentOptionsService],
  exports: [PaymentOptionsService],
})
export class PaymentOptionsModule {}
