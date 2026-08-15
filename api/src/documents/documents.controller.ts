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
  DOCUMENTS_MANAGE_PERMISSIONS,
  docManagePermission,
  DOCUMENTS_VIEW_PERMISSIONS,
  TenantPermission,
} from '../auth/tenant-permission.constants';
import {
  RequireAllPermissionGroups,
  RequireAnyPermissions,
} from '../common/auth/tenant-permissions.decorator';
import { TenantPermissionsGuard } from '../common/auth/tenant-permissions.guard';
import { attachmentDownloadFilename } from '../common/attachments/attachment-rules.util';
import { RenameAttachmentDto } from '../common/attachments/dto/rename-attachment.dto';
import { documentAttachmentUploadMulterOptions } from '../common/upload/multer-upload.options';
import type { Paginated } from '../common/dto/pagination.dto';
import { CurrentTenant } from '../common/tenant/tenant.decorator';
import { DocumentAttachmentsService } from './document-attachments.service';
import { DocumentPdfService } from './document-pdf.service';
import { DocumentXmlService } from './document-xml.service';
import { CreateDocumentDto } from './dto/create-document.dto';
import { ConvertDocumentDto } from './dto/convert-document.dto';
import { ListDocumentOperatorsQueryDto } from './dto/list-document-operators.query.dto';
import { ListDocumentsQueryDto } from './dto/list-documents.query.dto';
import { RegisterExternalDto } from './dto/register-external.dto';
import { PreviewDocumentNumberQueryDto } from './dto/preview-document-number.query.dto';
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
import {
  GoodsReceiptWorkflowService,
  type GoodsReceiptCreatedProduct,
} from './goods-receipt-workflow.service';
import { TransferAdjustmentWorkflowService } from './transfer-adjustment-workflow.service';
import { DocumentPriceModePreferenceService } from './document-price-mode-preference.service';
import { DocumentChronologyService } from './document-chronology.service';
import { ChronologyCheckQueryDto } from './dto/chronology-check.query.dto';

@Controller('documents')
@UseGuards(JwtAuthGuard, TenantPermissionsGuard)
// Porta della sezione: vale per OGNI rotta del registro, in aggiunta al gate
// di famiglia del singolo handler (§sezioni+documenti).
@RequireAllPermissionGroups([[TenantPermission.SectionDocuments]])
export class DocumentsController {
  constructor(
    private readonly documents: DocumentsService,
    private readonly attachments: DocumentAttachmentsService,
    private readonly documentPdf: DocumentPdfService,
    private readonly documentXml: DocumentXmlService,
    private readonly goodsReceiptWorkflow: GoodsReceiptWorkflowService,
    private readonly transferAdjustmentWorkflow: TransferAdjustmentWorkflowService,
    private readonly priceModePreference: DocumentPriceModePreferenceService,
    private readonly chronology: DocumentChronologyService,
  ) {}

  @Get()
  @RequireAnyPermissions(DOCUMENTS_VIEW_PERMISSIONS)
  list(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Query() query: ListDocumentsQueryDto,
  ): Promise<Paginated<DocumentListRow>> {
    return this.documents.list(tenantId, query, user);
  }

  /** Operatori che hanno creato documenti dei tipi indicati (filtro elenco). */
  @Get('operators')
  @RequireAnyPermissions(DOCUMENTS_VIEW_PERMISSIONS)
  listOperators(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Query() query: ListDocumentOperatorsQueryDto,
  ): Promise<Array<{ id: string; name: string }>> {
    return this.documents.listOperators(tenantId, query, user);
  }

  /** Arrivi merce includibili in una registrazione fattura (prompt §5.1). */
  @Get('linkable-goods-receipts')
  @RequireAnyPermissions(DOCUMENTS_VIEW_PERMISSIONS)
  listLinkableGoodsReceipts(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Query() query: ListLinkableGoodsReceiptsQueryDto,
  ) {
    return this.goodsReceiptWorkflow.listLinkableGoodsReceipts(
      tenantId,
      query.supplierId,
      query.excludeInvoiceId,
      user,
    );
  }

  /**
   * Salvataggio unico Arrivo merce (prompt §2.1): testata + righe + totali +
   * movimenti per riga + giacenze in un'unica operazione idempotente.
   */
  @Post('goods-receipt/save')
  @RequireAnyPermissions([docManagePermission('goods_receipt')])
  async saveGoodsReceipt(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Body() dto: SaveGoodsReceiptDto,
  ): Promise<{
    document: DocumentDetail;
    warnings: string[];
    createdProducts: readonly GoodsReceiptCreatedProduct[];
  }> {
    const saved = await this.goodsReceiptWorkflow.saveGoodsReceipt(tenantId, dto, user);
    const document = await this.documents.getById(tenantId, saved.document.id, user);
    const warnings: string[] = [];
    if (document.linkStatus === 'linked') {
      warnings.push(
        "Totali da verificare: l'arrivo merce è collegato a una fattura registrata. " +
          "Controlla l'allineamento dei totali sulla registrazione fattura.",
      );
    }
    return { document, warnings, createdProducts: saved.createdProducts };
  }

