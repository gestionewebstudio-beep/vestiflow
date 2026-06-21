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
import { ADMIN_ROLES, MANAGER_ROLES, Roles } from '../common/auth/roles.decorator';
import { RolesGuard } from '../common/auth/roles.guard';
import { CurrentTenant } from '../common/tenant/tenant.decorator';
import type { Paginated } from '../common/dto/pagination.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { ListProductsQueryDto } from './dto/list-products.query.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductMediaService } from './product-media.service';
import { ProductsExportService } from './products-export.service';
import { ProductsImportService } from './products-import.service';
import { ProductsService, type ProductWithVariants } from './products.service';
import { ExportProductsQueryDto } from './dto/export-products.query.dto';
import { ImportProductsBodyDto } from './dto/import-products-body.dto';

class SkuAvailabilityQueryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  sku!: string;

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
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProductsController {
  constructor(
    private readonly products: ProductsService,
    private readonly productMedia: ProductMediaService,
    private readonly productsImport: ProductsImportService,
    private readonly productsExport: ProductsExportService,
  ) {}

  @Get()
  list(
    @CurrentTenant() tenantId: string,
    @Query() query: ListProductsQueryDto,
  ): Promise<Paginated<ProductWithVariants>> {
    return this.products.list(tenantId, query);
  }

  // Prima di ':id' per non essere catturata dalla route parametrica.
  @Get('sku-availability')
  checkSku(
    @CurrentTenant() tenantId: string,
    @Query() query: SkuAvailabilityQueryDto,
  ): Promise<{ sku: string; available: boolean }> {
    return this.products.checkSkuAvailability(tenantId, query.sku, query.excludeProductId);
  }

  @Get('variants/by-code')
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
  @Roles(...MANAGER_ROLES)
  @UseInterceptors(FileInterceptor('file', csvUploadMulterOptions))
  previewImport(@CurrentTenant() tenantId: string, @UploadedFile() file: Express.Multer.File) {
    this.assertCsvFile(file);
    return this.productsImport.previewCsv(tenantId, file.buffer.toString('utf-8'));
  }

  @Post('import')
  @Roles(...MANAGER_ROLES)
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
  @Roles(...MANAGER_ROLES)
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

  @Get(':id')
  getById(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ProductWithVariants> {
    return this.products.getById(tenantId, id);
  }

  @Post()
  @Roles(...MANAGER_ROLES)
  create(
    @CurrentTenant() tenantId: string,
    @Body() dto: CreateProductDto,
  ): Promise<ProductWithVariants> {
    return this.products.create(tenantId, dto);
  }

  @Patch(':id')
  @Roles(...MANAGER_ROLES)
  update(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
  ): Promise<ProductWithVariants> {
    return this.products.update(tenantId, id, dto);
  }

  @Post(':id/sync-shopify')
  @Roles(...MANAGER_ROLES)
  syncToShopify(@CurrentTenant() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.products.syncToShopify(tenantId, id);
  }

  @Post(':id/images')
  @Roles(...MANAGER_ROLES)
  @UseInterceptors(FileInterceptor('file', productImageUploadMulterOptions))
  uploadImage(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.productMedia.uploadImage(tenantId, id, file);
  }

  @Delete(':id/images/:imageId')
  @Roles(...MANAGER_ROLES)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteImage(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('imageId', ParseUUIDPipe) imageId: string,
  ): Promise<void> {
    await this.productMedia.deleteImage(tenantId, id, imageId);
  }

  @Delete(':id')
  @Roles(...ADMIN_ROLES)
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
