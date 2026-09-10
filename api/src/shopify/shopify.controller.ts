import { Body, Controller, Delete, Get, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { TenantChannelProfile, UserRole } from '@prisma/client';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  CATALOG_SECTION_PERMISSIONS,
  SHOPIFY_CATALOG_SYNC_PERMISSIONS,
  SHOPIFY_CUSTOMERS_SYNC_GROUPS,
  SHOPIFY_INVENTORY_SYNC_PERMISSIONS,
  SHOPIFY_ORDERS_SYNC_GROUPS,
  TenantPermission,
} from '../auth/tenant-permission.constants';
import {
  RequireAllPermissionGroups,
  RequireAnyPermissions,
  RequirePermissions,
} from '../common/auth/tenant-permissions.decorator';
import { ChannelProfileGuard } from '../common/auth/channel-profile.guard';
import { RequireChannelProfile } from '../common/auth/channel-profile.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { RolesGuard } from '../common/auth/roles.guard';
import { TenantPermissionsGuard } from '../common/auth/tenant-permissions.guard';
import { Public } from '../common/decorators/public.decorator';
import { CurrentTenant } from '../common/tenant/tenant.decorator';
import { BeginShopifyAuthDto } from './dto/begin-shopify-auth.dto';
import type { ShopifyConnectionDto } from './shopify-config.service';
import { ShopifyConfigService } from './shopify-config.service';
import type { ClearShopifyErrorsResult } from './shopify-connection.service';
import { ShopifyConnectionService } from './shopify-connection.service';
import { ShopifyOAuthService } from './shopify-oauth.service';
import { ShopifyWebhookRepairService } from './shopify-webhook-repair.service';
import type { ShopifyWebhookStatusResult } from './shopify-webhook-status.service';
import { ShopifyWebhookStatusService } from './shopify-webhook-status.service';
import { ShopifyInventoryPullService } from './shopify-inventory-pull.service';
import type { ShopifyInventoryPullResult } from './shopify-inventory-pull.service';
import { ShopifyInventoryAlignService, istanteRipresa } from './shopify-inventory-align.service';
import type { EsitoAllineamento } from './shopify-inventory-align.service';
import { ShopifyInventoryRepublishService } from './shopify-inventory-republish.service';
import type { InventoryRepublishResult } from './shopify-inventory-republish.service';
import { ShopifyCustomersPullService } from './shopify-customers-pull.service';
import type { ShopifyCustomersPullResult } from './shopify-customers-pull.service';
import { ShopifyOrdersPullService } from './shopify-orders-pull.service';
import type { ShopifyOrdersPullResult } from './shopify-orders-pull.service';
import { ShopifyProductPullService } from './shopify-product-pull.service';
import type { ShopifyCatalogSyncResult } from './shopify-product-pull.service';
import { ShopifyTaxonomyService } from './shopify-taxonomy.service';
import { ListTaxonomyCategoriesQueryDto } from './dto/list-taxonomy-categories.query.dto';
import { ListCategoryAttributesQueryDto } from './dto/list-category-attributes.query.dto';
import { PurgeShopifyDataDto } from './dto/purge-shopify-data.dto';
import { LocationLicensingService } from '../inventory/location-licensing.service';
import { ShopifyShopChangeService } from './shopify-shop-change.service';
import type {
  ShopifyShopChangePreview,
  ShopifyShopChangePurgeResult,
} from './shopify-shop-change.service';

@Controller('shopify')
@UseGuards(JwtAuthGuard, TenantPermissionsGuard, ChannelProfileGuard)
@RequireChannelProfile(TenantChannelProfile.shopify)
export class ShopifyController {
  constructor(
    private readonly shopifyConnection: ShopifyConnectionService,
    private readonly shopifyOAuth: ShopifyOAuthService,
    private readonly shopifyConfig: ShopifyConfigService,
    private readonly shopifyProductPull: ShopifyProductPullService,
    private readonly shopifyInventoryPull: ShopifyInventoryPullService,
    private readonly inventoryRepublish: ShopifyInventoryRepublishService,
    private readonly inventoryAlign: ShopifyInventoryAlignService,
    private readonly shopifyCustomersPull: ShopifyCustomersPullService,
    private readonly shopifyOrdersPull: ShopifyOrdersPullService,
    private readonly shopifyTaxonomy: ShopifyTaxonomyService,
    private readonly shopifyShopChange: ShopifyShopChangeService,
    private readonly shopifyWebhookStatus: ShopifyWebhookStatusService,
    private readonly shopifyWebhookRepair: ShopifyWebhookRepairService,
    private readonly locationLicensing: LocationLicensingService,
  ) {}

