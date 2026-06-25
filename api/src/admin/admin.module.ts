import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { LocationLicensingModule } from '../inventory/location-licensing.module';
import { SupportSessionModule } from '../support/support-session.module';
import {
  AdminSupportSessionsController,
  AdminTenantsSupportController,
} from './admin-support-sessions.controller';
import { AdminTenantsController } from './admin-tenants.controller';
import { AdminTenantsService } from './admin-tenants.service';

@Module({
  imports: [AuthModule, SupportSessionModule, LocationLicensingModule],
  controllers: [AdminTenantsController, AdminSupportSessionsController, AdminTenantsSupportController],
  providers: [AdminTenantsService],
})
export class AdminModule {}
