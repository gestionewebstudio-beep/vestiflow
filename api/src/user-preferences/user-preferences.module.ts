import { Module } from '@nestjs/common';

import { DocumentsModule } from '../documents/documents.module';
import { UserPreferencesController } from './user-preferences.controller';
import { UserTableViewsService } from './user-table-views.service';

@Module({
  imports: [DocumentsModule],
  controllers: [UserPreferencesController],
  providers: [UserTableViewsService],
})
export class UserPreferencesModule {}
