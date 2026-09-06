import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

import {
  csvUploadMulterOptions,
  productImageUploadMulterOptions,
} from '../common/upload/multer-upload.options';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  CATALOG_SECTION_PERMISSIONS,
  SHOPIFY_CATALOG_SYNC_PERMISSIONS,
  TenantPermission,
} from '../auth/tenant-permission.constants';
import {
  RequireAnyPermissions,
  RequirePermissions,
} from '../common/auth/tenant-permissions.decorator';
import { TenantPermissionsGuard } from '../common/auth/tenant-permissions.guard';
import { CurrentTenant } from '../common/tenant/tenant.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { UserProfileDto } from '../auth/dto/user-profile.dto';
import type { Paginated } from '../common/dto/pagination.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { GenerateSkuDto } from './dto/generate-sku.dto';
import { ListProductsQueryDto } from './dto/list-products.query.dto';
import { ListVariantSummariesQueryDto } from './dto/list-variant-summaries.query.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductMediaService } from './product-media.service';
import { DocumentPriceModePreferenceService } from '../documents/document-price-mode-preference.service';
import { ProductsExportService } from './products-export.service';
import { ProductsImportService } from './products-import.service';
import { normalizeDecimals } from '../common/interceptors/decimal-serialization.interceptor';
import { ProductsService, type ProductWithVariants } from './products.service';

import type { Serialized } from '../common/serialized.type';
import { SkuGeneratorService } from './sku-generator.service';
import { ExportProductsQueryDto } from './dto/export-products.query.dto';
import { ImportProductsBodyDto } from './dto/import-products-body.dto';
import { SuppliersService } from '../supplier-orders/suppliers.service';

class SkuAvailabilityQueryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  sku!: string;

  @IsOptional()
  @IsUUID()
  excludeProductId?: string;
}

class BarcodeAvailabilityQueryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  barcode!: string;

  @IsOptional()
  @IsUUID()
  excludeProductId?: string;
}

class ArticleCodeAvailabilityQueryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  articleCode!: string;

  @IsOptional()
  @IsUUID()
  excludeProductId?: string;
}

class VariantByCodeQueryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  code!: string;
}

@Controller('products')
@UseGuards(JwtAuthGuard, TenantPermissionsGuard)
export class ProductsController {
  constructor(
    private readonly products: ProductsService,
    private readonly productMedia: ProductMediaService,
    private readonly productsImport: ProductsImportService,
    private readonly productsExport: ProductsExportService,
    private readonly suppliers: SuppliersService,
    private readonly skuGenerator: SkuGeneratorService,
    private readonly priceModePreference: DocumentPriceModePreferenceService,
  ) {}

  // L'utente serve al service per il costo d'acquisto (dato sensibile
  // §permessi): senza permesso il campo non entra nella risposta.
  @Get()
  @RequireAnyPermissions(CATALOG_SECTION_PERMISSIONS)
  async list(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Query() query: ListProductsQueryDto,
  ): Promise<Serialized<Paginated<ProductWithVariants>>> {
    return normalizeDecimals(await this.products.list(tenantId, query, user));
  }

  @Get('facets')
  @RequireAnyPermissions(CATALOG_SECTION_PERMISSIONS)
  getFacets(@CurrentTenant() tenantId: string) {
    return this.products.getFacets(tenantId);
  }

  // L'utente serve al service per decidere se includere il costo d'acquisto
  // nella risposta (dato sensibile §permessi): il filtro è server-side, non
  // una semplice omissione nella UI.
  @Get('variants/summaries')
  @RequireAnyPermissions(CATALOG_SECTION_PERMISSIONS)
  listVariantSummaries(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Query() query: ListVariantSummariesQueryDto,
  ) {
    return this.products.listVariantSummaries(tenantId, query, user);
  }

  @Get('sku-availability')
  @RequireAnyPermissions(CATALOG_SECTION_PERMISSIONS)
  checkSku(
    @CurrentTenant() tenantId: string,
    @Query() query: SkuAvailabilityQueryDto,
  ): Promise<{ sku: string; available: boolean }> {
    return this.products.checkSkuAvailability(tenantId, query.sku, query.excludeProductId);
  }

