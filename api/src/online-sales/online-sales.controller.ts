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
import { TenantPermission } from '../auth/tenant-permission.constants';
import { RequirePermissions } from '../common/auth/tenant-permissions.decorator';
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
  @RequirePermissions(TenantPermission.ReportsView)
  list(
    @CurrentTenant() tenantId: string,
    @Query() query: ListOnlineSalesQueryDto,
  ): Promise<Paginated<OnlineSaleRow>> {
    return this.onlineSales.list(tenantId, query);
  }

  @Get('register/entries')
  @RequirePermissions(TenantPermission.ReportsView)
  listRegisterEntries(
    @CurrentTenant() tenantId: string,
    @Query() query: ListCorrispettivoEntriesQueryDto,
  ): Promise<Paginated<CorrispettivoEntryRow>> {
    return this.register.list(tenantId, query);
  }

  @Get('register/summary')
  @RequirePermissions(TenantPermission.ReportsView)
  getRegisterSummary(
    @CurrentTenant() tenantId: string,
    @Query() query: ListCorrispettivoEntriesQueryDto,
  ): Promise<CorrispettivoRegisterSummary> {
    return this.register.getSummary(tenantId, query);
  }

  @Get('register/entries/:id')
  @RequirePermissions(TenantPermission.ReportsView)
  getRegisterEntryDetail(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CorrispettivoEntryDetail> {
    return this.register.getDetail(tenantId, id);
  }

  @Patch('register/entries/:id')
  @RequirePermissions(TenantPermission.ReportsExport)
  updateRegisterEntry(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCorrispettivoEntryDto,
  ): Promise<CorrispettivoEntryRow> {
    return this.register.update(tenantId, id, dto);
  }

  @Get('by-order/:salesOrderId')
  @RequirePermissions(TenantPermission.ReportsView)
  findByOrder(
    @CurrentTenant() tenantId: string,
    @Param('salesOrderId', ParseUUIDPipe) salesOrderId: string,
  ): Promise<OnlineSaleDetail | null> {
    return this.onlineSales.findByOrder(tenantId, salesOrderId);
  }

  @Get(':id')
  @RequirePermissions(TenantPermission.ReportsView)
  getDetail(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OnlineSaleDetail> {
    return this.onlineSales.getDetail(tenantId, id);
  }
}
