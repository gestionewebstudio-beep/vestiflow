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

import { CurrentUser } from '../auth/current-user.decorator';
import type { UserProfileDto } from '../auth/dto/user-profile.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  SUPPLIER_ORDERS_MANAGE_PERMISSIONS,
  SUPPLIERS_LOOKUP_PERMISSIONS,
  TenantPermission,
} from '../auth/tenant-permission.constants';
import {
  RequireAllPermissionGroups,
  RequireAnyPermissions,
} from '../common/auth/tenant-permissions.decorator';
import { TenantPermissionsGuard } from '../common/auth/tenant-permissions.guard';
import { documentAttachmentUploadMulterOptions } from '../common/upload/multer-upload.options';
import { CurrentTenant } from '../common/tenant/tenant.decorator';
import type { Paginated } from '../common/dto/pagination.dto';
import type { SupplierView } from '../common/party/party-views';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { ListSuppliersQueryDto } from './dto/list-suppliers.query.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { UpsertSupplierVariantLinkDto } from './dto/upsert-supplier-variant-link.dto';
import { SupplierMediaService } from './supplier-media.service';
import { SuppliersService, type SupplierVariantLinkRow } from './suppliers.service';

@Controller('suppliers')
@UseGuards(JwtAuthGuard, TenantPermissionsGuard)
@RequireAllPermissionGroups([SUPPLIERS_LOOKUP_PERMISSIONS])
export class SuppliersController {
  constructor(
    private readonly suppliers: SuppliersService,
    private readonly supplierMedia: SupplierMediaService,
  ) {}

  /** Elenco completo (select inline ordini/arrivi merce). */
  @Get('all')
  @RequireAnyPermissions(SUPPLIERS_LOOKUP_PERMISSIONS)
  listAll(@CurrentTenant() tenantId: string): Promise<SupplierView[]> {
    return this.suppliers.listAll(tenantId);
  }

  @Get()
  @RequireAnyPermissions(SUPPLIERS_LOOKUP_PERMISSIONS)
  list(
    @CurrentTenant() tenantId: string,
    @Query() query: ListSuppliersQueryDto,
  ): Promise<Paginated<SupplierView>> {
    return this.suppliers.list(tenantId, query);
  }

  @Get('preview-code')
  @RequireAnyPermissions(SUPPLIERS_LOOKUP_PERMISSIONS)
  previewCode(@CurrentTenant() tenantId: string): Promise<{ readonly code: string }> {
    return this.suppliers.previewNextCode(tenantId);
  }

  @Get(':id')
  @RequireAnyPermissions(SUPPLIERS_LOOKUP_PERMISSIONS)
  getById(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SupplierView> {
    return this.suppliers.getById(tenantId, id);
  }

  @Get(':id/attachments')
  @RequireAnyPermissions(SUPPLIERS_LOOKUP_PERMISSIONS)
  listAttachments(@CurrentTenant() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.supplierMedia.listAttachments(tenantId, id);
  }

  @Post(':id/attachments')
  @RequireAnyPermissions(SUPPLIER_ORDERS_MANAGE_PERMISSIONS)
  @UseInterceptors(FileInterceptor('file', documentAttachmentUploadMulterOptions))
  uploadAttachment(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.supplierMedia.uploadAttachment(tenantId, id, file, user.displayName);
  }

  @Delete(':id/attachments/:attachmentId')
  @RequireAnyPermissions(SUPPLIER_ORDERS_MANAGE_PERMISSIONS)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAttachment(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
  ): Promise<void> {
    await this.supplierMedia.deleteAttachment(tenantId, id, attachmentId);
  }

  @Post()
  @RequireAnyPermissions(SUPPLIER_ORDERS_MANAGE_PERMISSIONS)
  create(@CurrentTenant() tenantId: string, @Body() dto: CreateSupplierDto): Promise<SupplierView> {
    return this.suppliers.create(tenantId, dto);
  }

  @Patch(':id')
  @RequireAnyPermissions(SUPPLIER_ORDERS_MANAGE_PERMISSIONS)
  update(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSupplierDto,
  ): Promise<SupplierView> {
    return this.suppliers.update(tenantId, id, dto);
  }

  @Delete(':id')
  @RequireAnyPermissions(SUPPLIER_ORDERS_MANAGE_PERMISSIONS)
  async delete(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ readonly ok: true }> {
    await this.suppliers.delete(tenantId, id);
    return { ok: true };
  }

  @Get(':id/variant-links')
  @RequireAnyPermissions(SUPPLIERS_LOOKUP_PERMISSIONS)
  listVariantLinks(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SupplierVariantLinkRow[]> {
    return this.suppliers.listVariantLinksBySupplier(tenantId, id, user);
  }

  @Post('variant-links')
  @RequireAnyPermissions(SUPPLIER_ORDERS_MANAGE_PERMISSIONS)
  upsertVariantLink(
    @CurrentTenant() tenantId: string,
    @Body() dto: UpsertSupplierVariantLinkDto,
  ): Promise<SupplierVariantLinkRow> {
    return this.suppliers.upsertVariantLink(tenantId, dto);
  }

  @Delete('variant-links/:linkId')
  @RequireAnyPermissions(SUPPLIER_ORDERS_MANAGE_PERMISSIONS)
  async deleteVariantLink(
    @CurrentTenant() tenantId: string,
    @Param('linkId', ParseUUIDPipe) linkId: string,
  ): Promise<{ readonly ok: true }> {
    await this.suppliers.deleteVariantLink(tenantId, linkId);
    return { ok: true };
  }
}
