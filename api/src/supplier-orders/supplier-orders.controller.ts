import {
  Body,
  Controller,
  Delete,
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

import { CurrentUser } from '../auth/current-user.decorator';
import type { UserProfileDto } from '../auth/dto/user-profile.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  SUPPLIER_ORDERS_MANAGE_PERMISSIONS,
  SUPPLIER_ORDERS_VIEW_PERMISSIONS,
  TenantPermission,
} from '../auth/tenant-permission.constants';
import {
  RequireAllPermissionGroups,
  RequireAnyPermissions,
} from '../common/auth/tenant-permissions.decorator';
import { TenantPermissionsGuard } from '../common/auth/tenant-permissions.guard';
import { CurrentTenant } from '../common/tenant/tenant.decorator';
import {
  SPREADSHEET_ML_EXTENSION,
  SPREADSHEET_ML_MIME,
  serializeExcel2003Xml,
} from '../common/spreadsheet.util';
import type { Paginated } from '../common/dto/pagination.dto';
import { CreateSupplierOrderDto } from './dto/create-supplier-order.dto';
import { ExportSupplierOrdersQueryDto } from './dto/export-supplier-orders.query.dto';
import { ListSupplierOrdersQueryDto } from './dto/list-supplier-orders.query.dto';
import { UpdateSupplierOrderDto } from './dto/update-supplier-order.dto';
import {
  SUPPLIER_ORDER_EXPORT_HEADERS,
  buildSupplierOrderExportRows,
} from './supplier-order-export.util';
import { SupplierOrderPdfService } from './supplier-order-pdf.service';
import { SupplierOrdersService, type SupplierOrderWithLines } from './supplier-orders.service';

@Controller('supplier-orders')
@UseGuards(JwtAuthGuard, TenantPermissionsGuard)
@RequireAllPermissionGroups([[TenantPermission.SectionSuppliers]])
export class SupplierOrdersController {
  constructor(
    private readonly supplierOrders: SupplierOrdersService,
    private readonly supplierOrderPdf: SupplierOrderPdfService,
  ) {}

  @Get()
  @RequireAnyPermissions(SUPPLIER_ORDERS_VIEW_PERMISSIONS)
  list(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Query() query: ListSupplierOrdersQueryDto,
  ): Promise<Paginated<SupplierOrderWithLines>> {
    return this.supplierOrders.list(tenantId, query, user);
  }


  /**
   * Excel dell ELENCO (`14` §5.2): un foglio con le colonne della vista, non
   * la stampa del singolo ordine.
   *
   * ```text
   * senza ids  -> tutto il risultato dei filtri
   * con ids    -> soltanto gli ordini selezionati
   * ```
   *
   * ⚠️ Il file e SpreadsheetML, non OOXML: estensione `.xls` e MIME
   * `application/vnd.ms-excel`, che e cio che il generatore produce davvero.
   * Il comando a schermo si chiama «Excel»; il file dichiara cosa e.
   */
  @Get('export/spreadsheet')
  @RequireAnyPermissions(SUPPLIER_ORDERS_VIEW_PERMISSIONS)
  @Header('Content-Type', SPREADSHEET_ML_MIME)
  async exportSpreadsheet(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Query() query: ExportSupplierOrdersQueryDto,
  ): Promise<StreamableFile> {
    const orders = await this.supplierOrders.listAllForExport(tenantId, query, user, query.ids);
    const xml = serializeExcel2003Xml(
      'Ordini fornitore',
      [...SUPPLIER_ORDER_EXPORT_HEADERS],
      buildSupplierOrderExportRows(orders),
    );
    const stamp = new Date().toISOString().slice(0, 10);
    return new StreamableFile(Buffer.from(xml, 'utf-8'), {
      type: SPREADSHEET_ML_MIME,
      disposition: `attachment; filename="ordini-fornitore-${stamp}.${SPREADSHEET_ML_EXTENSION}"`,
    });
  }
  /**
   * Export PDF dell'ordine. Il recupero passa da getById(tenantId, id, user)
   * così lo scope location dell'utente resta applicato anche alla stampa.
   */
  @Get(':id/export/pdf')
  @RequireAnyPermissions(SUPPLIER_ORDERS_VIEW_PERMISSIONS)
  @Header('Content-Type', 'application/pdf')
  async exportPdf(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StreamableFile> {
    const order = await this.supplierOrders.getById(tenantId, id, user);
    const { buffer, filename } = await this.supplierOrderPdf.exportPdf(tenantId, order);
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: `attachment; filename="${filename}"`,
    });
  }

  @Get(':id')
  @RequireAnyPermissions(SUPPLIER_ORDERS_VIEW_PERMISSIONS)
  getById(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SupplierOrderWithLines> {
    return this.supplierOrders.getById(tenantId, id, user);
  }

  @Post()
  @RequireAnyPermissions(SUPPLIER_ORDERS_MANAGE_PERMISSIONS)
  create(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Body() dto: CreateSupplierOrderDto,
  ): Promise<SupplierOrderWithLines> {
    return this.supplierOrders.create(tenantId, dto, user);
  }

  @Patch(':id')
  @RequireAnyPermissions(SUPPLIER_ORDERS_MANAGE_PERMISSIONS)
  update(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSupplierOrderDto,
  ): Promise<SupplierOrderWithLines> {
    return this.supplierOrders.update(tenantId, id, dto, user);
  }

  @Post(':id/cancel')
  @RequireAnyPermissions(SUPPLIER_ORDERS_MANAGE_PERMISSIONS)
  cancel(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SupplierOrderWithLines> {
    return this.supplierOrders.cancel(tenantId, id, user);
  }

  @Delete(':id')
  @RequireAnyPermissions(SUPPLIER_ORDERS_MANAGE_PERMISSIONS)
  delete(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.supplierOrders.delete(tenantId, id, user);
  }
}
