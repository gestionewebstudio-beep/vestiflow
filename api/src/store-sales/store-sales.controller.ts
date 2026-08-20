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
 * Vendita e Reso al banco: due documenti non fiscali, entrambi AUTONOMI — il
 * Reso non ha documento origine (`11` A11), perche' la vendita reale puo'
 * essere stata battuta su una cassa esterna e non esistere in VestiFlow.
 *
 * Nessuna schermata modifica quantita' direttamente: tutti gli effetti passano
 * da documenti + movimenti riconciliati in transazione dal servizio.
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

  /** Reso al banco: carico solo per la merce rientrata vendibile. */
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