  @Get('connection')
  @UseGuards(RolesGuard)
  @Roles(UserRole.owner)
  getConnection(@CurrentTenant() tenantId: string): Promise<ShopifyConnectionDto> {
    return this.shopifyConnection.getForTenant(tenantId);
  }

  @Post('auth/begin')
  @UseGuards(RolesGuard)
  @Roles(UserRole.owner)
  beginAuth(
    @CurrentTenant() tenantId: string,
    @Body() dto: BeginShopifyAuthDto,
  ): Promise<{ authorizeUrl: string }> {
    return this.shopifyOAuth.beginAuth(tenantId, dto.shop);
  }

  @Public()
  @Get('auth/callback')
  async authCallback(
    @Query() query: Record<string, string | undefined>,
    @Res() response: Response,
  ): Promise<void> {
    try {
      const redirectUrl = await this.shopifyOAuth.handleCallback(query);
      response.redirect(redirectUrl);
    } catch {
      response.redirect(`${this.shopifyConfig.frontendUrl}/app/settings?shopify=error`);
    }
  }

  @Delete('connection')
  @UseGuards(RolesGuard)
  @Roles(UserRole.owner)
  async disconnect(@CurrentTenant() tenantId: string): Promise<{ disconnected: true }> {
    await this.shopifyOAuth.disconnect(tenantId);
    return { disconnected: true };
  }

  @Get('shop-change/preview')
  @UseGuards(RolesGuard)
  @Roles(UserRole.owner)
  previewShopChange(@CurrentTenant() tenantId: string): Promise<ShopifyShopChangePreview> {
    return this.shopifyShopChange.preview(tenantId);
  }

  @Post('shop-change/purge')
  @UseGuards(RolesGuard)
  @Roles(UserRole.owner)
  purgeShopifyData(
    @CurrentTenant() tenantId: string,
    @Body() dto: PurgeShopifyDataDto,
  ): Promise<ShopifyShopChangePurgeResult> {
    return this.shopifyShopChange.purge(tenantId, dto);
  }

  @Post('sync/locations')
  @UseGuards(RolesGuard)
  @Roles(UserRole.owner)
  async syncLocations(@CurrentTenant() tenantId: string) {
    const result = await this.shopifyOAuth.resyncLocations(tenantId);
    const autoLicensed = await this.locationLicensing.tryAutoLicenseSingleShopifyLocation(tenantId);
    return { synced: true as const, autoLicensed, ...result };
  }

  @Post('sync/webhooks')
  @UseGuards(RolesGuard)
  @Roles(UserRole.owner)
  async syncWebhooks(@CurrentTenant() tenantId: string) {
    const result = await this.shopifyOAuth.resyncWebhooks(tenantId);
    return { synced: true as const, ...result };
  }

  @Post('sync/webhooks/disable')
  @UseGuards(RolesGuard)
  @Roles(UserRole.owner)
  async disableWebhooks(@CurrentTenant() tenantId: string) {
    const result = await this.shopifyOAuth.disableWebhooks(tenantId);
    return { disabled: true as const, ...result };
  }

  /**
   * «Verifica ora»: chiede a Shopify quali sottoscrizioni esistono e lo registra.
   *
   * E' un POST e non un GET perche' lascia una traccia — la data dell'osservazione — e una
   * scrittura non deve stare dietro un verbo che qualsiasi cosa puo' ripetere da sola.
   * Verso Shopify pero' e' sola lettura, e a garantirlo non e' questa nota: il servizio che
   * la esegue non ha fra le mani niente che sappia registrare o cancellare.
   */
  @Post('webhooks/check')
  @UseGuards(RolesGuard)
  @Roles(UserRole.owner)
  checkWebhooks(@CurrentTenant() tenantId: string): Promise<ShopifyWebhookStatusResult> {
    return this.shopifyWebhookStatus.check(tenantId);
  }

