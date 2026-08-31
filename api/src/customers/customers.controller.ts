import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  CUSTOMERS_VIEW_PERMISSIONS,
  TenantPermission,
} from '../auth/tenant-permission.constants';
import {
  RequireAllPermissionGroups,
  RequireAnyPermissions,
  RequirePermissions,
} from '../common/auth/tenant-permissions.decorator';
import { TenantPermissionsGuard } from '../common/auth/tenant-permissions.guard';
import { CurrentTenant } from '../common/tenant/tenant.decorator';
import type { Paginated } from '../common/dto/pagination.dto';
import type { CustomerView } from '../common/party/party-views';
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

  /** Elenco completo (select inline Ordine cliente), speculare a suppliers/all. */
  @Get('all')
  @RequireAnyPermissions(CUSTOMERS_VIEW_PERMISSIONS)
  listAll(@CurrentTenant() tenantId: string): Promise<CustomerView[]> {
    return this.customers.listAll(tenantId);
  }

  @Get()
  @RequireAnyPermissions(CUSTOMERS_VIEW_PERMISSIONS)
  list(
    @CurrentTenant() tenantId: string,
    @Query() query: ListCustomersQueryDto,
  ): Promise<Paginated<CustomerView>> {
    return this.customers.list(tenantId, query);
  }

  @Get('export/csv')
  @RequireAllPermissionGroups([CUSTOMERS_VIEW_PERMISSIONS, [TenantPermission.ReportsExport]])
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

  @Get('preview-code')
  @RequireAnyPermissions(CUSTOMERS_VIEW_PERMISSIONS)
  previewNextCode(@CurrentTenant() tenantId: string): Promise<{ readonly code: string }> {
    return this.customers.previewNextCode(tenantId);
  }

  @Get(':id')
  @RequireAnyPermissions(CUSTOMERS_VIEW_PERMISSIONS)
  getById(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CustomerView> {
    return this.customers.getById(tenantId, id);
  }

  @Post()
  @RequirePermissions(TenantPermission.CustomersManage)
  create(
    @CurrentTenant() tenantId: string,
    @Body() dto: CreateCustomerDto,
  ): Promise<CustomerView> {
    return this.customers.create(tenantId, dto);
  }

  /**
   * ⭐ **Elimina la scheda cliente.** Lo storico resta: vedi `remove` nel servizio.
   *
   * ⚠️ **Stesso permesso della modifica**: chi può cambiare un'anagrafica può
   * toglierla. Un permesso a sé per l'eliminazione sarebbe una terza autorità su
   * un'entità che ne ha già una.
   */
  /**
   * ⭐ **Duplica**: una scheda nuova col prossimo codice, che si apre per
   * rifinirla. Partita IVA e codice fiscale non si copiano — vedi il servizio.
   */
  @Post(':id/duplicate')
  duplicate(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
  ): Promise<{ readonly id: string }> {
    return this.customers.duplicate(tenantId, id);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentTenant() tenantId: string, @Param('id') id: string): Promise<void> {
    return this.customers.remove(tenantId, id);
  }

  @Patch(':id')
  @RequirePermissions(TenantPermission.CustomersManage)
  update(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCustomerDto,
  ): Promise<CustomerView> {
    return this.customers.update(tenantId, id, dto);
  }
}
