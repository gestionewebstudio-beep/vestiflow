import { Module } from '@nestjs/common';

import { TenantOwnerGuard } from '../common/auth/tenant-owner.guard';
import { TenantUsersController } from './tenant-users.controller';
import { TenantUsersCoreService } from './tenant-users-core.service';
import { TenantUsersService } from './tenant-users.service';

/**
 * Ciclo di vita utenti tenant: il core è condiviso fra area admin piattaforma
 * e Impostazioni → Utenti del titolare (Prisma, Auth e PlatformAdmin sono
 * moduli globali: nessun import esplicito necessario).
 */
@Module({
  controllers: [TenantUsersController],
  providers: [TenantUsersCoreService, TenantUsersService, TenantOwnerGuard],
  exports: [TenantUsersCoreService],
})
export class TenantUsersModule {}
