import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import type { Supplier } from '@prisma/client';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  SUPPLIER_ORDERS_VIEW_PERMISSIONS,
  TenantPermission,
} from '../auth/tenant-permission.constants';
import {
  RequireAnyPermissions,
  RequirePermissions,
} from '../common/auth/tenant-permissions.decorator';
import { TenantPermissionsGuard } from '../common/auth/tenant-permissions.guard';
import { CurrentTenant } from '../common/tenant/tenant.decorator';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { SupplierOrdersService } from './supplier-orders.service';

@Controller('suppliers')
@UseGuards(JwtAuthGuard, TenantPermissionsGuard)
export class SuppliersController {
  constructor(private readonly supplierOrders: SupplierOrdersService) {}

  @Get()
  @RequireAnyPermissions(SUPPLIER_ORDERS_VIEW_PERMISSIONS)
  list(@CurrentTenant() tenantId: string): Promise<Supplier[]> {
    return this.supplierOrders.listSuppliers(tenantId);
  }

  @Post()
  @RequirePermissions(TenantPermission.SupplierOrdersManage)
  create(@CurrentTenant() tenantId: string, @Body() dto: CreateSupplierDto): Promise<Supplier> {
    return this.supplierOrders.createSupplier(tenantId, dto);
  }
}
