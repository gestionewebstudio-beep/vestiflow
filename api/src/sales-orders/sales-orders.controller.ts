import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

import { CurrentUser } from '../auth/current-user.decorator';
import type { UserProfileDto } from '../auth/dto/user-profile.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantPermission } from '../auth/tenant-permission.constants';
import { RequirePermissions } from '../common/auth/tenant-permissions.decorator';
import { TenantPermissionsGuard } from '../common/auth/tenant-permissions.guard';
import { CurrentTenant } from '../common/tenant/tenant.decorator';
import type { Paginated } from '../common/dto/pagination.dto';
import { attachmentDownloadFilename } from '../common/attachments/attachment-rules.util';
import { documentAttachmentUploadMulterOptions } from '../common/upload/multer-upload.options';
import { AttachmentsService } from '../attachments/attachments.service';
import { RenameAttachmentDto } from '../common/attachments/dto/rename-attachment.dto';
import { ConcludeManualSalesOrderDto } from './dto/conclude-manual-sales-order.dto';
import { DuplicateManualSalesOrderDto } from './dto/duplicate-manual-sales-order.dto';
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
import { SalesOrderPdfService } from './sales-order-pdf.service';
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
    private readonly salesOrderPdf: SalesOrderPdfService,
    private readonly attachments: AttachmentsService,
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

  /** Duplica un ordine in un nuovo ordine cliente manuale col cliente scelto. */
  @Post('manual/:id/duplicate')
  @RequirePermissions(TenantPermission.DocumentsManage)
  duplicateManual(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DuplicateManualSalesOrderDto,
  ): Promise<ManualSalesOrderSaveResult> {
    return this.manualOrders.duplicate(tenantId, id, dto.customerId, user);
  }

  // ── Allegati (sottosistema generico, entità 'sales_order') ────────────────

  @Get(':id/attachments')
  @RequirePermissions(TenantPermission.ReportsView)
  listAttachments(@CurrentTenant() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.attachments.list(tenantId, 'sales_order', id);
  }

  @Post(':id/attachments')
  @RequirePermissions(TenantPermission.DocumentsManage)
  @UseInterceptors(FileInterceptor('file', documentAttachmentUploadMulterOptions))
  uploadAttachment(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.attachments.upload(tenantId, 'sales_order', id, file, user.displayName ?? 'API');
  }

  /** Spazio allegati dell'ordine (indicatore nella modale allegati). */
  @Get(':id/attachments/quota')
  @RequirePermissions(TenantPermission.ReportsView)
  attachmentsQuota(@CurrentTenant() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.attachments.quota(tenantId, 'sales_order', id);
  }

  /** Download allegato: il bucket è privato, i byte passano dall'API. */
  @Get(':id/attachments/:attachmentId/download')
  @RequirePermissions(TenantPermission.ReportsView)
  async downloadAttachment(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
  ): Promise<StreamableFile> {
    const file = await this.attachments.download(tenantId, 'sales_order', id, attachmentId);
    return new StreamableFile(file.buffer, {
      type: file.mimeType,
      disposition: `attachment; filename="${attachmentDownloadFilename(file.fileName)}"`,
    });
  }

  /** Rinomina allegato: cambia solo il nome mostrato, i byte restano dove sono. */
  @Patch(':id/attachments/:attachmentId')
  @RequirePermissions(TenantPermission.DocumentsManage)
  renameAttachment(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
    @Body() dto: RenameAttachmentDto,
  ) {
    return this.attachments.rename(tenantId, 'sales_order', id, attachmentId, dto.fileName);
  }

  @Delete(':id/attachments/:attachmentId')
  @HttpCode(204)
  @RequirePermissions(TenantPermission.DocumentsManage)
  deleteAttachment(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
  ): Promise<void> {
    return this.attachments.delete(tenantId, 'sales_order', id, attachmentId);
  }

  /** Stampa PDF dell'ordine cliente (qualunque origine). */
  @Get(':id/export/pdf')
  @RequirePermissions(TenantPermission.ReportsView)
  @Header('Content-Type', 'application/pdf')
  async exportPdf(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StreamableFile> {
    const order = await this.salesOrders.getById(tenantId, id);
    const { buffer, filename } = await this.salesOrderPdf.exportPdf(tenantId, order);
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: `attachment; filename="${filename}"`,
    });
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
