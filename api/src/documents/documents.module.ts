import { Module } from '@nestjs/common';

import { ChannelsModule } from '../channels/channels.module';
import { OrderReservationsModule } from '../order-reservations/order-reservations.module';
import { VatModule } from '../vat/vat.module';
import { DocumentAttachmentsService } from './document-attachments.service';
import { DocumentPdfService } from './document-pdf.service';
import { DocumentXmlService } from './document-xml.service';
import { DocumentSettingsController } from './document-settings.controller';
import { DocumentSettingsService } from './document-settings.service';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { ExternalDocumentTypesController } from './external-document-types.controller';
import { ExternalDocumentTypesService } from './external-document-types.service';
import { GoodsReceiptCausalsController } from './goods-receipt-causals.controller';
import { GoodsReceiptCausalsService } from './goods-receipt-causals.service';
import { GoodsReceiptWorkflowService } from './goods-receipt-workflow.service';
import { TransferAdjustmentWorkflowService } from './transfer-adjustment-workflow.service';

@Module({
  imports: [ChannelsModule, VatModule, OrderReservationsModule],
  controllers: [
    DocumentsController,
    DocumentSettingsController,
    GoodsReceiptCausalsController,
    ExternalDocumentTypesController,
  ],
  providers: [
    DocumentsService,
    DocumentSettingsService,
    DocumentAttachmentsService,
    DocumentPdfService,
    DocumentXmlService,
    GoodsReceiptCausalsService,
    ExternalDocumentTypesService,
    GoodsReceiptWorkflowService,
    TransferAdjustmentWorkflowService,
  ],
  exports: [
    DocumentsService,
    DocumentSettingsService,
    GoodsReceiptWorkflowService,
    TransferAdjustmentWorkflowService,
  ],
})
export class DocumentsModule {}
