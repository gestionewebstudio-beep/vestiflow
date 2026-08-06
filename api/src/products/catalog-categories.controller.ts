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
import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  CATALOG_SECTION_PERMISSIONS,
  TenantPermission,
} from '../auth/tenant-permission.constants';
import {
  RequireAnyPermissions,
  RequirePermissions,
} from '../common/auth/tenant-permissions.decorator';
import { TenantPermissionsGuard } from '../common/auth/tenant-permissions.guard';
import { CurrentTenant } from '../common/tenant/tenant.decorator';
import { CatalogCategoriesService, type CatalogCategoryDto } from './catalog-categories.service';

class CreateCatalogCategoryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  /** null/assente = categoria principale; valorizzato = sottocategoria. */
  @IsOptional()
  @IsUUID()
  parentId?: string;
}

class RenameCatalogCategoryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;
}

@Controller('catalog-categories')
@UseGuards(JwtAuthGuard, TenantPermissionsGuard)
export class CatalogCategoriesController {
  constructor(private readonly categories: CatalogCategoriesService) {}

  @Get()
  @RequireAnyPermissions(CATALOG_SECTION_PERMISSIONS)
  list(@CurrentTenant() tenantId: string): Promise<readonly CatalogCategoryDto[]> {
    return this.categories.list(tenantId);
  }

  @Post()
  @RequirePermissions(TenantPermission.CatalogManage)
  create(
    @CurrentTenant() tenantId: string,
    @Body() dto: CreateCatalogCategoryDto,
  ): Promise<CatalogCategoryDto> {
    return this.categories.create(tenantId, dto.name, dto.parentId ?? null);
  }

  @Patch(':id')
  @RequirePermissions(TenantPermission.CatalogManage)
  rename(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RenameCatalogCategoryDto,
  ): Promise<CatalogCategoryDto> {
    return this.categories.rename(tenantId, id, dto.name);
  }

  @Delete(':id')
  @RequirePermissions(TenantPermission.CatalogManage)
  @HttpCode(HttpStatus.OK)
  async remove(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ readonly ok: true }> {
    await this.categories.delete(tenantId, id);
    return { ok: true };
  }
}
