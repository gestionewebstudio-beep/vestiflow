import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { InventoryCountLine, Location, StockMovement } from '@prisma/client';

import { csvUploadMulterOptions } from '../common/upload/multer-upload.options';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { UserProfileDto } from '../auth/dto/user-profile.dto';
import { MANAGER_ROLES, Roles } from '../common/auth/roles.decorator';
import { RolesGuard } from '../common/auth/roles.guard';
import { CurrentTenant } from '../common/tenant/tenant.decorator';
import type { Paginated } from '../common/dto/pagination.dto';
import { CreateInventoryCountDto } from './dto/create-inventory-count.dto';
import { ExportInventoryLevelsQueryDto } from './dto/export-inventory-levels.query.dto';
import { ImportInventoryBodyDto } from './dto/import-inventory-body.dto';
import { ListInventoryCountsQueryDto } from './dto/list-inventory-counts.query.dto';
import { ListInventoryLevelsQueryDto, ListMovementsQueryDto } from './dto/inventory-queries.dto';
import { RegisterMovementDto } from './dto/register-movement.dto';
import { UpdateCountLineDto } from './dto/update-count-line.dto';
import {
  InventoryCountService,
  type InventoryCountSessionDetail,
  type InventoryCountSessionSummary,
} from './inventory-count.service';
import { InventoryExportService } from './inventory-export.service';
import { InventoryImportService } from './inventory-import.service';
import { InventoryService, type InventoryLevelWithRefs } from './inventory.service';

@Controller('inventory')
@UseGuards(JwtAuthGuard)
export class InventoryController {
  constructor(
    private readonly inventory: InventoryService,
    private readonly inventoryCount: InventoryCountService,
    private readonly inventoryExport: InventoryExportService,
    private readonly inventoryImport: InventoryImportService,
  ) {}

  @Get('locations')
  listLocations(@CurrentTenant() tenantId: string): Promise<Location[]> {
    return this.inventory.listLocations(tenantId);
  }

  @Get('levels/export/csv')
  @UseGuards(RolesGuard)
  @Roles(...MANAGER_ROLES)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async exportLevelsCsv(
    @CurrentTenant() tenantId: string,
    @Query() query: ExportInventoryLevelsQueryDto,
  ): Promise<StreamableFile> {
    const csv = await this.inventoryExport.exportCsv(tenantId, query);
    const stamp = new Date().toISOString().slice(0, 10);
    return new StreamableFile(Buffer.from(csv, 'utf-8'), {
      type: 'text/csv; charset=utf-8',
      disposition: `attachment; filename="giacenze-vestiflow-${stamp}.csv"`,
    });
  }

  @Post('levels/import/preview')
  @UseGuards(RolesGuard)
  @Roles(...MANAGER_ROLES)
  @UseInterceptors(FileInterceptor('file', csvUploadMulterOptions))
  previewLevelsImport(
    @CurrentTenant() tenantId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    this.assertCsvFile(file);
    return this.inventoryImport.previewCsv(tenantId, file.buffer.toString('utf-8'));
  }

  @Post('levels/import')
  @UseGuards(RolesGuard)
  @Roles(...MANAGER_ROLES)
  @UseInterceptors(FileInterceptor('file', csvUploadMulterOptions))
  importLevels(
    @CurrentTenant() tenantId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: ImportInventoryBodyDto,
  ) {
    this.assertCsvFile(file);
    const keys = body.keys?.filter((key) => key.trim().length > 0);
    return this.inventoryImport.importCsv(tenantId, file.buffer.toString('utf-8'), { keys });
  }

  @Get('levels')
  listLevels(
    @CurrentTenant() tenantId: string,
    @Query() query: ListInventoryLevelsQueryDto,
  ): Promise<Paginated<InventoryLevelWithRefs>> {
    return this.inventory.listLevels(tenantId, query);
  }

  @Get('movements')
  listMovements(
    @CurrentTenant() tenantId: string,
    @Query() query: ListMovementsQueryDto,
  ): Promise<Paginated<StockMovement>> {
    return this.inventory.listMovements(tenantId, query);
  }

  @Post('movements')
  registerMovement(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Body() dto: RegisterMovementDto,
  ): Promise<StockMovement> {
    return this.inventory.registerMovement(tenantId, dto, user.displayName);
  }

  @Get('counts')
  listCounts(
    @CurrentTenant() tenantId: string,
    @Query() query: ListInventoryCountsQueryDto,
  ): Promise<Paginated<InventoryCountSessionSummary>> {
    return this.inventoryCount.list(tenantId, query);
  }

  @Post('counts')
  createCount(
    @CurrentTenant() tenantId: string,
    @Body() dto: CreateInventoryCountDto,
  ): Promise<InventoryCountSessionDetail> {
    return this.inventoryCount.create(tenantId, dto);
  }

  @Get('counts/:id')
  getCount(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
  ): Promise<InventoryCountSessionDetail> {
    return this.inventoryCount.getById(tenantId, id);
  }

  @Patch('counts/:sessionId/lines/:lineId')
  updateCountLine(
    @CurrentTenant() tenantId: string,
    @Param('sessionId') sessionId: string,
    @Param('lineId') lineId: string,
    @Body() dto: UpdateCountLineDto,
  ): Promise<InventoryCountLine> {
    return this.inventoryCount.updateLine(tenantId, sessionId, lineId, dto.countedQuantity);
  }

  @Post('counts/:id/submit')
  submitCount(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
  ): Promise<InventoryCountSessionDetail> {
    return this.inventoryCount.submitForReview(tenantId, id);
  }

  @Post('counts/:id/finalize')
  finalizeCount(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
  ): Promise<InventoryCountSessionDetail> {
    return this.inventoryCount.finalize(tenantId, id);
  }

  @Post('counts/:id/cancel')
  cancelCount(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
  ): Promise<InventoryCountSessionDetail> {
    return this.inventoryCount.cancel(tenantId, id);
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
