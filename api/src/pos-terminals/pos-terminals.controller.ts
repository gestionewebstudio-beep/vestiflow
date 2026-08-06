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
import { TenantPermission } from '../auth/tenant-permission.constants';
import { RequirePermissions } from '../common/auth/tenant-permissions.decorator';
import { TenantPermissionsGuard } from '../common/auth/tenant-permissions.guard';
import { CurrentTenant } from '../common/tenant/tenant.decorator';

import { CreatePosTerminalDto, UpdatePosTerminalDto } from './dto/pos-terminal.dto';
import { PosTerminalsService, type PosTerminalResult } from './pos-terminals.service';

/** Anagrafica terminali POS: adempimento del portale, roba del titolare. */
@Controller('pos-terminals')
@UseGuards(JwtAuthGuard, TenantPermissionsGuard)
export class PosTerminalsController {
  constructor(private readonly posTerminals: PosTerminalsService) {}

  @Get()
  @RequirePermissions(TenantPermission.SettingsCompany)
  list(@CurrentTenant() tenantId: string): Promise<PosTerminalResult[]> {
    return this.posTerminals.list(tenantId);
  }

  @Post()
  @RequirePermissions(TenantPermission.SettingsCompany)
  create(
    @CurrentTenant() tenantId: string,
    @Body() dto: CreatePosTerminalDto,
  ): Promise<PosTerminalResult> {
    return this.posTerminals.create(tenantId, dto);
  }

  @Patch(':id')
  @RequirePermissions(TenantPermission.SettingsCompany)
  update(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePosTerminalDto,
  ): Promise<PosTerminalResult> {
    return this.posTerminals.update(tenantId, id, dto);
  }

  @Delete(':id')
  @RequirePermissions(TenantPermission.SettingsCompany)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.posTerminals.remove(tenantId, id);
  }
}
