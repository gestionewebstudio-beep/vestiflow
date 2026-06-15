import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../common/tenant/tenant.decorator';
import type { Paginated } from '../common/dto/pagination.dto';
import { CreateSupplierOrderDto } from './dto/create-supplier-order.dto';
import { ListSupplierOrdersQueryDto } from './dto/list-supplier-orders.query.dto';
import { ReceiveSupplierOrderDto } from './dto/receive-supplier-order.dto';
import { SupplierOrdersService, type SupplierOrderWithLines } from './supplier-orders.service';

@Controller('supplier-orders')
@UseGuards(JwtAuthGuard)
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
  create(
    @CurrentTenant() tenantId: string,
    @Body() dto: CreateSupplierOrderDto,
  ): Promise<SupplierOrderWithLines> {
    return this.supplierOrders.create(tenantId, dto);
  }

  @Post(':id/send')
  send(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SupplierOrderWithLines> {
    return this.supplierOrders.send(tenantId, id);
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
