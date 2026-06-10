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
  UseGuards,
} from '@nestjs/common';
import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

import { CurrentTenant } from '../common/tenant/tenant.decorator';
import { TenantGuard } from '../common/tenant/tenant.guard';
import type { Paginated } from '../common/dto/pagination.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { ListProductsQueryDto } from './dto/list-products.query.dto';
import { UpdateProductDto } from './dto/update-product.dto';
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

@Controller('products')
@UseGuards(TenantGuard)
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

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

  @Get(':id')
  getById(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ProductWithVariants> {
    return this.products.getById(tenantId, id);
  }

  @Post()
  create(
    @CurrentTenant() tenantId: string,
    @Body() dto: CreateProductDto,
  ): Promise<ProductWithVariants> {
    return this.products.create(tenantId, dto);
  }

  @Patch(':id')
  update(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
  ): Promise<ProductWithVariants> {
    return this.products.update(tenantId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.products.delete(tenantId, id);
  }
}