  /**
   * Registra le notifiche mancanti e restituisce il referto della **rilettura**, non
   * l'esito della scrittura: la registrazione dice cosa crede di aver fatto, la verifica
   * dice cosa c'e', e quando divergono ha ragione la seconda.
   *
   * Usa la strada additiva — salta i presenti, aggiunge i mancanti, non cancella niente — e
   * non passa mai dall'interruttore, che spegnerebbe tutto per poi riaccendere.
   */
  @Post('webhooks/register-missing')
  @UseGuards(RolesGuard)
  @Roles(UserRole.owner)
  registerMissingWebhooks(@CurrentTenant() tenantId: string): Promise<ShopifyWebhookStatusResult> {
    return this.shopifyWebhookRepair.registerMissingAndRecheck(tenantId);
  }

  @Post('sync/products')
  @RequireAnyPermissions(SHOPIFY_CATALOG_SYNC_PERMISSIONS)
  async syncProducts(
    @CurrentTenant() tenantId: string,
  ): Promise<{ synced: true } & ShopifyCatalogSyncResult> {
    const result = await this.shopifyProductPull.pullCatalog(tenantId);
    return { synced: true, ...result };
  }

  @Post('sync/inventory')
  @RequireAnyPermissions(SHOPIFY_INVENTORY_SYNC_PERMISSIONS)
  async syncInventory(
    @CurrentTenant() tenantId: string,
  ): Promise<{ synced: true } & ShopifyInventoryPullResult> {
    const result = await this.shopifyInventoryPull.pullInventory(tenantId);
    return { synced: true, ...result };
  }

  /**
   * Il RECUPERO dei pendenti, **da solo**.
   *
   * ⛔ **Perché è separato dall'import.** Finora `retryPending` era agganciato in
   *    coda a `pullInventory`, che interroga Shopify **per ogni sede × lotti da
   *    50 articoli**: svuotare la coda costava un import completo, e qualunque
   *    innesco periodico lo avrebbe pagato a ogni giro.
   *
   * ⭐ **Non è un innesco automatico**: è lo stesso comando dell'operatore, con
   *    lo stesso permesso, che adesso può chiedere il solo recupero. Lo
   *    scheduler resta fuori — `docs/DA-FARE.md` §31.9.
   *
   * ⚠️ **Non legge le giacenze remote e non ne importa nessuna**: le guardie che
   *    contano sono quelle di scrittura, e restano dove sono — dentro il push,
   *    riga per riga (`not_connected`, `sync_disabled`,
   *    `missing_write_inventory_scope`). Passare di qui non ne salta nessuna.
   */
  @Post('sync/inventory/pending')
  @RequireAnyPermissions(SHOPIFY_INVENTORY_SYNC_PERMISSIONS)
  async retryPendingInventory(
    @CurrentTenant() tenantId: string,
  ): Promise<{ retried: true } & InventoryRepublishResult> {
    const result = await this.inventoryRepublish.retryPending(tenantId);
    return { retried: true, ...result };
  }

