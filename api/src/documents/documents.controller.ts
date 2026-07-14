import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
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
import {
  DOCUMENTS_VIEW_PERMISSIONS,
  TenantPermission,
} from '../auth/tenant-permission.constants';
import {
  RequireAnyPermissions,
  RequirePermissions,
} from '../common/auth/tenant-permissions.decorator';
import { TenantPermissionsGuard } from '../common/auth/tenant-permissions.guard';
import { documentAttachmentUploadMulterOptions } from '../common/upload/multer-upload.options';
import type { Paginated } from '../common/dto/pagination.dto';
import { CurrentTenant } from '../common/tenant/tenant.decorator';
import { DocumentAttachmentsService } from './document-attachments.service';
import { DocumentPdfService } from './document-pdf.service';
import { CreateDocumentDto } from './dto/create-document.dto';
import { ConvertDocumentDto } from './dto/convert-document.dto';
import { ListDocumentsQueryDto } from './dto/list-documents.query.dto';
import { MarkExternallyIssuedDto } from './dto/mark-externally-issued.dto';
import { RegisterExternalDto } from './dto/register-external.dto';
import { PreviewDocumentNumberQueryDto } from './dto/preview-document-number.query.dto';
import { ConfirmDocumentDto } from './dto/confirm-document.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import {
  DocumentsService,
  type DocumentDetail,
  type DocumentListRow,
  type DocumentWithLines,
} from './documents.service';
import { SaveGoodsReceiptDto } from './dto/save-goods-receipt.dto';
import { SavePurchaseInvoiceDto } from './dto/save-purchase-invoice.dto';
import { SaveTransferDto } from './dto/save-transfer.dto';
import { SaveAdjustmentDto } from './dto/save-adjustment.dto';
import { ListLinkableGoodsReceiptsQueryDto } from './dto/list-linkable-goods-receipts.query.dto';
import { GoodsReceiptWorkflowService } from './goods-receipt-workflow.service';
import { TransferAdjustmentWorkflowService } from './transfer-adjustment-workflow.service';

@Controller('documents')
@UseGuards(JwtAuthGuard, TenantPermissionsGuard)
export class DocumentsController {
  constructor(
    private readonly documents: DocumentsService,
    private readonly attachments: DocumentAttachmentsService,
    private readonly documentPdf: DocumentPdfService,
    private readonly goodsReceiptWorkflow: GoodsReceiptWorkflowService,
    private readonly transferAdjustmentWorkflow: TransferAdjustmentWorkflowService,
  ) {}

  @Get()
  @RequireAnyPermissions(DOCUMENTS_VIEW_PERMISSIONS)
  list(
    @CurrentTenant() tenantId: string,
    @Query() query: ListDocumentsQueryDto,
  ): Promise<Paginated<DocumentListRow>> {
    return this.documents.list(tenantId, query);
  }

  /** Arrivi merce includibili in una registrazione fattura (prompt §5.1). */
  @Get('linkable-goods-receipts')
  @RequireAnyPermissions(DOCUMENTS_VIEW_PERMISSIONS)
  listLinkableGoodsReceipts(
    @CurrentTenant() tenantId: string,
    @Query() query: ListLinkableGoodsReceiptsQueryDto,
  ) {
    return this.goodsReceiptWorkflow.listLinkableGoodsReceipts(
      tenantId,
      query.supplierId,
      query.excludeInvoiceId,
    );
  }

  /**
   * Salvataggio unico Arrivo merce (prompt §2.1): testata + righe + totali +
   * movimenti per riga + giacenze in un'unica operazione idempotente.
   */
  @Post('goods-receipt/save')
  @RequirePermissions(TenantPermission.DocumentsManage)
  async saveGoodsReceipt(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Body() dto: SaveGoodsReceiptDto,
  ): Promise<{ document: DocumentDetail; warnings: string[] }> {
    const saved = await this.goodsReceiptWorkflow.saveGoodsReceipt(tenantId, dto, user);
    const document = await this.documents.getById(tenantId, saved.id);
    const warnings: string[] = [];
    if (document.linkStatus === 'linked') {
      warnings.push(
        'Totali da verificare: l\'arrivo merce è collegato a una fattura registrata. ' +
          'Controlla l\'allineamento dei totali sulla registrazione fattura.',
      );
    }
    return { document, warnings };
  }

  /** Registrazione fattura fornitore (prompt §5-6): mai movimenti di magazzino. */
  @Post('purchase-invoice/save')
  @RequirePermissions(TenantPermission.DocumentsManage)
  async savePurchaseInvoice(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Body() dto: SavePurchaseInvoiceDto,
  ): Promise<{
    document: DocumentDetail;
    receiptsTotalMinor: number;
    totalsMatch: boolean;
  }> {
    const result = await this.goodsReceiptWorkflow.savePurchaseInvoice(tenantId, dto, user);
    const document = await this.documents.getById(tenantId, result.document.id);
    return {
      document,
      receiptsTotalMinor: result.receiptsTotalMinor,
      totalsMatch: result.totalsMatch,
    };
  }

  /**
   * Salvataggio dedicato di un Trasferimento GIÀ CONFERMATO: preserva gli id
   * riga stabili così i movimenti per riga si aggiornano invece di
   * duplicarsi. La creazione e la prima conferma restano sul flusso generico
   * (POST /documents + POST /documents/:id/confirm).
   */
  @Post('transfer/save')
  @RequirePermissions(TenantPermission.DocumentsManage)
  async saveTransfer(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Body() dto: SaveTransferDto,
  ): Promise<DocumentDetail> {
    const saved = await this.transferAdjustmentWorkflow.saveTransfer(tenantId, dto, user);
    return this.documents.getById(tenantId, saved.id);
  }

