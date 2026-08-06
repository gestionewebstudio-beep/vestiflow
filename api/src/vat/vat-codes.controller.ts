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
  CATALOG_SECTION_PERMISSIONS,
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
  CreateVatCodeDto,
  DuplicateVatCodeDto,
  ReorderVatCodesDto,
  UpdateVatCodeDto,
} from './dto/vat-code.dto';
import { VatCodesService } from './vat-codes.service';

/** Lettura consentita a chi compila documenti o gestisce il catalogo. */
const VAT_READ_PERMISSIONS = [
  ...DOCUMENTS_VIEW_PERMISSIONS,
  ...CATALOG_SECTION_PERMISSIONS,
] as const;

@Controller('vat-codes')
@UseGuards(JwtAuthGuard, TenantPermissionsGuard)
export class VatCodesController {
  constructor(private readonly vatCodes: VatCodesService) {}

  @Get()
  @RequireAnyPermissions(VAT_READ_PERMISSIONS)
  list(@CurrentTenant() tenantId: string) {
    return this.vatCodes.list(tenantId);
  }

  @Get('natures')
  @RequireAnyPermissions(VAT_READ_PERMISSIONS)
  listNatures() {
    return this.vatCodes.listNatures();
  }

  @Post()
  @RequirePermissions(TenantPermission.SettingsCompany)
  create(@CurrentTenant() tenantId: string, @Body() dto: CreateVatCodeDto) {
    return this.vatCodes.create(tenantId, dto);
  }

  @Post('reorder')
  @RequirePermissions(TenantPermission.SettingsCompany)
  reorder(@CurrentTenant() tenantId: string, @Body() dto: ReorderVatCodesDto) {
    return this.vatCodes.reorder(tenantId, dto.orderedIds);
  }

  @Post(':id/duplicate')
  @RequirePermissions(TenantPermission.SettingsCompany)
  duplicate(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DuplicateVatCodeDto,
  ) {
    return this.vatCodes.duplicate(tenantId, id, dto.code);
  }

  @Patch(':id')
  @RequirePermissions(TenantPermission.SettingsCompany)
  update(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVatCodeDto,
  ) {
    return this.vatCodes.update(tenantId, id, dto);
  }

  @Delete(':id')
  @RequirePermissions(TenantPermission.SettingsCompany)
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.vatCodes.delete(tenantId, id);
  }
}
