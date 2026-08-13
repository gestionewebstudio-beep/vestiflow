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
import type { UnitOfMeasureOption } from '@prisma/client';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  DOCUMENTS_MANAGE_PERMISSIONS,
  DOCUMENTS_VIEW_PERMISSIONS,
  SUPPLIER_ORDERS_MANAGE_PERMISSIONS,
  SUPPLIER_ORDERS_VIEW_PERMISSIONS,
  TenantPermission,
} from '../auth/tenant-permission.constants';
import { RequireAnyPermissions } from '../common/auth/tenant-permissions.decorator';
import { TenantPermissionsGuard } from '../common/auth/tenant-permissions.guard';
import { CurrentTenant } from '../common/tenant/tenant.decorator';
import {
  CreateUnitOfMeasureOptionDto,
  UpdateUnitOfMeasureOptionDto,
} from './dto/unit-of-measure-option.dto';
import { UnitOfMeasureOptionsService } from './unit-of-measure-options.service';

/** Legge chi compila un documento o guarda il catalogo: è dove l'unità si usa. */
const UNIT_OF_MEASURE_READ_PERMISSIONS = [
  ...DOCUMENTS_VIEW_PERMISSIONS,
  ...SUPPLIER_ORDERS_VIEW_PERMISSIONS,
  TenantPermission.CatalogManage,
] as const;

/**
 * Scrive chi gestisce documenti, ordini fornitore o catalogo — **non** solo chi
 * amministra l'azienda.
 *
 * È la differenza con le voci pagamento, che restano dietro `settings.company`:
 * quelle si configurano una volta, un'unità di misura nasce mentre si scrive
 * una riga, dal comando in coda alla tendina. Chiuderla dietro un permesso di
 * amministrazione renderebbe quel comando visibile e inutile proprio a chi lo
 * incontra.
 *
 * «Gestisce documenti» non è più un permesso solo: dal modello a sezioni e
 * famiglie (11/08/2026) è una famiglia per tipo documento, e qui vale
 * QUALUNQUE di esse — chi scrive anche un solo tipo di documento incontra la
 * tendina delle unità, e con essa il comando che ne aggiunge una.
 */
const UNIT_OF_MEASURE_WRITE_PERMISSIONS = [
  ...DOCUMENTS_MANAGE_PERMISSIONS,
  ...SUPPLIER_ORDERS_MANAGE_PERMISSIONS,
  TenantPermission.CatalogManage,
  TenantPermission.SettingsCompany,
] as const;

@Controller('unit-of-measure-options')
@UseGuards(JwtAuthGuard, TenantPermissionsGuard)
export class UnitOfMeasureOptionsController {
  constructor(private readonly options: UnitOfMeasureOptionsService) {}

  @Get()
  @RequireAnyPermissions(UNIT_OF_MEASURE_READ_PERMISSIONS)
  list(@CurrentTenant() tenantId: string): Promise<UnitOfMeasureOption[]> {
    return this.options.list(tenantId);
  }

  @Post()
  @RequireAnyPermissions(UNIT_OF_MEASURE_WRITE_PERMISSIONS)
  create(
    @CurrentTenant() tenantId: string,
    @Body() dto: CreateUnitOfMeasureOptionDto,
  ): Promise<UnitOfMeasureOption> {
    return this.options.create(tenantId, dto.name);
  }

  @Patch(':id')
  @RequireAnyPermissions(UNIT_OF_MEASURE_WRITE_PERMISSIONS)
  update(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUnitOfMeasureOptionDto,
  ): Promise<UnitOfMeasureOption> {
    return this.options.update(tenantId, id, dto);
  }

  @Delete(':id')
  @RequireAnyPermissions(UNIT_OF_MEASURE_WRITE_PERMISSIONS)
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.options.delete(tenantId, id);
  }
}
