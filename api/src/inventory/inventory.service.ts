import {
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  AdjustmentDirection,
  Prisma,
  StockMovementType,
  type InventoryLevel,
  type Location,
  type StockMovement,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { ChannelSyncFacade } from '../channels/channel-sync.facade';
import type { Paginated } from '../common/dto/pagination.dto';
import type {
  ListInventoryLevelsQueryDto,
  ListMovementsQueryDto,
} from './dto/inventory-queries.dto';
import type { RegisterMovementDto } from './dto/register-movement.dto';

export type InventoryLevelWithRefs = InventoryLevel & {
  variant: { sku: string; product: { name: string } };
  location: { name: string };
};

@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly channelSync: ChannelSyncFacade,
  ) {}

  listLocations(tenantId: string): Promise<Location[]> {
    return this.prisma.location.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
    });
  }

  async listLevels(
    tenantId: string,
    query: ListInventoryLevelsQueryDto,
  ): Promise<Paginated<InventoryLevelWithRefs>> {
    const where: Prisma.InventoryLevelWhereInput = {
      tenantId,
      ...(query.locationId ? { locationId: query.locationId } : {}),
      ...(query.search
        ? {
            variant: {
              OR: [
                { sku: { contains: query.search, mode: 'insensitive' } },
                { product: { name: { contains: query.search, mode: 'insensitive' } } },
              ],
            },
          }
        : {}),
      // "Sotto soglia" confrontando colonne: available <= min_threshold.
      ...(query.lowStockOnly
        ? { available: { lte: this.prisma.inventoryLevel.fields.minThreshold } }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.inventoryLevel.findMany({
        where,
        include: {
          variant: { select: { sku: true, product: { select: { name: true } } } },
          location: { select: { name: true } },
        },
        orderBy: { updatedAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.inventoryLevel.count({ where }),
    ]);

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async listMovements(
    tenantId: string,
    query: ListMovementsQueryDto,
  ): Promise<Paginated<StockMovement>> {
    const where: Prisma.StockMovementWhereInput = {
      tenantId,
      ...(query.locationId ? { locationId: query.locationId } : {}),
      ...(query.variantId ? { variantId: query.variantId } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.stockMovement.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.stockMovement.count({ where }),
    ]);

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  /**
   * Registra un movimento manuale aggiornando le giacenze nella STESSA
   * transazione: o si scrivono movimento + giacenze, o niente
   * (regole-gestionale: mai stock aggiornato senza traccia).
   */
  async registerMovement(
    tenantId: string,
    dto: RegisterMovementDto,
    actorDisplayName: string,
  ): Promise<StockMovement> {
    this.assertMovementShape(dto);

    const movement = await this.prisma.$transaction(async (tx) => {
      const variant = await tx.productVariant.findFirst({
        where: { id: dto.variantId, tenantId },
        select: { id: true, sku: true },
      });
      if (!variant) {
        throw new NotFoundException('Variante non trovata');
      }
      await this.assertLocationExists(tx, tenantId, dto.locationId);
      if (dto.targetLocationId) {
        await this.assertLocationExists(tx, tenantId, dto.targetLocationId);
      }

      const delta = this.sourceDelta(dto);
      await this.applyDelta(tx, tenantId, dto.variantId, dto.locationId, delta);
      if (dto.type === StockMovementType.transfer && dto.targetLocationId) {
        await this.applyDelta(tx, tenantId, dto.variantId, dto.targetLocationId, dto.quantity);
      }

      return tx.stockMovement.create({
        data: {
          tenantId,
          type: dto.type,
          origin: 'manual',
          variantId: dto.variantId,
          sku: variant.sku,
          locationId: dto.locationId,
          targetLocationId: dto.targetLocationId,
          quantity: dto.quantity,
          direction: dto.type === StockMovementType.adjustment ? dto.direction : null,
          reason: dto.reason,
          createdByName: actorDisplayName.trim() || 'Utente',
        },
      });
    });

    const locationIds = dto.targetLocationId
      ? [dto.locationId, dto.targetLocationId]
      : [dto.locationId];
    void Promise.resolve(
      this.channelSync.pushInventoryLevels(tenantId, dto.variantId, locationIds),
    ).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'Push inventario canali fallito';
      this.logger.warn(`Push inventario post-movimento (${tenantId}): ${message}`);
    });

    return movement;
  }

  /** Variazione (con segno) da applicare alla location di origine. */
  private sourceDelta(dto: RegisterMovementDto): number {
    switch (dto.type) {
      case StockMovementType.load:
        return dto.quantity;
      case StockMovementType.unload:
      case StockMovementType.transfer:
        return -dto.quantity;
      case StockMovementType.adjustment:
        return dto.direction === AdjustmentDirection.increase ? dto.quantity : -dto.quantity;
      default:
        return 0;
    }
  }

  private async applyDelta(
    tx: Prisma.TransactionClient,
    tenantId: string,
    variantId: string,
    locationId: string,
    delta: number,
  ): Promise<void> {
    const level = await tx.inventoryLevel.upsert({
      where: { variantId_locationId: { variantId, locationId } },
      create: { tenantId, variantId, locationId },
      update: {},
    });
    const nextAvailable = level.available + delta;
    if (delta < 0 && nextAvailable < 0) {
      throw new UnprocessableEntityException(
        `Disponibilità insufficiente: richiesti ${Math.abs(delta)}, disponibili ${level.available}.`,
      );
    }
    await tx.inventoryLevel.update({
      where: { id: level.id },
      data: { onHand: level.onHand + delta, available: nextAvailable },
    });
  }

  private async assertLocationExists(
    tx: Prisma.TransactionClient,
    tenantId: string,
    locationId: string,
  ): Promise<void> {
    const location = await tx.location.findFirst({
      where: { id: locationId, tenantId },
      select: { id: true },
    });
    if (!location) {
      throw new NotFoundException('Location non trovata');
    }
  }

  /** Vincoli per tipo, prima di toccare il DB. */
  private assertMovementShape(dto: RegisterMovementDto): void {
    if (dto.type === StockMovementType.transfer) {
      if (!dto.targetLocationId) {
        throw new UnprocessableEntityException('Trasferimento senza location di destinazione');
      }
      if (dto.targetLocationId === dto.locationId) {
        throw new UnprocessableEntityException('Origine e destinazione coincidono');
      }
    }
    if (dto.type === StockMovementType.adjustment) {
      if (!dto.direction) {
        throw new UnprocessableEntityException('Rettifica senza direzione (increase/decrease)');
      }
      if (!dto.reason?.trim()) {
        throw new UnprocessableEntityException('Le rettifiche richiedono un motivo');
      }
    }
  }
}
