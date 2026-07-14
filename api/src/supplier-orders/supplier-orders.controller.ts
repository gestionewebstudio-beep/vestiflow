import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';

import { CurrentUser } from '../auth/current-user.decorator';
import type { UserProfileDto } from '../auth/dto/user-profile.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  SUPPLIER_ORDERS_RECEIVE_PERMISSIONS,
  SUPPLIER_ORDERS_VIEW_PERMISSIONS,
  TenantPermission,
} from '../auth/tenant-permission.constants';
import {
  RequireAnyPermissions,
  RequirePermissions,
} from '../common/auth/tenant-permissions.decorator';
import { TenantPermissionsGuard } from '../common/auth/tenant-permissions.guard';
import { CurrentTenant } from '../common/tenant/tenant.decorator';
import type { Paginated } from '../common/dto/pagination.dto';
import { CreateSupplierOrderDto } from './dto/create-supplier-order.dto';
import { ListSupplierOrdersQueryDto } from './dto/list-supplier-orders.query.dto';
import { ReceiveSupplierOrderDto } from './dto/receive-supplier-order.dto';
import { UpdateSupplierOrderDto } from './dto/update-supplier-order.dto';
import { SupplierOrderPdfService } from './supplier-order-pdf.service';
import { SupplierOrdersService, type SupplierOrderWithLines } from './supplier-orders.service';

@Controller('supplier-orders')
@UseGuards(JwtAuthGuard, TenantPermissionsGuard)
export class SupplierOrdersController {
  constructor(
    private readonly supplierOrders: SupplierOrdersService,
    private readonly supplierOrderPdf: SupplierOrderPdfService,
  ) {}

  @Get()
  @RequireAnyPermissions(SUPPLIER_ORDERS_VIEW_PERMISSIONS)
  list(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Query() query: ListSupplierOrdersQueryDto,
  ): Promise<Paginated<SupplierOrderWithLines>> {
    return this.supplierOrders.list(tenantId, query, user);
  }

  /**
   * Export PDF dell'ordine. Il recupero passa da getById(tenantId, id, user)
   * così lo scope location dell'utente resta applicato anche alla stampa.
   */
  @Get(':id/export/pdf')
  @RequireAnyPermissions(SUPPLIER_ORDERS_VIEW_PERMISSIONS)
  @Header('Content-Type', 'application/pdf')
  async exportPdf(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StreamableFile> {
    const order = await this.supplierOrders.getById(tenantId, id, user);
    const { buffer, filename } = await this.supplierOrderPdf.exportPdf(tenantId, order);
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: `attachment; filename="${filename}"`,
    });
  }

  @Get(':id')
  @RequireAnyPermissions(SUPPLIER_ORDERS_VIEW_PERMISSIONS)
  getById(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SupplierOrderWithLines> {
    return this.supplierOrders.getById(tenantId, id, user);
  }

  @Post()
  @RequirePermissions(TenantPermission.SupplierOrdersManage)
  create(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Body() dto: CreateSupplierOrderDto,
  ): Promise<SupplierOrderWithLines> {
    return this.supplierOrders.create(tenantId, dto, user);
  }

  @Post(':id/send')
  @RequirePermissions(TenantPermission.SupplierOrdersManage)
  send(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SupplierOrderWithLines> {
    return this.supplierOrders.send(tenantId, id, user);
  }

  @Patch(':id')
  @RequirePermissions(TenantPermission.SupplierOrdersManage)
  update(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSupplierOrderDto,
  ): Promise<SupplierOrderWithLines> {
    return this.supplierOrders.update(tenantId, id, dto, user);
  }

  @Post(':id/cancel')
  @RequirePermissions(TenantPermission.SupplierOrdersManage)
  cancel(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SupplierOrderWithLines> {
    return this.supplierOrders.cancel(tenantId, id, user);
  }

  @Delete(':id')
  @RequirePermissions(TenantPermission.SupplierOrdersManage)
  delete(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.supplierOrders.delete(tenantId, id, user);
  }

  @Post(':id/receive')
  @RequireAnyPermissions(SUPPLIER_ORDERS_RECEIVE_PERMISSIONS)
  receive(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReceiveSupplierOrderDto,
  ): Promise<SupplierOrderWithLines> {
    return this.supplierOrders.receive(tenantId, id, dto);
  }
}
