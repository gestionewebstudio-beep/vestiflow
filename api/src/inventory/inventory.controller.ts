import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { InventoryCountLine, Location, StockMovement } from '@prisma/client';
import { UserRole } from '@prisma/client';

import { csvUploadMulterOptions } from '../common/upload/multer-upload.options';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { UserProfileDto } from '../auth/dto/user-profile.dto';
import {
  INVENTORY_SECTION_PERMISSIONS,
  TenantPermission,
} from '../auth/tenant-permission.constants';
import {
  RequireAnyPermissions,
  RequirePermissions,
} from '../common/auth/tenant-permissions.decorator';
import { TenantPermissionsGuard } from '../common/auth/tenant-permissions.guard';
import { Roles } from '../common/auth/roles.decorator';
import { RolesGuard } from '../common/auth/roles.guard';
import { CurrentTenant } from '../common/tenant/tenant.decorator';
import type { Paginated } from '../common/dto/pagination.dto';
import { CreateInventoryCountDto } from './dto/create-inventory-count.dto';
import { ExportCorrispettiviQueryDto } from './dto/export-corrispettivi.query.dto';
import { ExportInventoryLevelsQueryDto } from './dto/export-inventory-levels.query.dto';
import { ImportInventoryBodyDto } from './dto/import-inventory-body.dto';
import { ListInventoryCountsQueryDto } from './dto/list-inventory-counts.query.dto';
import { ListInventoryLevelsQueryDto, ListMovementsQueryDto } from './dto/inventory-queries.dto';
import { ListInventorySituationQueryDto } from './dto/list-inventory-situation.query.dto';
import { ListReservationsQueryDto } from './dto/list-reservations.query.dto';
import { RegisterMovementDto } from './dto/register-movement.dto';
import { RegisterMovementBatchDto } from './dto/register-movement-batch.dto';
import { SetLicensedLocationsDto } from './dto/set-licensed-locations.dto';
import { UpdateInventoryLevelDto } from './dto/update-inventory-level.dto';
import { UpdateCountLineDto } from './dto/update-count-line.dto';
import {
  InventoryCountService,
  type InventoryCountSessionDetail,
  type InventoryCountSessionSummary,
} from './inventory-count.service';
import { InventoryExportService } from './inventory-export.service';
import { InventoryImportService } from './inventory-import.service';
import { InventoryReportService } from './inventory-report.service';
import {
  InventorySituationService,
  type InventorySituationRowDto,
} from './inventory-situation.service';
import { InventoryService, type InventoryLevelWithRefs } from './inventory.service';
import { LocationLicensingService } from './location-licensing.service';
import { StockReservationService } from '../order-reservations/stock-reservation.service';
import type { SalesOrderSource } from '@prisma/client';

/** Riga drill-down Impegnata: ordine che compone la quantità impegnata. */
export interface ReservationListRowDto {
  readonly id: string;
  readonly orderNumber: string;
  readonly channel: SalesOrderSource;
  readonly quantity: number;
  readonly sku: string;
  readonly locationName: string;
  readonly placedAt: string;
  readonly createdAt: string;
}

@Controller('inventory')
@UseGuards(JwtAuthGuard, TenantPermissionsGuard)
export class InventoryController {
  constructor(
    private readonly inventory: InventoryService,
    private readonly inventoryCount: InventoryCountService,
    private readonly inventoryExport: InventoryExportService,
    private readonly inventoryImport: InventoryImportService,
    private readonly inventoryReport: InventoryReportService,
    private readonly inventorySituation: InventorySituationService,
    private readonly locationLicensing: LocationLicensingService,
    private readonly stockReservations: StockReservationService,
  ) {}

  @Get('locations')
  @RequireAnyPermissions(INVENTORY_SECTION_PERMISSIONS)
  listLocations(@CurrentTenant() tenantId: string): Promise<Location[]> {
    return this.inventory.listLocations(tenantId);
  }

  @Put('locations/licensed')
  @UseGuards(RolesGuard)
  @Roles(UserRole.owner)
  setLicensedLocations(
    @CurrentTenant() tenantId: string,
    @Body() dto: SetLicensedLocationsDto,
  ) {
    return this.locationLicensing.setLicensedLocations(tenantId, dto.locationIds);
  }