  /**
   * Anteprima "Genera SKU" (specifica cliente §SKU): calcola un codice
   * prevedibile (categoria + nome/modello + attributi variante presenti +
   * progressivo) e ne risolve gia' l'unicita' nel tenant. NON salva nulla:
   * l'utente puo' ancora modificare il codice proposto prima del submit, e
   * l'unicita' viene riverificata al salvataggio (vincolo DB + controllo
   * applicativo in ProductsService).
   */
  @Post('sku/generate')
  @RequireAnyPermissions(CATALOG_SECTION_PERMISSIONS)
  generateSku(
    @CurrentTenant() tenantId: string,
    @Body() dto: GenerateSkuDto,
  ): Promise<{ sku: string }> {
    return this.skuGenerator
      .previewSku(tenantId, {
        productName: dto.productName,
        category: dto.category,
        modelCode: dto.modelCode,
        optionValues: dto.optionValues,
      })
      .then((sku) => ({ sku }));
  }

  /**
   * Disponibilità codice articolo per la validazione live del form
   * anagrafica (§Codice articolo: univoco per tenant, case-insensitive).
   * `takenBy` = nome dell'articolo che occupa il codice, per il messaggio
   * "Codice articolo già utilizzato da [nome articolo]."
   */
  @Get('article-code-availability')
  @RequireAnyPermissions(CATALOG_SECTION_PERMISSIONS)
  checkArticleCode(
    @CurrentTenant() tenantId: string,
    @Query() query: ArticleCodeAvailabilityQueryDto,
  ): Promise<{ articleCode: string; available: boolean; takenBy: string | null }> {
    return this.products.checkArticleCodeAvailability(
      tenantId,
      query.articleCode,
      query.excludeProductId,
    );
  }

  @Get('barcode-availability')
  @RequireAnyPermissions(CATALOG_SECTION_PERMISSIONS)
  checkBarcode(
    @CurrentTenant() tenantId: string,
    @Query() query: BarcodeAvailabilityQueryDto,
  ): Promise<{ barcode: string; available: boolean }> {
    return this.products.checkBarcodeAvailability(
      tenantId,
      query.barcode,
      query.excludeProductId,
    );
  }

  @Get('variants/by-code')
  @RequireAnyPermissions(CATALOG_SECTION_PERMISSIONS)
  findVariantByCode(
    @CurrentTenant() tenantId: string,
    @Query() query: VariantByCodeQueryDto,
  ): Promise<{
    variantId: string;
    productId: string;
    sku: string | null;
    barcode: string | null;
    productName: string;
  }> {
    return this.products.findVariantByCode(tenantId, query.code);
  }

  @Post('import/preview')
  @RequirePermissions(TenantPermission.CatalogImportExport)
  @UseInterceptors(FileInterceptor('file', csvUploadMulterOptions))
  previewImport(@CurrentTenant() tenantId: string, @UploadedFile() file: Express.Multer.File) {
    this.assertCsvFile(file);
    return this.productsImport.previewCsv(tenantId, file.buffer.toString('utf-8'));
  }

  @Post('import')
  @RequirePermissions(TenantPermission.CatalogImportExport)
  @UseInterceptors(FileInterceptor('file', csvUploadMulterOptions))
  importProducts(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: ImportProductsBodyDto,
  ) {
    this.assertCsvFile(file);
    const handles = body.handles?.filter((handle) => handle.trim().length > 0);
    return this.productsImport.importCsv(
      tenantId,
      file.buffer.toString('utf-8'),
      { handles },
      user,
    );
  }

  @Get('export/csv')
  @RequirePermissions(TenantPermission.CatalogImportExport)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async exportCsv(
    @CurrentTenant() tenantId: string,
    @Query() query: ExportProductsQueryDto,
  ): Promise<StreamableFile> {
    const csv = await this.productsExport.exportCsv(tenantId, query);
    const stamp = new Date().toISOString().slice(0, 10);
    return new StreamableFile(Buffer.from(csv, 'utf-8'), {
      type: 'text/csv; charset=utf-8',
      disposition: `attachment; filename="prodotti-vestiflow-${stamp}.csv"`,
    });
  }

