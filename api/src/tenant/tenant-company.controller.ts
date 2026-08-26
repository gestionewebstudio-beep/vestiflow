import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';

import { AuthProfileCacheService } from '../auth/auth-profile-cache.service';
import type { AuthenticatedRequest } from '../common/auth/authenticated-request';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantPermission } from '../auth/tenant-permission.constants';
import { RequirePermissions } from '../common/auth/tenant-permissions.decorator';
import { TenantPermissionsGuard } from '../common/auth/tenant-permissions.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { UserProfileDto } from './../auth/dto/user-profile.dto';
import { CurrentTenant } from '../common/tenant/tenant.decorator';
import type { TenantCompanyDto } from './dto/tenant-company.dto';
import type { TenantFeatureSettingsDto } from './dto/tenant-feature-settings.dto';
import { UpdateTenantFeatureSettingsDto } from './dto/tenant-feature-settings.dto';
import { TenantCompanyService } from './tenant-company.service';
import { TenantFeatureSettingsService } from './tenant-feature-settings.service';

@Controller('tenant')
@UseGuards(JwtAuthGuard, TenantPermissionsGuard)
export class TenantCompanyController {
  constructor(
    private readonly tenantCompany: TenantCompanyService,
    private readonly featureSettings: TenantFeatureSettingsService,
    private readonly profileCache: AuthProfileCacheService,
  ) {}

  @Get('company')
  @RequirePermissions(TenantPermission.SettingsCompany)
  getCompany(@CurrentTenant() tenantId: string): Promise<TenantCompanyDto> {
    return this.tenantCompany.getCompany(tenantId);
  }

  @Get('feature-settings')
  @RequirePermissions(TenantPermission.SettingsCompany)
  getFeatureSettings(@CurrentTenant() tenantId: string): Promise<TenantFeatureSettingsDto> {
    return this.featureSettings.getOrCreate(tenantId);
  }

  @Patch('feature-settings')
  @RequirePermissions(TenantPermission.SettingsCompany)
  async updateFeatureSettings(
    @CurrentTenant() tenantId: string,
    @Body() dto: UpdateTenantFeatureSettingsDto,
    @CurrentUser() user: UserProfileDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<TenantFeatureSettingsDto> {
    const settings = await this.featureSettings.update(tenantId, dto, user);
    // ⛔ **Il profilo porta `manualUnloadEnabled`, e la cache lo terrebbe fermo.**
    //
    //   Senza questa riga il titolare accende la Vendita manuale, il valore va
    //   in tabella davvero, e per un minuto non succede NIENTE: il guard serve
    //   il profilo dalla cache (60s) col flag vecchio, e la funzione «non si
    //   attiva». E’ esattamente il difetto segnalato il 26/08/2026.
    //
    // ⚠️ Invalida per CHI ha girato l’interruttore. Gli altri utenti del tenant
    //   lo vedono entro il TTL della cache: e’ un minuto, ed e’ accettabile —
    //   una invalidazione per tenant oggi non esiste, e inventarla qui sarebbe
    //   il meccanismo parallelo che il proprietario ha chiesto di non creare.
    this.profileCache.invalidate(request.authUserId);
    return settings;
  }
}
