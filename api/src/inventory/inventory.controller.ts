import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import type { InventoryCountLine, Location, StockMovement } from '@prisma/client';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { UserProfileDto } from '../auth/dto/user-profile.dto';
import { CurrentTenant } from '../common/tenant/tenant.decorator';
import type { Paginated } from '../common/dto/pagination.dto';
import { CreateInventoryCountDto } from './dto/create-inventory-count.dto';
import { ListInventoryCountsQueryDto } from './dto/list-inventory-counts.query.dto';
import { ListInventoryLevelsQueryDto, ListMovementsQueryDto } from './dto/inventory-queries.dto';
import { RegisterMovementDto } from './dto/register-movement.dto';
import { UpdateCountLineDto } from './dto/update-count-line.dto';
import {
  InventoryCountService,
  type InventoryCountSessionDetail,
  type InventoryCountSessionSummary,
} from './inventory-count.service';
import { InventoryService, type InventoryLevelWithRefs } from './inventory.service';

@Controller('inventory')
@UseGuards(JwtAuthGuard)
export class InventoryController {
  constructor(
    private readonly inventory: InventoryService,
    private readonly inventoryCount: InventoryCountService,
  ) {}

  @Get('locations')
  listLocations(@CurrentTenant() tenantId: string): Promise<Location[]> {
    return this.inventory.listLocations(tenantId);
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
}
