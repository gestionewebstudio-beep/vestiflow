import { Global, Module } from '@nestjs/common';

import { SupportSessionService } from './support-session.service';

@Global()
@Module({
  providers: [SupportSessionService],
  exports: [SupportSessionService],
})
export class SupportSessionModule {}
