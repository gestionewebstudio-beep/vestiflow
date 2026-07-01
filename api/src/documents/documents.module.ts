import { Module } from '@nestjs/common';

import { ChannelsModule } from '../channels/channels.module';
import { DocumentAttachmentsService } from './document-attachments.service';
import { DocumentPdfService } from './document-pdf.service';
import { DocumentSettingsController } from './document-settings.controller';
import { DocumentSettingsService } from './document-settings.service';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';

@Module({
  imports: [ChannelsModule],
  controllers: [DocumentsController, DocumentSettingsController],
  providers: [DocumentsService, DocumentSettingsService, DocumentAttachmentsService, DocumentPdfService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
