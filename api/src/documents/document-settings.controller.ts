import { Body, Controller, Get, Param, ParseEnumPipe, Patch, UseGuards } from '@nestjs/common';
import { DocumentType } from '@prisma/client';

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
import { CurrentTenant } from '../common/tenant/tenant.decorator';
import { DocumentSettingsService } from './document-settings.service';
import type { ResolvedDocumentTypeSetting } from './document-defaults';
import { UpdateDocumentTypeSettingDto } from './dto/update-document-type-setting.dto';

@Controller('document-settings')
@UseGuards(JwtAuthGuard, TenantPermissionsGuard)
export class DocumentSettingsController {
  constructor(private readonly settings: DocumentSettingsService) {}

  @Get()
  @RequireAnyPermissions(DOCUMENTS_VIEW_PERMISSIONS)
  list(@CurrentTenant() tenantId: string): Promise<ResolvedDocumentTypeSetting[]> {
    return this.settings.listResolved(tenantId);
  }

  @Patch(':type')
  @RequirePermissions(TenantPermission.DocumentsManage)
  update(
    @CurrentTenant() tenantId: string,
    @Param('type', new ParseEnumPipe(DocumentType)) type: DocumentType,
    @Body() dto: UpdateDocumentTypeSettingDto,
  ): Promise<ResolvedDocumentTypeSetting> {
    return this.settings.update(tenantId, type, dto);
  }
}
