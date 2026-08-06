import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ChannelsModule } from '../channels/channels.module';
import { LocationLicensingModule } from '../inventory/location-licensing.module';
import { SupportSessionModule } from '../support/support-session.module';
import {
  AdminSupportSessionsController,
  AdminTenantsSupportController,
} from './admin-support-sessions.controller';
import { AdminTenantsController } from './admin-tenants.controller';
import { AdminTenantsService } from './admin-tenants.service';
import { AdminTenantUsersService } from './admin-tenant-users.service';

@Module({
  imports: [AuthModule, ChannelsModule, SupportSessionModule, LocationLicensingModule],
  controllers: [AdminTenantsController, AdminSupportSessionsController, AdminTenantsSupportController],
  providers: [AdminTenantsService, AdminTenantUsersService],
})
export class AdminModule {}
