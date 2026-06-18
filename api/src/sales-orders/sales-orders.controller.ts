import {
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MANAGER_ROLES, Roles } from '../common/auth/roles.decorator';
import { RolesGuard } from '../common/auth/roles.guard';
import { CurrentTenant } from '../common/tenant/tenant.decorator';
import type { Paginated } from '../common/dto/pagination.dto';
import { ExportSalesOrdersQueryDto } from './dto/export-sales-orders.query.dto';
import { ListSalesOrdersQueryDto } from './dto/list-sales-orders.query.dto';
import { SalesOrdersExportService } from './sales-orders-export.service';
import {
  SalesOrdersService,
  type SalesOrderDetailRow,
  type SalesOrderListRow,
} from './sales-orders.service';

@Controller('sales-orders')
@UseGuards(JwtAuthGuard)
export class SalesOrdersController {
  constructor(
    private readonly salesOrders: SalesOrdersService,
    private readonly salesOrdersExport: SalesOrdersExportService,
  ) {}

  @Get()
  list(
    @CurrentTenant() tenantId: string,
    @Query() query: ListSalesOrdersQueryDto,
  ): Promise<Paginated<SalesOrderListRow>> {
    return this.salesOrders.list(tenantId, query);
  }

  @Get('export/csv')
  @UseGuards(RolesGuard)
  @Roles(...MANAGER_ROLES)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async exportCsv(
    @CurrentTenant() tenantId: string,
    @Query() query: ExportSalesOrdersQueryDto,
  ): Promise<StreamableFile> {
    const csv = await this.salesOrdersExport.exportCsv(tenantId, query);
    const stamp = new Date().toISOString().slice(0, 10);
    return new StreamableFile(Buffer.from(csv, 'utf-8'), {
      type: 'text/csv; charset=utf-8',
      disposition: `attachment; filename="vendite-vestiflow-${stamp}.csv"`,
    });
  }

  @Get(':id')
  getById(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SalesOrderDetailRow> {
    return this.salesOrders.getById(tenantId, id);
  }
}