  /** Registrazione fattura fornitore (prompt §5-6): mai movimenti di magazzino. */
  @Post('purchase-invoice/save')
  @RequireAnyPermissions([docManagePermission('purchase_invoice')])
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
    const document = await this.documents.getById(tenantId, result.document.id, user);
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
  @RequireAnyPermissions([docManagePermission('transfer')])
  async saveTransfer(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Body() dto: SaveTransferDto,
  ): Promise<DocumentDetail> {
    const saved = await this.transferAdjustmentWorkflow.saveTransfer(tenantId, dto, user);
    return this.documents.getById(tenantId, saved.id, user);
  }

  /**
   * Salvataggio dedicato di una Rettifica GIÀ CONFERMATA: preserva gli id
   * riga stabili così i movimenti per riga si aggiornano invece di
   * duplicarsi. La creazione e la prima conferma restano sul flusso generico
   * (POST /documents + POST /documents/:id/confirm).
   */
  @Post('adjustment/save')
  @RequireAnyPermissions([docManagePermission('adjustment')])
  async saveAdjustment(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Body() dto: SaveAdjustmentDto,
  ): Promise<DocumentDetail> {
    const saved = await this.transferAdjustmentWorkflow.saveAdjustment(tenantId, dto, user);
    return this.documents.getById(tenantId, saved.id, user);
  }

  @Get('preview-number')
  @RequireAnyPermissions(DOCUMENTS_VIEW_PERMISSIONS)
  previewNumber(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Query() query: PreviewDocumentNumberQueryDto,
  ) {
    return this.documents.previewNextReference(
      tenantId,
      query.type,
      query.series,
      query.locationId,
      query.documentDate ? new Date(query.documentDate) : undefined,
      user,
    );
  }

  /**
   * Controllo cronologico del contatore (§4): l'elenco dei documenti fuori
   * posto, più se l'operatore ha spento l'avviso per questo tipo.
   *
   * Prima di `:id/...`: una rotta con segmento fisso va dichiarata prima di
   * quella con parametro, o «chronology» finirebbe interpretato come un id.
   */
  @Get('chronology')
  @RequireAnyPermissions(DOCUMENTS_VIEW_PERMISSIONS)
  chronologyCheck(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Query() query: ChronologyCheckQueryDto,
  ) {
    return this.chronology.check({
      tenantId,
      user,
      type: query.type,
      series: query.series ?? null,
      number: query.number,
      documentDate: new Date(query.documentDate),
      excludeId: query.excludeId ?? null,
    });
  }

  /** Spegne l'avviso cronologico per (tenant, utente, tipo). Non si riaccende. */
  @Post('chronology/dismiss')
  @RequireAnyPermissions(DOCUMENTS_VIEW_PERMISSIONS)
  @HttpCode(204)
  async dismissChronologyWarning(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Query() query: ChronologyCheckQueryDto,
  ): Promise<void> {
    await this.chronology.dismiss(tenantId, user, query.type);
  }

  @Get(':id/revisions')
  @RequireAnyPermissions(DOCUMENTS_VIEW_PERMISSIONS)
  listRevisions(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.documents.listRevisions(tenantId, id, user);
  }

  @Get(':id/attachments')
  @RequireAnyPermissions(DOCUMENTS_VIEW_PERMISSIONS)
  async listAttachments(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    // Gate di lettura: stesso scope location dell'apertura diretta del documento.
    await this.documents.getById(tenantId, id, user);
    return this.attachments.listAttachments(tenantId, id);
  }

  /** Spazio allegati del documento (indicatore nella modale allegati). */
  @Get(':id/attachments/quota')
  @RequireAnyPermissions(DOCUMENTS_VIEW_PERMISSIONS)
  async attachmentsQuota(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.documents.getById(tenantId, id, user);
    return this.attachments.quota(tenantId, id);
  }

  /** Download allegato: il bucket è privato, i byte passano dall'API. */
  @Get(':id/attachments/:attachmentId/download')
  @RequireAnyPermissions(DOCUMENTS_VIEW_PERMISSIONS)
  async downloadAttachment(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
  ): Promise<StreamableFile> {
    await this.documents.getById(tenantId, id, user);
    const file = await this.attachments.downloadAttachment(tenantId, id, attachmentId);
    return new StreamableFile(file.buffer, {
      type: file.mimeType,
      disposition: `attachment; filename="${attachmentDownloadFilename(file.fileName)}"`,
    });
  }

  @Post(':id/attachments')
  @RequireAnyPermissions(DOCUMENTS_MANAGE_PERMISSIONS)
  @UseInterceptors(FileInterceptor('file', documentAttachmentUploadMulterOptions))
  async uploadAttachment(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    // Gate di scrittura: la sede del documento deve essere nello scope utente.
    await this.documents.assertWritableById(tenantId, id, user);
    return this.attachments.uploadAttachment(tenantId, id, file, user.displayName);
  }

