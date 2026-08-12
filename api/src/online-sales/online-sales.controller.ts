import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ONLINE_SALES_VIEW_GROUPS, TenantPermission } from '../auth/tenant-permission.constants';
import { RequireAllPermissionGroups } from '../common/auth/tenant-permissions.decorator';
import { TenantPermissionsGuard } from '../common/auth/tenant-permissions.guard';
import { CurrentTenant } from '../common/tenant/tenant.decorator';
import type { Paginated } from '../common/dto/pagination.dto';
import {
  CorrispettivoRegisterService,
  type CorrispettivoEntryDetail,
  type CorrispettivoEntryRow,
  type CorrispettivoRegisterSummary,
} from './corrispettivo-register.service';
import { ListCorrispettivoEntriesQueryDto } from './dto/list-corrispettivo-entries.query.dto';
import { ListOnlineSalesQueryDto } from './dto/list-online-sales.query.dto';
import { UpdateCorrispettivoEntryDto } from './dto/update-corrispettivo-entry.dto';
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
    private readonly register: CorrispettivoRegisterService,
  ) {}

  @Get()
  @RequireAllPermissionGroups(ONLINE_SALES_VIEW_GROUPS)
  list(
    @CurrentTenant() tenantId: string,
    @Query() query: ListOnlineSalesQueryDto,
  ): Promise<Paginated<OnlineSaleRow>> {
    return this.onlineSales.list(tenantId, query);
  }

  @Get('register/entries')
  @RequireAllPermissionGroups(ONLINE_SALES_VIEW_GROUPS)
  listRegisterEntries(
    @CurrentTenant() tenantId: string,
    @Query() query: ListCorrispettivoEntriesQueryDto,
  ): Promise<Paginated<CorrispettivoEntryRow>> {
    return this.register.list(tenantId, query);
  }

  @Get('register/summary')
  @RequireAllPermissionGroups(ONLINE_SALES_VIEW_GROUPS)
  getRegisterSummary(
    @CurrentTenant() tenantId: string,
    @Query() query: ListCorrispettivoEntriesQueryDto,
  ): Promise<CorrispettivoRegisterSummary> {
    return this.register.getSummary(tenantId, query);
  }

  @Get('register/entries/:id')
  @RequireAllPermissionGroups(ONLINE_SALES_VIEW_GROUPS)
  getRegisterEntryDetail(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CorrispettivoEntryDetail> {
    return this.register.getDetail(tenantId, id);
  }

  @Patch('register/entries/:id')
  @RequireAllPermissionGroups([
    ...ONLINE_SALES_VIEW_GROUPS,
    [TenantPermission.ReportsFiscalRegister],
  ])
  updateRegisterEntry(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCorrispettivoEntryDto,
  ): Promise<CorrispettivoEntryRow> {
    return this.register.update(tenantId, id, dto);
  }

  @Get('by-order/:salesOrderId')
  @RequireAllPermissionGroups(ONLINE_SALES_VIEW_GROUPS)
  findByOrder(
    @CurrentTenant() tenantId: string,
    @Param('salesOrderId', ParseUUIDPipe) salesOrderId: string,
  ): Promise<OnlineSaleDetail | null> {
    return this.onlineSales.findByOrder(tenantId, salesOrderId);
  }

  @Get(':id')
  @RequireAllPermissionGroups(ONLINE_SALES_VIEW_GROUPS)
  getDetail(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OnlineSaleDetail> {
    return this.onlineSales.getDetail(tenantId, id);
  }
}
