import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { AdminTenantsController } from './admin-tenants.controller';
import { AdminTenantsService } from './admin-tenants.service';

@Module({
  imports: [AuthModule],
  controllers: [AdminTenantsController],
  providers: [AdminTenantsService],
})
export class AdminModule {}
