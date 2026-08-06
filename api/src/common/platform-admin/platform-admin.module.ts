import { Global, Module } from '@nestjs/common';

import { PlatformAdminGuard } from './platform-admin.guard';
import { PlatformAdminService } from './platform-admin.service';

@Global()
@Module({
  providers: [PlatformAdminService, PlatformAdminGuard],
  exports: [PlatformAdminService, PlatformAdminGuard],
})
export class PlatformAdminModule {}
