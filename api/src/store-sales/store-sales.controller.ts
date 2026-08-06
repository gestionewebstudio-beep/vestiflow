import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../auth/current-user.decorator';
import type { UserProfileDto } from '../auth/dto/user-profile.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantPermission } from '../auth/tenant-permission.constants';
import { RequirePermissions } from '../common/auth/tenant-permissions.decorator';
import { TenantPermissionsGuard } from '../common/auth/tenant-permissions.guard';
import { CurrentTenant } from '../common/tenant/tenant.decorator';

import { CreateStoreReturnDto } from './dto/create-store-return.dto';
import { CreateStoreSaleDto } from './dto/create-store-sale.dto';
import { LookupStoreSaleItemQueryDto } from './dto/lookup-store-sale-item.query.dto';
import {
  StoreSaleLookupService,
  type StoreSaleItemLookupResult,
} from './store-sale-lookup.service';
import { StoreSalesService, type StoreSaleResult } from './store-sales.service';

/**
 * Cassa negozio (fase 3 §7-§9): vendita immediata non fiscale a carrello e
 * reso collegato. Nessuna schermata modifica quantità direttamente: tutti gli
 * effetti passano da documenti + movimenti creati in transazione dal servizio.
 */
@Controller('store-sales')
@UseGuards(JwtAuthGuard, TenantPermissionsGuard)
export class StoreSalesController {
  constructor(
    private readonly storeSales: StoreSalesService,
    private readonly lookup: StoreSaleLookupService,
  ) {}

  /** Ricerca articolo per barcode/SKU/nome con prezzo e disponibilità. */
  @Get('lookup')
  @RequirePermissions(TenantPermission.RetailRegister)
  lookupItem(
    @CurrentTenant() tenantId: string,
    @Query() query: LookupStoreSaleItemQueryDto,
  ): Promise<StoreSaleItemLookupResult[]> {
    return this.lookup.lookupItems(tenantId, query);
  }

  /** Vendite negozio recenti (per collegare un reso alla vendita origine). */
  @Get('recent')
  @RequirePermissions(TenantPermission.RetailRegister)
  recentSales(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Query('search') search?: string,
  ) {
    return this.storeSales.listRecentSales(tenantId, search?.trim() || undefined, user);
  }

  /** Concludi vendita: documento + movimenti negativi in una transazione. */
  @Post()
  @RequirePermissions(TenantPermission.RetailRegister)
  createSale(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Body() dto: CreateStoreSaleDto,
  ): Promise<StoreSaleResult> {
    return this.storeSales.createSale(tenantId, dto, user);
  }

  /** Reso vendita negozio: carico solo per la merce rientrata vendibile. */
  @Post('returns')
  @RequirePermissions(TenantPermission.RetailRegister)
  createReturn(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Body() dto: CreateStoreReturnDto,
  ): Promise<StoreSaleResult> {
    return this.storeSales.createReturn(tenantId, dto, user);
  }
}
