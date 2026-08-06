import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Put,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantPermission } from '../auth/tenant-permission.constants';
import {
  RequireAnyPermissions,
  RequirePermissions,
} from '../common/auth/tenant-permissions.decorator';
import { TenantPermissionsGuard } from '../common/auth/tenant-permissions.guard';
import { CurrentTenant } from '../common/tenant/tenant.decorator';

import { UpsertFiscalDeviceDto } from './dto/upsert-fiscal-device.dto';
import { FiscalDevicesService, type FiscalDeviceResult } from './fiscal-devices.service';

/**
 * Configurazione stampanti fiscali per sede. La lettura serve anche alla
 * cassa (per sapere se la sede attiva emette); la gestione è di Impostazioni.
 */
@Controller('fiscal-devices')
@UseGuards(JwtAuthGuard, TenantPermissionsGuard)
export class FiscalDevicesController {
  constructor(private readonly fiscalDevices: FiscalDevicesService) {}

  @Get()
  @RequireAnyPermissions([TenantPermission.SettingsCompany, TenantPermission.RetailRegister])
  list(@CurrentTenant() tenantId: string): Promise<FiscalDeviceResult[]> {
    return this.fiscalDevices.list(tenantId);
  }

  @Put(':locationId')
  @RequirePermissions(TenantPermission.SettingsCompany)
  upsert(
    @CurrentTenant() tenantId: string,
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Body() dto: UpsertFiscalDeviceDto,
  ): Promise<FiscalDeviceResult> {
    return this.fiscalDevices.upsert(tenantId, locationId, dto);
  }

  @Delete(':locationId')
  @RequirePermissions(TenantPermission.SettingsCompany)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentTenant() tenantId: string,
    @Param('locationId', ParseUUIDPipe) locationId: string,
  ): Promise<void> {
    await this.fiscalDevices.remove(tenantId, locationId);
  }
}
