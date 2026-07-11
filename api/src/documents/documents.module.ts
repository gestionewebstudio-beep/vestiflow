import { Module } from '@nestjs/common';

import { ChannelsModule } from '../channels/channels.module';
import { DocumentAttachmentsService } from './document-attachments.service';
import { DocumentPdfService } from './document-pdf.service';
import { DocumentSettingsController } from './document-settings.controller';
import { DocumentSettingsService } from './document-settings.service';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { GoodsReceiptCausalsController } from './goods-receipt-causals.controller';
import { GoodsReceiptCausalsService } from './goods-receipt-causals.service';
import { GoodsReceiptWorkflowService } from './goods-receipt-workflow.service';

@Module({
  imports: [ChannelsModule],
  controllers: [DocumentsController, DocumentSettingsController, GoodsReceiptCausalsController],
  providers: [
    DocumentsService,
    DocumentSettingsService,
    DocumentAttachmentsService,
    DocumentPdfService,
    GoodsReceiptCausalsService,
    GoodsReceiptWorkflowService,
  ],
  exports: [DocumentsService, GoodsReceiptWorkflowService],
})
export class DocumentsModule {}
