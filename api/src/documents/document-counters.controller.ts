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
import { DOCUMENTS_VIEW_PERMISSIONS, TenantPermission } from '../auth/tenant-permission.constants';
import {
  RequireAnyPermissions,
  RequirePermissions,
} from '../common/auth/tenant-permissions.decorator';
import { TenantPermissionsGuard } from '../common/auth/tenant-permissions.guard';
import { CurrentTenant } from '../common/tenant/tenant.decorator';
import { DocumentCountersService, type DocumentCounterView } from './document-counters.service';
import { CreateDocumentCounterDto, UpdateDocumentCounterDto } from './dto/document-counter.dto';

@Controller('document-counters')
@UseGuards(JwtAuthGuard, TenantPermissionsGuard)
export class DocumentCountersController {
  constructor(private readonly counters: DocumentCountersService) {}

  @Get()
  @RequireAnyPermissions(DOCUMENTS_VIEW_PERMISSIONS)
  list(@CurrentTenant() tenantId: string): Promise<DocumentCounterView[]> {
    return this.counters.list(tenantId);
  }

  @Post()
  @RequirePermissions(TenantPermission.DocumentsManage)
  create(
    @CurrentTenant() tenantId: string,
    @Body() dto: CreateDocumentCounterDto,
  ): Promise<DocumentCounterView> {
    return this.counters.create(tenantId, {
      type: dto.type,
      series: dto.series,
      locationId: dto.locationId ?? null,
    });
  }

  @Patch(':id')
  @RequirePermissions(TenantPermission.DocumentsManage)
  update(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDocumentCounterDto,
  ): Promise<DocumentCounterView> {
    return this.counters.update(tenantId, id, {
      ...(dto.type !== undefined ? { type: dto.type } : {}),
      ...(dto.series !== undefined ? { series: dto.series } : {}),
      ...(dto.locationId !== undefined ? { locationId: dto.locationId } : {}),
    });
  }

  @Delete(':id')
  @RequirePermissions(TenantPermission.DocumentsManage)
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.counters.delete(tenantId, id);
  }
}
