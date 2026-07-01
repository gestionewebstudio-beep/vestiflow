import { Module } from '@nestjs/common';

import { UserPreferencesController } from './user-preferences.controller';
import { UserTableViewsService } from './user-table-views.service';

@Module({
  controllers: [UserPreferencesController],
  providers: [UserTableViewsService],
})
export class UserPreferencesModule {}