  /** Rinomina allegato: cambia solo il nome mostrato, i byte restano dove sono. */
  @Patch(':id/attachments/:attachmentId')
  @RequireAnyPermissions(DOCUMENTS_MANAGE_PERMISSIONS)
  async renameAttachment(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
    @Body() dto: RenameAttachmentDto,
  ) {
    await this.documents.assertWritableById(tenantId, id, user);
    return this.attachments.renameAttachment(tenantId, id, attachmentId, dto.fileName);
  }

  @Delete(':id/attachments/:attachmentId')
  @RequireAnyPermissions(DOCUMENTS_MANAGE_PERMISSIONS)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAttachment(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
  ): Promise<void> {
    // Gate di scrittura: la sede del documento deve essere nello scope utente.
    await this.documents.assertWritableById(tenantId, id, user);
    await this.attachments.deleteAttachment(tenantId, id, attachmentId);
  }

  @Get(':id/export/pdf')
  @RequireAnyPermissions(DOCUMENTS_VIEW_PERMISSIONS)
  @Header('Content-Type', 'application/pdf')
  async exportPdf(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StreamableFile> {
    const document = await this.documents.getById(tenantId, id, user);
    const { buffer, filename } = await this.documentPdf.exportPdf(tenantId, document);
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: `attachment; filename="${filename}"`,
    });
  }

  /**
   * L'intestazione emittente che questo documento stamperà, già composta.
   * La usa l'anteprima a schermo per mostrare la stessa testata del PDF: non
   * legge l'anagrafica corrente, perché su un documento già emesso vince lo
   * snapshot congelato all'emissione.
   *
   * Stesso gate dell'export PDF: chi può vedere il documento può vederne la
   * testata, e `getById` applica comunque il filtro di famiglia.
   */
  @Get(':id/print-header')
  @RequireAnyPermissions(DOCUMENTS_VIEW_PERMISSIONS)
  async printHeader(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ legalName: string; lines: readonly string[]; footer: string | null }> {
    const document = await this.documents.getById(tenantId, id, user);
    return this.documentPdf.issuerHeader(tenantId, document);
  }

  @Get(':id/export/xml')
  @RequireAnyPermissions(DOCUMENTS_VIEW_PERMISSIONS)
  @Header('Content-Type', 'application/xml')
  async exportXml(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StreamableFile> {
    const document = await this.documents.getById(tenantId, id, user);
    const { xml, filename } = await this.documentXml.exportXml(tenantId, document);
    return new StreamableFile(Buffer.from(xml, 'utf-8'), {
      type: 'application/xml',
      disposition: `attachment; filename="${filename}"`,
    });
  }

  @Get(':id/supplier-price-diffs')
  @RequireAnyPermissions(DOCUMENTS_VIEW_PERMISSIONS)
  listSupplierPriceDiffs(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.documents.listSupplierPriceDiffs(tenantId, id, user);
  }

  @Get(':id')
  @RequireAnyPermissions(DOCUMENTS_VIEW_PERMISSIONS)
  getById(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DocumentDetail> {
    return this.documents.getById(tenantId, id, user);
  }

  @Post()
  @RequireAnyPermissions(DOCUMENTS_MANAGE_PERMISSIONS)
  create(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Body() dto: CreateDocumentDto,
  ): Promise<DocumentWithLines> {
    return this.documents.create(tenantId, dto, user);
  }

  @Patch(':id')
  @RequireAnyPermissions(DOCUMENTS_MANAGE_PERMISSIONS)
  update(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDocumentDto,
  ): Promise<DocumentDetail> {
    return this.documents.update(tenantId, id, dto, user);
  }

  /** Prefill di conversione (form di destinazione): non crea nulla. */
  @Post(':id/convert-prefill')
  @RequireAnyPermissions(DOCUMENTS_MANAGE_PERMISSIONS)
  convertPrefill(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConvertDocumentDto,
  ): Promise<CreateDocumentDto> {
    return this.documents.convertPrefill(tenantId, id, dto, user);
  }

  /** «Inviata al commercialista»: unica azione di ciclo di vita fiscale. */
  @Post(':id/register-external')
  @RequireAnyPermissions(DOCUMENTS_MANAGE_PERMISSIONS)
  registerExternal(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RegisterExternalDto,
  ): Promise<DocumentWithLines> {
    return this.documents.registerExternal(tenantId, id, dto, user);
  }

  @Post(':id/cancel')
  @RequireAnyPermissions(DOCUMENTS_MANAGE_PERMISSIONS)
  cancel(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DocumentDetail> {
    return this.documents.cancel(tenantId, id, user);
  }

  @Delete(':id')
  @RequireAnyPermissions(DOCUMENTS_MANAGE_PERMISSIONS)
  delete(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.documents.delete(tenantId, id, user);
  }
}
