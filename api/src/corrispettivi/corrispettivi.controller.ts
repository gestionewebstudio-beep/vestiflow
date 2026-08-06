import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { UserProfileDto } from '../auth/dto/user-profile.dto';
import { TenantPermission } from '../auth/tenant-permission.constants';
import { RequirePermissions } from '../common/auth/tenant-permissions.decorator';
import { TenantPermissionsGuard } from '../common/auth/tenant-permissions.guard';
import { CurrentTenant } from '../common/tenant/tenant.decorator';
import type { Paginated } from '../common/dto/pagination.dto';
import { CorrispettiviExportService } from './corrispettivi-export.service';
import {
  CorrispettiviService,
  type CorrispettiviDeliveryRow,
  type CorrispettiviOrderRow,
  type CorrispettiviSummaryDto,
} from './corrispettivi.service';
import { ListCorrispettiviQueryDto } from './dto/list-corrispettivi.query.dto';
import { MarkCorrispettiviDeliveredDto } from './dto/mark-corrispettivi-delivered.dto';
import { UpdateFiscalStatusDto } from './dto/update-fiscal-status.dto';

@Controller('corrispettivi')
@UseGuards(JwtAuthGuard, TenantPermissionsGuard)
export class CorrispettiviController {
  constructor(
    private readonly corrispettivi: CorrispettiviService,
    private readonly corrispettiviExport: CorrispettiviExportService,
  ) {}

  @Get('orders')
  @RequirePermissions(TenantPermission.ReportsView)
  listOrders(
    @CurrentTenant() tenantId: string,
    @Query() query: ListCorrispettiviQueryDto,
  ): Promise<Paginated<CorrispettiviOrderRow>> {
    return this.corrispettivi.listOrders(tenantId, query);
  }

  @Get('summary')
  @RequirePermissions(TenantPermission.ReportsView)
  getSummary(
    @CurrentTenant() tenantId: string,
    @Query() query: ListCorrispettiviQueryDto,
  ): Promise<CorrispettiviSummaryDto> {
    return this.corrispettivi.getSummary(tenantId, query);
  }

  @Get('export/csv')
  @RequirePermissions(TenantPermission.ReportsExport)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async exportCsv(
    @CurrentTenant() tenantId: string,
    @Query() query: ListCorrispettiviQueryDto,
  ): Promise<StreamableFile> {
    const csv = await this.corrispettiviExport.exportAccountantCsv(tenantId, query);
    const stamp = new Date().toISOString().slice(0, 10);
    return new StreamableFile(Buffer.from(csv, 'utf-8'), {
      type: 'text/csv; charset=utf-8',
      disposition: `attachment; filename="corrispettivi-commercialista-${stamp}.csv"`,
    });
  }

  @Get('export/spreadsheet')
  @RequirePermissions(TenantPermission.ReportsExport)
  @Header('Content-Type', 'application/vnd.ms-excel')
  async exportSpreadsheet(
    @CurrentTenant() tenantId: string,
    @Query() query: ListCorrispettiviQueryDto,
  ): Promise<StreamableFile> {
    const xml = await this.corrispettiviExport.exportAccountantSpreadsheet(tenantId, query);
    const stamp = new Date().toISOString().slice(0, 10);
    return new StreamableFile(Buffer.from(xml, 'utf-8'), {
      type: 'application/vnd.ms-excel',
      disposition: `attachment; filename="corrispettivi-commercialista-${stamp}.xls"`,
    });
  }

  @Get('export/pdf')
  @RequirePermissions(TenantPermission.ReportsExport)
  @Header('Content-Type', 'application/pdf')
  async exportPdf(
    @CurrentTenant() tenantId: string,
    @Query() query: ListCorrispettiviQueryDto,
  ): Promise<StreamableFile> {
    const { buffer, filename } = await this.corrispettiviExport.exportAccountantPdf(
      tenantId,
      query,
    );
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: `attachment; filename="${filename}"`,
    });
  }

  @Post('mark-delivered')
  @RequirePermissions(TenantPermission.ReportsExport)
  markDelivered(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Body() dto: MarkCorrispettiviDeliveredDto,
  ): Promise<CorrispettiviDeliveryRow> {
    return this.corrispettivi.markDelivered(tenantId, user, dto);
  }

  @Get('deliveries')
  @RequirePermissions(TenantPermission.ReportsView)
  listDeliveries(
    @CurrentTenant() tenantId: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ): Promise<Paginated<CorrispettiviDeliveryRow>> {
    const parsedPage = Math.max(1, Number(page) || 1);
    const parsedSize = Math.min(100, Math.max(1, Number(pageSize) || 20));
    return this.corrispettivi.listDeliveries(tenantId, parsedPage, parsedSize);
  }

  @Patch('orders/:id/fiscal-status')
  @RequirePermissions(TenantPermission.ReportsExport)
  updateFiscalStatus(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFiscalStatusDto,
  ): Promise<CorrispettiviOrderRow> {
    return this.corrispettivi.updateFiscalStatus(tenantId, id, dto);
  }
}
