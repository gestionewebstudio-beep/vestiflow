import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

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
import { SupplierOrdersService, type SupplierOrderWithLines } from './supplier-orders.service';

@Controller('supplier-orders')
@UseGuards(JwtAuthGuard, TenantPermissionsGuard)
export class SupplierOrdersController {
  constructor(private readonly supplierOrders: SupplierOrdersService) {}

  @Get()
  @RequireAnyPermissions(SUPPLIER_ORDERS_VIEW_PERMISSIONS)
  list(
    @CurrentTenant() tenantId: string,
    @Query() query: ListSupplierOrdersQueryDto,
  ): Promise<Paginated<SupplierOrderWithLines>> {
    return this.supplierOrders.list(tenantId, query);
  }

  @Get(':id')
  @RequireAnyPermissions(SUPPLIER_ORDERS_VIEW_PERMISSIONS)
  getById(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SupplierOrderWithLines> {
    return this.supplierOrders.getById(tenantId, id);
  }

  @Post()
  @RequirePermissions(TenantPermission.SupplierOrdersManage)
  create(
    @CurrentTenant() tenantId: string,
    @Body() dto: CreateSupplierOrderDto,
  ): Promise<SupplierOrderWithLines> {
    return this.supplierOrders.create(tenantId, dto);
  }

  @Post(':id/send')
  @RequirePermissions(TenantPermission.SupplierOrdersManage)
  send(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SupplierOrderWithLines> {
    return this.supplierOrders.send(tenantId, id);
  }

  @Patch(':id')
  @RequirePermissions(TenantPermission.SupplierOrdersManage)
  update(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSupplierOrderDto,
  ): Promise<SupplierOrderWithLines> {
    return this.supplierOrders.update(tenantId, id, dto);
  }

  @Post(':id/cancel')
  @RequirePermissions(TenantPermission.SupplierOrdersManage)
  cancel(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SupplierOrderWithLines> {
    return this.supplierOrders.cancel(tenantId, id);
  }

  @Delete(':id')
  @RequirePermissions(TenantPermission.SupplierOrdersManage)
  delete(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.supplierOrders.delete(tenantId, id);
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
