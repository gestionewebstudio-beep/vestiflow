import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantOwnerGuard } from '../common/auth/tenant-owner.guard';
import { CurrentTenant } from '../common/tenant/tenant.decorator';
import { CompanyProfileService } from './company-profile.service';
import type { CompanyProfileDto } from './dto/company-profile.dto';
import { UpdateCompanyProfileDto } from './dto/company-profile.dto';

/**
 * Riservato al titolare, in lettura e in scrittura (decisione di prodotto
 * 08/2026): è l'identità fiscale dell'azienda, non una preferenza operativa.
 *
 * Il cancello è il ruolo, non un permesso concedibile: una chiave in
 * `TenantPermission` il titolare potrebbe regalarla, e la riserva durerebbe
 * fino al primo clic.
 *
 * Che sia riservata non significa che i documenti restino senza intestazione:
 * stampe, XML e precompilazioni leggono l'anagrafica lato server, dove nessun
 * operatore «legge» niente. Il confine sta su questa maschera.
 */
@Controller('tenant/company-profile')
@UseGuards(JwtAuthGuard, TenantOwnerGuard)
export class CompanyProfileController {
  constructor(private readonly companyProfile: CompanyProfileService) {}

  @Get()
  get(@CurrentTenant() tenantId: string): Promise<CompanyProfileDto> {
    return this.companyProfile.get(tenantId);
  }

  @Patch()
  update(
    @CurrentTenant() tenantId: string,
    @Body() dto: UpdateCompanyProfileDto,
  ): Promise<CompanyProfileDto> {
    return this.companyProfile.update(tenantId, dto);
  }
}
