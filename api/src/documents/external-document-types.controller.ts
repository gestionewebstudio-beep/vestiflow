import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

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
import {
  CreateExternalDocumentTypeDto,
  ReorderExternalDocumentTypesDto,
  UpdateExternalDocumentTypeDto,
} from './dto/external-document-type.dto';
import { ExternalDocumentTypesService } from './external-document-types.service';

@Controller('external-document-types')
@UseGuards(JwtAuthGuard, TenantPermissionsGuard)
export class ExternalDocumentTypesController {
  constructor(private readonly types: ExternalDocumentTypesService) {}

  @Get()
  @RequireAnyPermissions(DOCUMENTS_VIEW_PERMISSIONS)
  list(@CurrentTenant() tenantId: string) {
    return this.types.list(tenantId);
  }

  @Post()
  @RequirePermissions(TenantPermission.DocumentsManage)
  create(@CurrentTenant() tenantId: string, @Body() dto: CreateExternalDocumentTypeDto) {
    return this.types.create(tenantId, dto);
  }

  @Post('reorder')
  @RequirePermissions(TenantPermission.DocumentsManage)
  reorder(@CurrentTenant() tenantId: string, @Body() dto: ReorderExternalDocumentTypesDto) {
    return this.types.reorder(tenantId, dto.orderedIds);
  }

  @Patch(':id')
  @RequirePermissions(TenantPermission.DocumentsManage)
  update(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateExternalDocumentTypeDto,
  ) {
    return this.types.update(tenantId, id, dto);
  }

  @Delete(':id')
  @RequirePermissions(TenantPermission.DocumentsManage)
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.types.delete(tenantId, id);
  }
}
