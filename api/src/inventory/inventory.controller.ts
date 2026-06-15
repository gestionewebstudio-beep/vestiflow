import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import type { Location, StockMovement } from '@prisma/client';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../common/tenant/tenant.decorator';
import type { Paginated } from '../common/dto/pagination.dto';
import { ListInventoryLevelsQueryDto, ListMovementsQueryDto } from './dto/inventory-queries.dto';
import { RegisterMovementDto } from './dto/register-movement.dto';
import { InventoryService, type InventoryLevelWithRefs } from './inventory.service';

@Controller('inventory')
@UseGuards(JwtAuthGuard)
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

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
    @Body() dto: RegisterMovementDto,
  ): Promise<StockMovement> {
    return this.inventory.registerMovement(tenantId, dto);
  }
}
