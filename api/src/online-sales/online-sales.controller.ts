import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ONLINE_SALES_VIEW_GROUPS } from '../auth/tenant-permission.constants';
import { RequireAllPermissionGroups } from '../common/auth/tenant-permissions.decorator';
import { TenantPermissionsGuard } from '../common/auth/tenant-permissions.guard';
import { CurrentTenant } from '../common/tenant/tenant.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { UserProfileDto } from '../auth/dto/user-profile.dto';
import type { Paginated } from '../common/dto/pagination.dto';
import { ListOnlineSalesQueryDto } from './dto/list-online-sales.query.dto';
import {
  OnlineSalesService,
  type OnlineSaleDetail,
  type OnlineSaleRow,
} from './online-sales.service';

/**
 * Vendite online (documenti interni generati dall'evasione, fase 2) e
 * registro Corrispettivi collegato. Sola lettura sulle vendite (sono
 * snapshot di sistema); il registro consente aggiornamenti di stato e
 * data fiscale agli utenti autorizzati.
 */
@Controller('online-sales')
@UseGuards(JwtAuthGuard, TenantPermissionsGuard)
export class OnlineSalesController {
  constructor(
    private readonly onlineSales: OnlineSalesService,
  ) {}

  @Get()
  @RequireAllPermissionGroups(ONLINE_SALES_VIEW_GROUPS)
  list(
    @CurrentTenant() tenantId: string,
    @Query() query: ListOnlineSalesQueryDto,
  ): Promise<Paginated<OnlineSaleRow>> {
    return this.onlineSales.list(tenantId, query);
  }

  // ⚠️ Qui vivevano i quattro endpoint del registro Corrispettivi LEGACY —
  // `register/entries`, `register/summary`, il dettaglio e la modifica di una
  // voce. Ritirati il 17/08/2026 con la tabella che li alimentava.
  //
  // Il Registro Corrispettivi ATTUALE è un'altra cosa e resta: è una vista
  // DERIVATA che aggrega vendite e documenti per periodo, non un registro di
  // record autonomi con un numero COR-… ciascuno.

  @Get('by-order/:salesOrderId')
  @RequireAllPermissionGroups(ONLINE_SALES_VIEW_GROUPS)
  findByOrder(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Param('salesOrderId', ParseUUIDPipe) salesOrderId: string,
  ): Promise<OnlineSaleDetail | null> {
    return this.onlineSales.findByOrder(tenantId, salesOrderId, user);
  }

  @Get(':id')
  @RequireAllPermissionGroups(ONLINE_SALES_VIEW_GROUPS)
  getDetail(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OnlineSaleDetail> {
    return this.onlineSales.getDetail(tenantId, id, user);
  }
}
