import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  Prisma,
  StockMovementType,
  SupplierOrderStatus,
  type Supplier,
  type SupplierOrder,
  type SupplierOrderLine,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { ChannelSyncFacade } from '../channels/channel-sync.facade';
import type { Paginated } from '../common/dto/pagination.dto';
import type { CreateSupplierDto } from './dto/create-supplier.dto';
import type { CreateSupplierOrderDto } from './dto/create-supplier-order.dto';
import type { ListSupplierOrdersQueryDto } from './dto/list-supplier-orders.query.dto';
import type { ReceiveSupplierOrderDto } from './dto/receive-supplier-order.dto';

export type SupplierOrderWithLines = SupplierOrder & { lines: SupplierOrderLine[] };

@Injectable()
export class SupplierOrdersService {
  private readonly logger = new Logger(SupplierOrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly channelSync: ChannelSyncFacade,
  ) {}

  listSuppliers(tenantId: string): Promise<Supplier[]> {
    return this.prisma.supplier.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
    });
  }

  createSupplier(tenantId: string, dto: CreateSupplierDto): Promise<Supplier> {
    return this.prisma.supplier.create({
      data: {
        tenantId,
        name: dto.name.trim(),
        email: dto.email,
        phone: dto.phone,
        notes: dto.notes,
      },
    });
  }

  /**
   * Crea un ordine fornitore: snapshot di nome fornitore e SKU, totale calcolato
   * server-side. Nessun impatto su giacenze finché non si riceve la merce.
   */
  async create(tenantId: string, dto: CreateSupplierOrderDto): Promise<SupplierOrderWithLines> {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: dto.supplierId, tenantId },
    });
    if (!supplier) {
      throw new NotFoundException('Fornitore non trovato');
    }

    const location = await this.prisma.location.findFirst({
      where: { id: dto.destinationLocationId, tenantId },
      select: { id: true },
    });
    if (!location) {
      throw new NotFoundException('Location di destinazione non trovata');
    }

    const variantIds = dto.lines.map((line) => line.variantId);
    const variants = await this.prisma.productVariant.findMany({
      where: { tenantId, id: { in: variantIds } },
      select: { id: true, sku: true },
    });
    const skuById = new Map(variants.map((variant) => [variant.id, variant.sku]));
    for (const line of dto.lines) {
      if (!skuById.has(line.variantId)) {
        throw new UnprocessableEntityException(`Variante non trovata: ${line.variantId}`);
      }
    }

    const totalMinor = dto.lines.reduce(
      (sum, line) => sum + line.orderedQuantity * line.unitCostMinor,
      0,
    );
    const reference = await this.nextReference(tenantId);

    return this.prisma.supplierOrder.create({
      data: {
        tenantId,
        reference,
        supplierId: supplier.id,
        supplierName: supplier.name,
        destinationLocationId: dto.destinationLocationId,
        status: dto.status ?? SupplierOrderStatus.draft,
        currency: dto.currency ?? 'EUR',
        totalMinor,
        expectedAt: dto.expectedAt ? new Date(dto.expectedAt) : null,
        lines: {
          create: dto.lines.map((line) => ({
            variantId: line.variantId,
            sku: skuById.get(line.variantId)!,
            orderedQuantity: line.orderedQuantity,
            unitCostMinor: line.unitCostMinor,
          })),
        },
      },
      include: { lines: true },
    });
  }

  /** Transizione bozza → inviato (rende l'ordine ricevibile). */
  async send(tenantId: string, id: string): Promise<SupplierOrderWithLines> {
    const order = await this.getById(tenantId, id);
    if (order.status !== SupplierOrderStatus.draft) {
      throw new ConflictException('Solo gli ordini in bozza possono essere inviati.');
    }
    return this.prisma.supplierOrder.update({
      where: { id },
      data: { status: SupplierOrderStatus.sent },
      include: { lines: true },
    });
  }

  /** Riferimento progressivo per anno: PO-YYYY-NNNN, univoco per tenant. */
  private async nextReference(tenantId: string): Promise<string> {
    const prefix = `PO-${new Date().getFullYear()}-`;
    const count = await this.prisma.supplierOrder.count({
      where: { tenantId, reference: { startsWith: prefix } },
    });
    return `${prefix}${String(count + 1).padStart(4, '0')}`;
  }

  async list(
    tenantId: string,
    query: ListSupplierOrdersQueryDto,
  ): Promise<Paginated<SupplierOrderWithLines>> {
    const where: Prisma.SupplierOrderWhereInput = {
      tenantId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { reference: { contains: query.search, mode: 'insensitive' } },
              { supplierName: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.supplierOrder.findMany({
        where,
        include: { lines: true },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.supplierOrder.count({ where }),
    ]);

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async getById(tenantId: string, id: string): Promise<SupplierOrderWithLines> {
    const order = await this.prisma.supplierOrder.findFirst({
      where: { id, tenantId },
      include: { lines: true },
    });
    if (!order) {
      throw new NotFoundException('Ordine fornitore non trovato');
    }
    return order;
  }

  /**
   * Ricezione merce: aggiorna righe, stato ordine e genera movimenti di carico
   * sulla location di destinazione (transazione atomica).
   */
  async receive(
    tenantId: string,
    id: string,
    dto: ReceiveSupplierOrderDto,
  ): Promise<SupplierOrderWithLines> {
    const receivedVariants: { variantId: string; locationId: string }[] = [];

    const order = await this.prisma.$transaction(async (tx) => {
      const order = await tx.supplierOrder.findFirst({
        where: { id, tenantId },
        include: { lines: true },
      });
      if (!order) {
        throw new NotFoundException('Ordine fornitore non trovato');
      }

      if (
        order.status !== SupplierOrderStatus.sent &&
        order.status !== SupplierOrderStatus.partially_received
      ) {
        throw new ConflictException(
          'Solo ordini inviati o parzialmente ricevuti possono essere ricevuti.',
        );
      }

      const lineById = new Map(order.lines.map((line) => [line.id, line]));
      const receiveByLine = new Map<string, number>();

      for (const entry of dto.lines) {
        const line = lineById.get(entry.lineId);
        if (!line) {
          throw new UnprocessableEntityException(`Riga ordine non trovata: ${entry.lineId}`);
        }
        const remaining = line.orderedQuantity - line.receivedQuantity;
        if (entry.quantity > remaining) {
          throw new UnprocessableEntityException(
            `Quantità eccessiva per SKU ${line.sku}: rimangono ${remaining} da ricevere.`,
          );
        }
        receiveByLine.set(entry.lineId, entry.quantity);
      }

      for (const [lineId, quantity] of receiveByLine) {
        const line = lineById.get(lineId)!;
        const nextReceived = line.receivedQuantity + quantity;

        await tx.supplierOrderLine.update({
          where: { id: lineId },
          data: { receivedQuantity: nextReceived },
        });

        await this.applyLoad(
          tx,
          tenantId,
          order.destinationLocationId,
          line.variantId,
          line.sku,
          quantity,
          `Ricezione ordine ${order.reference}`,
          order.id,
        );

        if (quantity > 0) {
          receivedVariants.push({
            variantId: line.variantId,
            locationId: order.destinationLocationId,
          });
        }
      }

      const updatedLines = await tx.supplierOrderLine.findMany({ where: { orderId: id } });
      const allReceived = updatedLines.every(
        (line) => line.receivedQuantity >= line.orderedQuantity,
      );
      const anyReceived = updatedLines.some((line) => line.receivedQuantity > 0);
      const nextStatus = allReceived
        ? SupplierOrderStatus.received
        : anyReceived
          ? SupplierOrderStatus.partially_received
          : order.status;

      return tx.supplierOrder.update({
        where: { id },
        data: { status: nextStatus },
        include: { lines: true },
      });
    });

    for (const entry of receivedVariants) {
      try {
        await this.channelSync.pushInventoryLevels(tenantId, entry.variantId, [entry.locationId]);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Push inventario Shopify fallito';
        this.logger.warn(`Push inventario Shopify non riuscito (${tenantId}): ${message}`);
      }
    }

    return order;
  }

  private async applyLoad(
    tx: Prisma.TransactionClient,
    tenantId: string,
    locationId: string,
    variantId: string,
    sku: string,
    quantity: number,
    reason: string,
    externalRef: string,
  ): Promise<void> {
    const level = await tx.inventoryLevel.upsert({
      where: { variantId_locationId: { variantId, locationId } },
      create: { tenantId, variantId, locationId },
      update: {},
    });

    await tx.inventoryLevel.update({
      where: { id: level.id },
      data: {
        onHand: level.onHand + quantity,
        available: level.available + quantity,
      },
    });

    await tx.stockMovement.create({
      data: {
        tenantId,
        type: StockMovementType.load,
        origin: 'manual',
        variantId,
        sku,
        locationId,
        quantity,
        reason,
        externalRef,
        createdByName: 'API',
      },
    });
  }
}
