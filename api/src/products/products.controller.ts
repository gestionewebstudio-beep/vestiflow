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
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ADMIN_ROLES, MANAGER_ROLES, Roles } from '../common/auth/roles.decorator';
import { RolesGuard } from '../common/auth/roles.guard';
import { CurrentTenant } from '../common/tenant/tenant.decorator';
import type { Paginated } from '../common/dto/pagination.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { ListProductsQueryDto } from './dto/list-products.query.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductMediaService } from './product-media.service';
import { ProductsService, type ProductWithVariants } from './products.service';

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
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
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
}
