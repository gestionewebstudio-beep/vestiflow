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
import { ONLINE_SALES_VIEW_GROUPS, TenantPermission } from '../auth/tenant-permission.constants';
import { RequireAllPermissionGroups } from '../common/auth/tenant-permissions.decorator';
import { TenantPermissionsGuard } from '../common/auth/tenant-permissions.guard';
import { CurrentTenant } from '../common/tenant/tenant.decorator';
import type { Paginated } from '../common/dto/pagination.dto';
import { CorrispettiviExportService } from './corrispettivi-export.service';
import {
  CorrispettiviService,
  type CorrispettiviOrderRow,
  type CorrispettiviRegisterRow,
  type CorrispettiviSummaryDto,
} from './corrispettivi.service';
import { ListCorrispettiviQueryDto } from './dto/list-corrispettivi.query.dto';

@Controller('corrispettivi')
@UseGuards(JwtAuthGuard, TenantPermissionsGuard)
export class CorrispettiviController {
  constructor(
    private readonly corrispettivi: CorrispettiviService,
    private readonly corrispettiviExport: CorrispettiviExportService,
  ) {}

  @Get('orders')
  @RequireAllPermissionGroups(ONLINE_SALES_VIEW_GROUPS)
  listOrders(
    @CurrentTenant() tenantId: string,
    @Query() query: ListCorrispettiviQueryDto,
  ): Promise<Paginated<CorrispettiviRegisterRow>> {
    return this.corrispettivi.listOrders(tenantId, query);
  }

  @Get('summary')
  @RequireAllPermissionGroups(ONLINE_SALES_VIEW_GROUPS)
  getSummary(
    @CurrentTenant() tenantId: string,
    @Query() query: ListCorrispettiviQueryDto,
  ): Promise<CorrispettiviSummaryDto> {
    return this.corrispettivi.getSummary(tenantId, query);
  }

  @Get('export/csv')
  @RequireAllPermissionGroups([...ONLINE_SALES_VIEW_GROUPS, [TenantPermission.ReportsExport]])
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
  @RequireAllPermissionGroups([...ONLINE_SALES_VIEW_GROUPS, [TenantPermission.ReportsExport]])
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
  @RequireAllPermissionGroups([...ONLINE_SALES_VIEW_GROUPS, [TenantPermission.ReportsExport]])
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
}
