import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../common/tenant/tenant.decorator';
import type { Paginated } from '../common/dto/pagination.dto';
import { ListSalesOrdersQueryDto } from './dto/list-sales-orders.query.dto';
import {
  SalesOrdersService,
  type SalesOrderDetailRow,
  type SalesOrderListRow,
} from './sales-orders.service';

@Controller('sales-orders')
@UseGuards(JwtAuthGuard)
export class SalesOrdersController {
  constructor(private readonly salesOrders: SalesOrdersService) {}

  @Get()
  list(
    @CurrentTenant() tenantId: string,
    @Query() query: ListSalesOrdersQueryDto,
  ): Promise<Paginated<SalesOrderListRow>> {
    return this.salesOrders.list(tenantId, query);
  }

  @Get(':id')
  getById(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SalesOrderDetailRow> {
    return this.salesOrders.getById(tenantId, id);
  }
}