  /**
   * ALLINEA DISPONIBILITÀ — VestiFlow → Shopify, e mai il contrario.
   *
   * ⭐ **È il comando esplicito di §31.12**, e il suo primo uso è la partenza
   *    controllata: una coppia senza base la riceve qui, alla conferma di una
   *    nostra scrittura. ⛔ Nessun altro percorso la stabilisce — in
   *    particolare non il primo push ordinario.
   *
   * ⛔ **Tocca SOLO le quantità.** La preparazione del catalogo — import da
   *    Shopify o pubblicazione verso Shopify — è un'altra operazione, e le
   *    coppie non ancora collegate escono da qui come **escluse**.
   *
   * ⛔ **La direzione non si inverte, e non è una configurazione**: non esiste
   *    un parametro che faccia scrivere questo percorso in magazzino. Le
   *    giacenze sono di VestiFlow per contratto di ownership.
   *
   * ⚠️ **Non acquisisce ordini** (§31.-1): allineare prima che sia arrivato ciò
   *    che è in viaggio significa asserire un valore incompleto. È la sequenza
   *    che il piano prescrive all'operatore — acquisire, poi allineare — non un
   *    controllo che questo comando possa fare al posto suo.
   *
   * ⚠️ **Stesso permesso degli altri comandi di sincronizzazione inventario**:
   *    chi può pubblicare le giacenze può allinearle.
   */
  /**
   * ⭐ **Il corpo è facoltativo, e porta una cosa sola**: l'istante da cui
   *    questa OPERAZIONE è cominciata, ripreso dall'esito precedente.
   *
   * ⛔ **Senza, ogni pressione è un'operazione nuova** — giusto per la prima,
   *    sbagliato per la seconda: il conto di ciò che non si è ancora verificato
   *    ripartirebbe da tutto il perimetro, e non arriverebbe mai a zero.
   */
  @Post('sync/inventory/align')
  @RequireAnyPermissions(SHOPIFY_INVENTORY_SYNC_PERMISSIONS)
  async alignInventory(
    @CurrentTenant() tenantId: string,
    @Body() body?: { readonly operazioneIniziataAlle?: string },
  ): Promise<{ aligned: true } & EsitoAllineamento> {
    const result = await this.inventoryAlign.allinea(
      tenantId,
      istanteRipresa(body?.operazioneIniziataAlle),
    );
    return { aligned: true, ...result };
  }

  /**
   * Non è un export: scrive nell'anagrafica clienti. Con il solo «Esportare
   * dati» chi poteva scaricare un CSV riscriveva i clienti dal canale — nomi,
   * recapiti e indirizzi — senza avere «Gestire clienti».
   */
  @Post('sync/customers')
  @RequireAllPermissionGroups(SHOPIFY_CUSTOMERS_SYNC_GROUPS)
  async syncCustomers(
    @CurrentTenant() tenantId: string,
  ): Promise<{ synced: true } & ShopifyCustomersPullResult> {
    const result = await this.shopifyCustomersPull.pullCustomers(tenantId);
    return { synced: true, ...result };
  }

  /**
   * Nemmeno questo è un export: importa gli ordini del canale e libera gli
   * impegni di magazzino di quelli spariti da Shopify. Con il solo «Esportare
   * dati» quelle vendite entravano nel gestionale per mano di chi non ha il
   * permesso di consultarle.
   */
  @Post('sync/orders')
  @RequireAllPermissionGroups(SHOPIFY_ORDERS_SYNC_GROUPS)
  async syncOrders(
    @CurrentTenant() tenantId: string,
  ): Promise<{ synced: true } & ShopifyOrdersPullResult> {
    const result = await this.shopifyOrdersPull.pullOrders(tenantId);
    return { synced: true, ...result };
  }

  @Post('connection/clear-errors')
  @UseGuards(RolesGuard)
  @Roles(UserRole.owner)
  async clearErrors(@CurrentTenant() tenantId: string): Promise<ClearShopifyErrorsResult> {
    return this.shopifyConnection.clearErrors(tenantId);
  }

  @Get('taxonomy/categories')
  @RequireAnyPermissions(CATALOG_SECTION_PERMISSIONS)
  async listTaxonomyCategories(
    @CurrentTenant() tenantId: string,
    @Query() query: ListTaxonomyCategoriesQueryDto,
  ) {
    const items = await this.shopifyTaxonomy.listCategories(
      tenantId,
      query.search,
      query.childrenOf,
    );
    return { items };
  }

  @Get('taxonomy/category-attributes')
  @RequirePermissions(TenantPermission.CatalogManage)
  async listCategoryAttributes(
    @CurrentTenant() tenantId: string,
    @Query() query: ListCategoryAttributesQueryDto,
  ) {
    const items = await this.shopifyTaxonomy.getCategoryAttributes(tenantId, query.categoryId);
    return { items };
  }
}
