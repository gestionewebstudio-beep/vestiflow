import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import type { Supplier } from '@prisma/client';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../common/tenant/tenant.decorator';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { SupplierOrdersService } from './supplier-orders.service';

@Controller('suppliers')
@UseGuards(JwtAuthGuard)
export class SuppliersController {
  constructor(private readonly supplierOrders: SupplierOrdersService) {}

  @Get()
  list(@CurrentTenant() tenantId: string): Promise<Supplier[]> {
    return this.supplierOrders.listSuppliers(tenantId);
  }

  @Post()
  create(@CurrentTenant() tenantId: string, @Body() dto: CreateSupplierDto): Promise<Supplier> {
    return this.supplierOrders.createSupplier(tenantId, dto);
  }
}
