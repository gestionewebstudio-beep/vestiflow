import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantPermission } from '../auth/tenant-permission.constants';
import { RequirePermissions } from '../common/auth/tenant-permissions.decorator';
import { TenantPermissionsGuard } from '../common/auth/tenant-permissions.guard';
import { CurrentTenant } from '../common/tenant/tenant.decorator';

import { ReportFiscalOutcomeDto } from './dto/report-fiscal-outcome.dto';
import {
  FiscalReceiptsService,
  type FiscalReceiptOutcomeResult,
  type PendingFiscalReceipt,
} from './fiscal-receipts.service';

/**
 * Esiti di emissione e coda «da fiscalizzare»: chi sta al banco emette e
 * riporta, il server registra. La stampa vera avviene nel browser (la
 * stampante è nella LAN del negozio, il server non la vede).
 */
@Controller('fiscal-receipts')
@UseGuards(JwtAuthGuard, TenantPermissionsGuard)
export class FiscalReceiptsController {
  constructor(private readonly fiscalReceipts: FiscalReceiptsService) {}

  @Get('pending')
  @RequirePermissions(TenantPermission.RetailRegister)
  listPending(
    @CurrentTenant() tenantId: string,
    @Query('locationId', ParseUUIDPipe) locationId: string,
  ): Promise<PendingFiscalReceipt[]> {
    return this.fiscalReceipts.listPending(tenantId, locationId);
  }

  @Post(':documentId/outcome')
  @RequirePermissions(TenantPermission.RetailRegister)
  reportOutcome(
    @CurrentTenant() tenantId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Body() dto: ReportFiscalOutcomeDto,
  ): Promise<FiscalReceiptOutcomeResult> {
    return this.fiscalReceipts.reportOutcome(tenantId, documentId, dto);
  }
}