  @Get('levels/export/csv')
  @RequirePermissions(TenantPermission.InventoryImportExport)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async exportLevelsCsv(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Query() query: ExportInventoryLevelsQueryDto,
  ): Promise<StreamableFile> {
    const csv = await this.inventoryExport.exportCsv(tenantId, query, user);
    const stamp = new Date().toISOString().slice(0, 10);
    return new StreamableFile(Buffer.from(csv, 'utf-8'), {
      type: 'text/csv; charset=utf-8',
      disposition: `attachment; filename="giacenze-vestiflow-${stamp}.csv"`,
    });
  }

  @Get('movements/export/corrispettivi')
  @RequirePermissions(TenantPermission.ReportsExport)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async exportCorrispettiviCsv(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Query() query: ExportCorrispettiviQueryDto,
  ): Promise<StreamableFile> {
    const csv = await this.inventoryExport.exportCorrispettiviCsv(tenantId, query, user);
    const stamp = new Date().toISOString().slice(0, 10);
    return new StreamableFile(Buffer.from(csv, 'utf-8'), {
      type: 'text/csv; charset=utf-8',
      disposition: `attachment; filename="corrispettivi-vestiflow-${stamp}.csv"`,
    });
  }

  @Post('levels/import/preview')
  @RequirePermissions(TenantPermission.InventoryImportExport)
  @UseInterceptors(FileInterceptor('file', csvUploadMulterOptions))
  previewLevelsImport(
    @CurrentTenant() tenantId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    this.assertCsvFile(file);
    return this.inventoryImport.previewCsv(tenantId, file.buffer.toString('utf-8'));
  }

  @Post('levels/import')
  @RequirePermissions(TenantPermission.InventoryImportExport)
  @UseInterceptors(FileInterceptor('file', csvUploadMulterOptions))
  importLevels(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: ImportInventoryBodyDto,
  ) {
    this.assertCsvFile(file);
    const keys = body.keys?.filter((key) => key.trim().length > 0);
    return this.inventoryImport.importCsv(tenantId, file.buffer.toString('utf-8'), user, { keys });
  }

  @Get('reports/location-summary')
  @RequirePermissions(TenantPermission.ReportsView)
  locationInventoryReport(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
  ) {
    return this.inventoryReport.locationSummary(tenantId, user);
  }

  /** Situazione magazzino: riepilogo per variante (tab Situazione). */
  @Get('situation')
  @RequireAnyPermissions(INVENTORY_SECTION_PERMISSIONS)
  listSituation(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Query() query: ListInventorySituationQueryDto,
  ): Promise<Paginated<InventorySituationRowDto>> {
    return this.inventorySituation.listSituation(tenantId, query, user);
  }

  @Get('levels')
  @RequireAnyPermissions(INVENTORY_SECTION_PERMISSIONS)
  listLevels(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Query() query: ListInventoryLevelsQueryDto,
  ): Promise<Paginated<InventoryLevelWithRefs>> {
    return this.inventory.listLevels(tenantId, query, user);
  }

  /** Impegni attivi che compongono la Impegnata (drill-down §10 fase 1). */
  @Get('reservations')
  @RequireAnyPermissions(INVENTORY_SECTION_PERMISSIONS)
  async listReservations(
    @CurrentTenant() tenantId: string,
    @Query() query: ListReservationsQueryDto,
  ): Promise<ReservationListRowDto[]> {
    const reservations = await this.stockReservations.listActiveForLevel(
      tenantId,
      query.variantId,
      query.locationId,
    );
    return reservations.map((reservation) => ({
      id: reservation.id,
      orderNumber: reservation.order.orderNumber,
      channel: reservation.channel,
      quantity: reservation.remainingQuantity,
      sku: reservation.sku,
      locationName: reservation.location.name,
      placedAt: reservation.order.placedAt.toISOString(),
      createdAt: reservation.createdAt.toISOString(),
    }));
  }

  @Patch('levels/:id')
  @RequirePermissions(TenantPermission.InventoryManage)
  updateLevelMinThreshold(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Param('id') id: string,
    @Body() dto: UpdateInventoryLevelDto,
  ) {
    return this.inventory.updateLevelMinThreshold(tenantId, id, dto.minThreshold, user);
  }

