import {
  Body,
  Controller,
  Get,
  Param,
  Put,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import { DocumentType, type UserTableViewPreference } from '@prisma/client';

import { CurrentUser } from '../auth/current-user.decorator';
import type { UserProfileDto } from '../auth/dto/user-profile.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantPermissionsGuard } from '../common/auth/tenant-permissions.guard';
import { CurrentTenant } from '../common/tenant/tenant.decorator';
import { DocumentPriceModePreferenceService } from '../documents/document-price-mode-preference.service';
import { UpsertTableViewDto } from './dto/upsert-table-view.dto';
import { UserTableViewsService } from './user-table-views.service';

/**
 * Preferenze dell'operatore, non dati di negozio: nessun permesso di sezione.
 * La modalità prezzo dei documenti vive qui e non sotto `/documents` perché la
 * chiedono anche Ordine cliente e Ordine fornitore, che stanno in altre
 * sezioni: tenerla dietro la porta dei Documenti faceva perdere la preferenza
 * in silenzio (403 ingoiato dal form).
 */
@Controller('users/me')
@UseGuards(JwtAuthGuard, TenantPermissionsGuard)
export class UserPreferencesController {
  constructor(
    private readonly tableViews: UserTableViewsService,
    private readonly documentPriceMode: DocumentPriceModePreferenceService,
  ) {}

  @Get('document-price-mode/:type')
  async getDocumentPriceMode(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Param('type') type: string,
  ): Promise<{ pricesIncludeVat: boolean }> {
    if (!(Object.values(DocumentType) as string[]).includes(type)) {
      throw new UnprocessableEntityException('Tipo documento non valido.');
    }
    const pricesIncludeVat = await this.documentPriceMode.resolvePricesIncludeVat(
      tenantId,
      user.id,
      type as DocumentType,
    );
    return { pricesIncludeVat };
  }

  @Get('table-views/:viewId')
  getTableView(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Param('viewId') viewId: string,
  ): Promise<UserTableViewPreference | null> {
    return this.tableViews.getTableView(tenantId, user.id, viewId);
  }

  @Put('table-views/:viewId')
  upsertTableView(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Param('viewId') viewId: string,
    @Body() dto: UpsertTableViewDto,
  ): Promise<UserTableViewPreference> {
    return this.tableViews.upsertTableView(tenantId, user.id, viewId, dto.stateJson);
  }
}
