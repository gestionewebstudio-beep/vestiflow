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
import type { Paginated } from '../common/dto/pagination.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { ListProductsQueryDto } from './dto/list-products.query.dto';
import { ListVariantSummariesQueryDto } from './dto/list-variant-summaries.query.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductMediaService } from './product-media.service';
import { ProductsExportService } from './products-export.service';
import { ProductsImportService } from './products-import.service';
import { ProductsService, type ProductWithVariants } from './products.service';
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
  ) {}

  @Get()
  @RequireAnyPermissions(CATALOG_SECTION_PERMISSIONS)
  list(
    @CurrentTenant() tenantId: string,
    @Query() query: ListProductsQueryDto,
  ): Promise<Paginated<ProductWithVariants>> {
    return this.products.list(tenantId, query);
  }

  @Get('facets')
  @RequireAnyPermissions(CATALOG_SECTION_PERMISSIONS)
  getFacets(@CurrentTenant() tenantId: string) {
    return this.products.getFacets(tenantId);
  }

  @Get('variants/summaries')
  @RequireAnyPermissions(CATALOG_SECTION_PERMISSIONS)
  listVariantSummaries(
    @CurrentTenant() tenantId: string,
    @Query() query: ListVariantSummariesQueryDto,
  ) {
    return this.products.listVariantSummaries(tenantId, query);
  }

  @Get('sku-availability')
  @RequireAnyPermissions(CATALOG_SECTION_PERMISSIONS)
  checkSku(
    @CurrentTenant() tenantId: string,
    @Query() query: SkuAvailabilityQueryDto,
  ): Promise<{ sku: string; available: boolean }> {
    return this.products.checkSkuAvailability(tenantId, query.sku, query.excludeProductId);
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
    sku: string;
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
    @UploadedFile() file: Express.Multer.File,
    @Body() body: ImportProductsBodyDto,
  ) {
    this.assertCsvFile(file);
    const handles = body.handles?.filter((handle) => handle.trim().length > 0);
    return this.productsImport.importCsv(tenantId, file.buffer.toString('utf-8'), {
      handles,
    });
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
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.suppliers.listVariantLinksByProduct(tenantId, id);
  }

  @Get(':id')
  @RequireAnyPermissions(CATALOG_SECTION_PERMISSIONS)
  getById(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ProductWithVariants> {
    return this.products.getById(tenantId, id);
  }

  @Post()
  @RequirePermissions(TenantPermission.CatalogManage)
  create(
    @CurrentTenant() tenantId: string,
    @Body() dto: CreateProductDto,
  ): Promise<ProductWithVariants> {
    return this.products.create(tenantId, dto);
  }

  @Patch(':id')
  @RequirePermissions(TenantPermission.CatalogManage)
  update(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
  ): Promise<ProductWithVariants> {
    return this.products.update(tenantId, id, dto);
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
