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

import { CurrentUser } from '../auth/current-user.decorator';
import type { UserProfileDto } from '../auth/dto/user-profile.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  MANUAL_RECEIPT_READ_GROUPS,
  MANUAL_RECEIPT_WRITE_GROUPS,
} from '../auth/tenant-permission.constants';
import { RequireAllPermissionGroups } from '../common/auth/tenant-permissions.decorator';
import { TenantPermissionsGuard } from '../common/auth/tenant-permissions.guard';
import { CurrentTenant } from '../common/tenant/tenant.decorator';
import { SaveManualReceiptDto } from './dto/save-manual-receipt.dto';
import {
  ManualReceiptsService,
  type ManualReceiptDto,
  type ManualReceiptLocationDto,
} from './manual-receipts.service';

/**
 * Il Corrispettivo manuale (`10` §12): tre verbi, e l'elenco delle sedi che la
 * sua testata può proporre.
 *
 * **Non c'è un `GET` di elenco**, ed è deliberato: le registrazioni non hanno un
 * registro proprio: si consultano nel Registro Corrispettivi insieme alle altre
 * tre sorgenti, con i filtri di quello. Un secondo elenco sarebbe una vista
 * parallela che può solo divergere da quella vera.
 */
@Controller('manual-receipts')
@UseGuards(JwtAuthGuard, TenantPermissionsGuard)
export class ManualReceiptsController {
  constructor(private readonly manualReceipts: ManualReceiptsService) {}

  /**
   * Le sedi selezionabili in testata. Sta dietro il permesso di SCRITTURA
   * perché serve solo a compilare la maschera: chi può solo consultare il
   * Registro non ha una testata da riempire.
   */
  @Get('locations')
  @RequireAllPermissionGroups(MANUAL_RECEIPT_WRITE_GROUPS)
  listLocations(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
  ): Promise<ManualReceiptLocationDto[]> {
    return this.manualReceipts.listUsableLocations(tenantId, user);
  }

  /** Apertura in modifica: chi vede il Registro può aprire una sua riga. */
  @Get(':id')
  @RequireAllPermissionGroups(MANUAL_RECEIPT_READ_GROUPS)
  getById(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ManualReceiptDto> {
    return this.manualReceipts.getById(tenantId, id);
  }

  @Post()
  @RequireAllPermissionGroups(MANUAL_RECEIPT_WRITE_GROUPS)
  create(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Body() dto: SaveManualReceiptDto,
  ): Promise<ManualReceiptDto> {
    return this.manualReceipts.create(tenantId, dto, user);
  }

  @Patch(':id')
  @RequireAllPermissionGroups(MANUAL_RECEIPT_WRITE_GROUPS)
  update(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveManualReceiptDto,
  ): Promise<ManualReceiptDto> {
    return this.manualReceipts.update(tenantId, id, dto, user);
  }

  @Delete(':id')
  @RequireAllPermissionGroups(MANUAL_RECEIPT_WRITE_GROUPS)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.manualReceipts.remove(tenantId, id, user);
  }
}