  /** Operatori distinti per il filtro Operatore del registro movimenti. */
  @Get('movements/operators')
  @RequireAnyPermissions(INVENTORY_SECTION_PERMISSIONS)
  listMovementOperators(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
  ): Promise<string[]> {
    return this.inventory.listMovementOperators(tenantId, user);
  }

  @Get('movements')
  @RequireAnyPermissions(INVENTORY_SECTION_PERMISSIONS)
  listMovements(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Query() query: ListMovementsQueryDto,
  ): Promise<Paginated<StockMovement>> {
    return this.inventory.listMovements(tenantId, query, user);
  }

  /** Registrazione multi-articolo dal form Registra movimento. */
  @Post('movements/batch')
  @RequirePermissions(TenantPermission.InventoryManage)
  registerMovementBatch(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Body() dto: RegisterMovementBatchDto,
  ): Promise<{ created: number }> {
    return this.inventory.registerMovementBatch(tenantId, dto, user.displayName, user.id, user);
  }

  @Post('movements')
  @RequirePermissions(TenantPermission.InventoryManage)
  registerMovement(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Body() dto: RegisterMovementDto,
  ): Promise<StockMovement> {
    return this.inventory.registerMovement(tenantId, dto, user.displayName, user.id, user);
  }

  @Get('counts')
  @RequirePermissions(TenantPermission.InventoryManage)
  listCounts(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Query() query: ListInventoryCountsQueryDto,
  ): Promise<Paginated<InventoryCountSessionSummary>> {
    return this.inventoryCount.list(tenantId, query, user);
  }

  @Post('counts')
  @RequirePermissions(TenantPermission.InventoryManage)
  createCount(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Body() dto: CreateInventoryCountDto,
  ): Promise<InventoryCountSessionDetail> {
    return this.inventoryCount.create(tenantId, dto, user);
  }

  @Get('counts/:id')
  @RequirePermissions(TenantPermission.InventoryManage)
  getCount(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Param('id') id: string,
  ): Promise<InventoryCountSessionDetail> {
    return this.inventoryCount.getById(tenantId, id, user);
  }

  @Patch('counts/:sessionId/lines/:lineId')
  @RequirePermissions(TenantPermission.InventoryManage)
  updateCountLine(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Param('sessionId') sessionId: string,
    @Param('lineId') lineId: string,
    @Body() dto: UpdateCountLineDto,
  ): Promise<InventoryCountLine> {
    return this.inventoryCount.updateLine(
      tenantId,
      sessionId,
      lineId,
      dto.countedQuantity,
      user,
    );
  }

  @Post('counts/:id/submit')
  @RequirePermissions(TenantPermission.InventoryManage)
  submitCount(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Param('id') id: string,
  ): Promise<InventoryCountSessionDetail> {
    return this.inventoryCount.submitForReview(tenantId, id, user);
  }

  @Post('counts/:id/finalize')
  @RequirePermissions(TenantPermission.InventoryManage)
  finalizeCount(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Param('id') id: string,
  ): Promise<InventoryCountSessionDetail> {
    return this.inventoryCount.finalize(tenantId, id, user);
  }

  @Post('counts/:id/cancel')
  @RequirePermissions(TenantPermission.InventoryManage)
  cancelCount(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Param('id') id: string,
  ): Promise<InventoryCountSessionDetail> {
    return this.inventoryCount.cancel(tenantId, id, user);
  }

  @Delete('counts/:id')
  @RequirePermissions(TenantPermission.InventoryManage)
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteCount(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Param('id') id: string,
  ): Promise<void> {
    return this.inventoryCount.deleteCancelled(tenantId, id, user);
  }

  private assertCsvFile(
    file: Express.Multer.File | undefined,
  ): asserts file is Express.Multer.File {
    if (!file?.buffer?.length) {
      throw new BadRequestException('File CSV mancante o vuoto.');
    }
    const name = file.originalname?.toLowerCase() ?? '';
    const mime = file.mimetype?.toLowerCase() ?? '';
    if (!name.endsWith('.csv') && mime !== 'text/csv' && mime !== 'application/vnd.ms-excel') {
      throw new BadRequestException('Carica un file CSV valido.');
    }
  }
}
