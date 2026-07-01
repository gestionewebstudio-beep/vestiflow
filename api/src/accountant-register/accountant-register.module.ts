import { Module } from '@nestjs/common';

import { CorrispettiviModule } from '../corrispettivi/corrispettivi.module';
import { AccountantRegisterController } from './accountant-register.controller';
import { AccountantRegisterService } from './accountant-register.service';

@Module({
  imports: [CorrispettiviModule],
  controllers: [AccountantRegisterController],
  providers: [AccountantRegisterService],
})
export class AccountantRegisterModule {}
