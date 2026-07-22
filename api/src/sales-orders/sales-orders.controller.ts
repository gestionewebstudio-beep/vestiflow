import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';

import { CurrentUser } from '../auth/current-user.decorator';
import type { UserProfileDto } from '../auth/dto/user-profile.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantPermission } from '../auth/tenant-permission.constants';
import { RequirePermissions } from '../common/auth/tenant-permissions.decorator';
import { TenantPermissionsGuard } from '../common/auth/tenant-permissions.guard';
import { CurrentTenant } from '../common/tenant/tenant.decorator';
import type { Paginated } from '../common/dto/pagination.dto';
import { ConcludeManualSalesOrderDto } from './dto/conclude-manual-sales-order.dto';
import { ExportSalesOrdersQueryDto } from './dto/export-sales-orders.query.dto';
import { ListSalesOrdersQueryDto } from './dto/list-sales-orders.query.dto';
import { SaveManualSalesOrderDto } from './dto/save-manual-sales-order.dto';
import {
  ManualSalesOrdersService,
  type ConcludeManualOrderResult,
  type ManualOrderReservationRow,
  type ManualSalesOrderMeta,
  type ManualSalesOrderSaveResult,
} from './manual-sales-orders.service';
import { SalesOrdersExportService } from './sales-orders-export.service';
import {
  SalesOrdersService,
  type SalesOrderDetailRow,
  type SalesOrderListRow,
} from './sales-orders.service';

@Controller('sales-orders')
@UseGuards(JwtAuthGuard, TenantPermissionsGuard)
export class SalesOrdersController {
  constructor(
    private readonly salesOrders: SalesOrdersService,
    private readonly salesOrdersExport: SalesOrdersExportService,
    private readonly manualOrders: ManualSalesOrdersService,
  ) {}

  @Get()
  @RequirePermissions(TenantPermission.ReportsView)
  list(
    @CurrentTenant() tenantId: string,
    @Query() query: ListSalesOrdersQueryDto,
  ): Promise<Paginated<SalesOrderListRow>> {
    return this.salesOrders.list(tenantId, query);
  }

  @Get('export/csv')
  @RequirePermissions(TenantPermission.ReportsExport)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async exportCsv(
    @CurrentTenant() tenantId: string,
    @Query() query: ExportSalesOrdersQueryDto,
  ): Promise<StreamableFile> {
    const csv = await this.salesOrdersExport.exportCsv(tenantId, query);
    const stamp = new Date().toISOString().slice(0, 10);
    return new StreamableFile(Buffer.from(csv, 'utf-8'), {
      type: 'text/csv; charset=utf-8',
      disposition: `attachment; filename="vendite-vestiflow-${stamp}.csv"`,
    });
  }

  // ── Ordine cliente manuale (§/app/sales) ──────────────────────────────────
  // Le rotte letterali precedono ':id' (ordine di dichiarazione Nest).

  @Get('manual/meta')
  @RequirePermissions(TenantPermission.DocumentsManage)
  getManualMeta(@CurrentTenant() tenantId: string): Promise<ManualSalesOrderMeta> {
    return this.manualOrders.getMeta(tenantId);
  }

  /**
   * Salvataggio unico Ordine cliente manuale: testata + righe + impegni in
   * un'unica transazione, con avvisi disponibilità NON bloccanti (§CONTROLLI).
   */
  @Post('manual/save')
  @RequirePermissions(TenantPermission.DocumentsManage)
  saveManual(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Body() dto: SaveManualSalesOrderDto,
  ): Promise<ManualSalesOrderSaveResult> {
    return this.manualOrders.save(tenantId, dto, user);
  }

  /** Impegni attivi dell'ordine (calcolo Q.tà disponibile in modifica). */
  @Get('manual/:id/reservations')
  @RequirePermissions(TenantPermission.DocumentsManage)
  listManualReservations(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<readonly ManualOrderReservationRow[]> {
    return this.manualOrders.listActiveReservations(tenantId, id);
  }

  /** "Concludi ordine": genera il documento di scarico precompilato (bozza). */
  @Post('manual/:id/conclude')
  @RequirePermissions(TenantPermission.DocumentsManage)
  concludeManual(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConcludeManualSalesOrderDto,
  ): Promise<ConcludeManualOrderResult> {
    return this.manualOrders.conclude(tenantId, id, dto.documentType, user);
  }

  /** Forza a Concluso un ordine Parzialmente concluso (prompt DDT). */
  @Post('manual/:id/force-conclude')
  @RequirePermissions(TenantPermission.DocumentsManage)
  async forceConcludeManual(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ ok: true }> {
    await this.manualOrders.forceConclude(tenantId, id, user);
    return { ok: true };
  }

  /** Elimina un ordine cliente manuale dall'elenco (rilascia gli impegni). */
  @Delete('manual/:id')
  @HttpCode(204)
  @RequirePermissions(TenantPermission.DocumentsManage)
  deleteManual(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.manualOrders.delete(tenantId, id, user);
  }

  @Get(':id')
  @RequirePermissions(TenantPermission.ReportsView)
  getById(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SalesOrderDetailRow> {
    return this.salesOrders.getById(tenantId, id);
  }
}
