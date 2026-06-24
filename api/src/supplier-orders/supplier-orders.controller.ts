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
import { MANAGER_ROLES, Roles } from '../common/auth/roles.decorator';
import { RolesGuard } from '../common/auth/roles.guard';
import { CurrentTenant } from '../common/tenant/tenant.decorator';
import type { Paginated } from '../common/dto/pagination.dto';
import { CreateSupplierOrderDto } from './dto/create-supplier-order.dto';
import { ListSupplierOrdersQueryDto } from './dto/list-supplier-orders.query.dto';
import { ReceiveSupplierOrderDto } from './dto/receive-supplier-order.dto';
import { UpdateSupplierOrderDto } from './dto/update-supplier-order.dto';
import { SupplierOrdersService, type SupplierOrderWithLines } from './supplier-orders.service';

@Controller('supplier-orders')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SupplierOrdersController {
  constructor(private readonly supplierOrders: SupplierOrdersService) {}

  @Get()
  list(
    @CurrentTenant() tenantId: string,
    @Query() query: ListSupplierOrdersQueryDto,
  ): Promise<Paginated<SupplierOrderWithLines>> {
    return this.supplierOrders.list(tenantId, query);
  }

  @Get(':id')
  getById(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SupplierOrderWithLines> {
    return this.supplierOrders.getById(tenantId, id);
  }

  @Post()
  @Roles(...MANAGER_ROLES)
  create(
    @CurrentTenant() tenantId: string,
    @Body() dto: CreateSupplierOrderDto,
  ): Promise<SupplierOrderWithLines> {
    return this.supplierOrders.create(tenantId, dto);
  }

  @Post(':id/send')
  @Roles(...MANAGER_ROLES)
  send(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SupplierOrderWithLines> {
    return this.supplierOrders.send(tenantId, id);
  }

  @Patch(':id')
  @Roles(...MANAGER_ROLES)
  update(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSupplierOrderDto,
  ): Promise<SupplierOrderWithLines> {
    return this.supplierOrders.update(tenantId, id, dto);
  }

  @Post(':id/cancel')
  @Roles(...MANAGER_ROLES)
  cancel(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SupplierOrderWithLines> {
    return this.supplierOrders.cancel(tenantId, id);
  }

  @Delete(':id')
  @Roles(...MANAGER_ROLES)
  delete(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.supplierOrders.delete(tenantId, id);
  }

  @Post(':id/receive')
  receive(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReceiveSupplierOrderDto,
  ): Promise<SupplierOrderWithLines> {
    return this.supplierOrders.receive(tenantId, id, dto);
  }
}