  @Get(':id/supplier-links')
  @RequireAnyPermissions(CATALOG_SECTION_PERMISSIONS)
  listSupplierLinks(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.suppliers.listVariantLinksByProduct(tenantId, id, user);
  }

  /**
   * Modalità prezzo (netto/ivato) della sezione Listini: la **convenzione
   * aziendale** sui prezzi di vendita.
   *
   * ⚠️ Dal 16/08/2026 non è più una preferenza dell'operatore. L'anagrafica
   * non è un documento: è una vista del catalogo, e sta dalla stessa parte di
   * report, movimenti e liste — dove serve un riferimento comune, o due
   * colleghi guardano lo stesso listino e ne leggono due. La memoria
   * personale resta solo dove si CREA qualcosa: i documenti di vendita.
   *
   * Rotta statica: DEVE precedere `@Get(':id')`, altrimenti `:id` la cattura.
   */
  @Get('price-mode-preference')
  @RequirePermissions(TenantPermission.CatalogManage)
  async getPriceModePreference(
    @CurrentTenant() tenantId: string,
  ): Promise<{ pricesIncludeVat: boolean }> {
    const pricesIncludeVat = await this.priceModePreference.salesPricesIncludeVat(tenantId);
    return { pricesIncludeVat };
  }

  @Get(':id')
  @RequireAnyPermissions(CATALOG_SECTION_PERMISSIONS)
  async getById(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Serialized<ProductWithVariants>> {
    return normalizeDecimals(await this.products.getById(tenantId, id, user));
  }

  @Post()
  @RequirePermissions(TenantPermission.CatalogManage)
  async create(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Body() dto: CreateProductDto,
  ): Promise<Serialized<ProductWithVariants>> {
    const product = normalizeDecimals(await this.products.create(tenantId, dto, user));
    // ⚠️ Qui la modalità Listini veniva ricordata come preferenza personale.
    // Rimosso il 16/08/2026: l'anagrafica segue la convenzione aziendale.
    return product;
  }

  @Patch(':id')
  @RequirePermissions(TenantPermission.CatalogManage)
  async update(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
  ): Promise<Serialized<ProductWithVariants>> {
    return normalizeDecimals(await this.products.update(tenantId, id, dto, user));
  }

  /** Duplica anagrafica prodotto (audit cliente): nuovo id, SKU/barcode univoci. */
  @Post(':id/duplicate')
  @RequirePermissions(TenantPermission.CatalogManage)
  async duplicate(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Serialized<ProductWithVariants>> {
    return normalizeDecimals(await this.products.duplicateProduct(tenantId, id, user));
  }

  @Post(':id/sync-shopify')
  @RequireAnyPermissions(SHOPIFY_CATALOG_SYNC_PERMISSIONS)
  syncToShopify(@CurrentTenant() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.products.syncToShopify(tenantId, id);
  }

  @Post(':id/images')
  @RequirePermissions(TenantPermission.CatalogManage)
  @UseInterceptors(FileInterceptor('file', productImageUploadMulterOptions))
  uploadImage(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.productMedia.uploadImage(tenantId, id, file);
  }

  @Delete(':id/images/:imageId')
  @RequirePermissions(TenantPermission.CatalogManage)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteImage(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('imageId', ParseUUIDPipe) imageId: string,
  ): Promise<void> {
    await this.productMedia.deleteImage(tenantId, id, imageId);
  }

  @Delete(':id')
  @RequirePermissions(TenantPermission.CatalogDelete)
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.products.delete(tenantId, id);
  }

  private assertCsvFile(file: Express.Multer.File | undefined): void {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Carica un file CSV valido.');
    }
    const name = file.originalname?.toLowerCase() ?? '';
    if (!name.endsWith('.csv') && file.mimetype !== 'text/csv') {
      throw new BadRequestException('Il file deve essere in formato CSV.');
    }
  }
}
