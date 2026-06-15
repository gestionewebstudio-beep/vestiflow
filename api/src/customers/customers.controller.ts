import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import type { Customer } from '@prisma/client';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../common/tenant/tenant.decorator';
import type { Paginated } from '../common/dto/pagination.dto';
import { CustomersService } from './customers.service';
import { ListCustomersQueryDto } from './dto/list-customers.query.dto';

@Controller('customers')
@UseGuards(JwtAuthGuard)
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  list(
    @CurrentTenant() tenantId: string,
    @Query() query: ListCustomersQueryDto,
  ): Promise<Paginated<Customer>> {
    return this.customers.list(tenantId, query);
  }

  @Get(':id')
  getById(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Customer> {
    return this.customers.getById(tenantId, id);
  }
}