  /**
   * Salvataggio dedicato di una Rettifica GIÀ CONFERMATA: preserva gli id
   * riga stabili così i movimenti per riga si aggiornano invece di
   * duplicarsi. La creazione e la prima conferma restano sul flusso generico
   * (POST /documents + POST /documents/:id/confirm).
   */
  @Post('adjustment/save')
  @RequirePermissions(TenantPermission.DocumentsManage)
  async saveAdjustment(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Body() dto: SaveAdjustmentDto,
  ): Promise<DocumentDetail> {
    const saved = await this.transferAdjustmentWorkflow.saveAdjustment(tenantId, dto, user);
    return this.documents.getById(tenantId, saved.id);
  }

  @Get('preview-number')
  @RequireAnyPermissions(DOCUMENTS_VIEW_PERMISSIONS)
  previewNumber(
    @CurrentTenant() tenantId: string,
    @Query() query: PreviewDocumentNumberQueryDto,
  ) {
    return this.documents.previewNextReference(
      tenantId,
      query.type,
      query.series,
      query.year,
    );
  }

  @Get(':id/revisions')
  @RequireAnyPermissions(DOCUMENTS_VIEW_PERMISSIONS)
  listRevisions(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.documents.listRevisions(tenantId, id);
  }

  @Get(':id/attachments')
  @RequireAnyPermissions(DOCUMENTS_VIEW_PERMISSIONS)
  listAttachments(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.attachments.listAttachments(tenantId, id);
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
    return this.attachments.uploadAttachment(tenantId, id, file, user.displayName);
  }

  @Delete(':id/attachments/:attachmentId')
  @RequirePermissions(TenantPermission.DocumentsManage)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAttachment(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
  ): Promise<void> {
    await this.attachments.deleteAttachment(tenantId, id, attachmentId);
  }

  @Get(':id/export/pdf')
  @RequireAnyPermissions(DOCUMENTS_VIEW_PERMISSIONS)
  @Header('Content-Type', 'application/pdf')
  async exportPdf(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StreamableFile> {
    const document = await this.documents.getById(tenantId, id);
    const { buffer, filename } = await this.documentPdf.exportPdf(tenantId, document);
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: `attachment; filename="${filename}"`,
    });
  }

  @Get(':id/supplier-price-diffs')
  @RequirePermissions(TenantPermission.DocumentsView)
  listSupplierPriceDiffs(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.documents.listSupplierPriceDiffs(tenantId, id);
  }

  @Get(':id')
  @RequireAnyPermissions(DOCUMENTS_VIEW_PERMISSIONS)
  getById(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DocumentDetail> {
    return this.documents.getById(tenantId, id);
  }

  @Post()
  @RequirePermissions(TenantPermission.DocumentsManage)
  create(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Body() dto: CreateDocumentDto,
  ): Promise<DocumentWithLines> {
    return this.documents.create(tenantId, dto, user);
  }

  @Patch(':id')
  @RequirePermissions(TenantPermission.DocumentsManage)
  update(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDocumentDto,
  ): Promise<DocumentDetail> {
    return this.documents.update(tenantId, id, dto, user);
  }

  @Post(':id/confirm')
  @RequirePermissions(TenantPermission.DocumentsManage)
  confirm(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConfirmDocumentDto,
  ): Promise<DocumentWithLines> {
    return this.documents.confirm(tenantId, id, user, {
      applySupplierPriceUpdates: dto.applySupplierPriceUpdates,
      closeLinkedSupplierOrder: dto.closeLinkedSupplierOrder,
    });
  }

  @Post(':id/convert')
  @RequirePermissions(TenantPermission.DocumentsManage)
  convert(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConvertDocumentDto,
  ): Promise<DocumentWithLines> {
    return this.documents.convert(tenantId, id, dto, user);
  }

  @Post(':id/print')
  @RequirePermissions(TenantPermission.DocumentsManage)
  markPrinted(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DocumentWithLines> {
    return this.documents.markPrinted(tenantId, id);
  }

  @Post(':id/send')
  @RequirePermissions(TenantPermission.DocumentsManage)
  markSent(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DocumentWithLines> {
    return this.documents.markSent(tenantId, id);
  }

  @Post(':id/register-external')
  @RequirePermissions(TenantPermission.DocumentsManage)
  registerExternal(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RegisterExternalDto,
  ): Promise<DocumentWithLines> {
    return this.documents.registerExternal(tenantId, id, dto);
  }

  @Post(':id/mark-externally-issued')
  @RequirePermissions(TenantPermission.DocumentsManage)
  markExternallyIssued(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MarkExternallyIssuedDto,
  ): Promise<DocumentWithLines> {
    return this.documents.markExternallyIssued(tenantId, id, dto);
  }

  @Post(':id/cancel')
  @RequirePermissions(TenantPermission.DocumentsManage)
  cancel(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DocumentDetail> {
    return this.documents.cancel(tenantId, id, user);
  }

  @Delete(':id')
  @RequirePermissions(TenantPermission.DocumentsManage)
  delete(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.documents.delete(tenantId, id);
  }
}
