import {
  Body,
  Controller,
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
import type { Customer } from '@prisma/client';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  CUSTOMERS_VIEW_PERMISSIONS,
  TenantPermission,
} from '../auth/tenant-permission.constants';
import {
  RequireAnyPermissions,
  RequirePermissions,
} from '../common/auth/tenant-permissions.decorator';
import { TenantPermissionsGuard } from '../common/auth/tenant-permissions.guard';
import { CurrentTenant } from '../common/tenant/tenant.decorator';
import type { Paginated } from '../common/dto/pagination.dto';
import { CustomersExportService } from './customers-export.service';
import { CustomersService } from './customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { ExportCustomersQueryDto } from './dto/export-customers.query.dto';
import { ListCustomersQueryDto } from './dto/list-customers.query.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

@Controller('customers')
@UseGuards(JwtAuthGuard, TenantPermissionsGuard)
export class CustomersController {
  constructor(
    private readonly customers: CustomersService,
    private readonly customersExport: CustomersExportService,
  ) {}

  @Get()
  @RequireAnyPermissions(CUSTOMERS_VIEW_PERMISSIONS)
  list(
    @CurrentTenant() tenantId: string,
    @Query() query: ListCustomersQueryDto,
  ): Promise<Paginated<Customer>> {
    return this.customers.list(tenantId, query);
  }

  @Get('export/csv')
  @RequirePermissions(TenantPermission.ReportsExport)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async exportCsv(
    @CurrentTenant() tenantId: string,
    @Query() query: ExportCustomersQueryDto,
  ): Promise<StreamableFile> {
    const csv = await this.customersExport.exportCsv(tenantId, query);
    const stamp = new Date().toISOString().slice(0, 10);
    return new StreamableFile(Buffer.from(csv, 'utf-8'), {
      type: 'text/csv; charset=utf-8',
      disposition: `attachment; filename="clienti-vestiflow-${stamp}.csv"`,
    });
  }

  @Get(':id')
  @RequireAnyPermissions(CUSTOMERS_VIEW_PERMISSIONS)
  getById(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Customer> {
    return this.customers.getById(tenantId, id);
  }

  @Post()
  @RequirePermissions(TenantPermission.CustomersManage)
  create(
    @CurrentTenant() tenantId: string,
    @Body() dto: CreateCustomerDto,
  ): Promise<Customer> {
    return this.customers.create(tenantId, dto);
  }

  @Patch(':id')
  @RequirePermissions(TenantPermission.CustomersManage)
  update(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCustomerDto,
  ): Promise<Customer> {
    return this.customers.update(tenantId, id, dto);
  }
}
