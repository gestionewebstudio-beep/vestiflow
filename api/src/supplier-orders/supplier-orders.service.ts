import {
  ConflictException,
  GoneException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  Prisma,
  SupplierOrderStatus,
  type Supplier,
  type SupplierOrder,
  type SupplierOrderLine,
} from '@prisma/client';

import type { UserProfileDto } from '../auth/dto/user-profile.dto';
import {
  resolveReadableListLocationScope,
} from '../inventory/licensed-location-scope.util';
import {
  assertLocationInUserScope,
  assertLocationReadableInUserScope,
} from '../inventory/user-location-scope.util';
import { PrismaService } from '../prisma/prisma.service';
import { ChannelSyncFacade } from '../channels/channel-sync.facade';
import type { Paginated } from '../common/dto/pagination.dto';
import type { CreateSupplierDto } from './dto/create-supplier.dto';
import type { CreateSupplierOrderDto } from './dto/create-supplier-order.dto';
import type { ListSupplierOrdersQueryDto } from './dto/list-supplier-orders.query.dto';
import type { ReceiveSupplierOrderDto } from './dto/receive-supplier-order.dto';
import type { UpdateSupplierOrderDto } from './dto/update-supplier-order.dto';
import {
  applyIncomingForSupplierOrder,
  reverseIncomingForSupplierOrder,
} from './supplier-order-incoming.util';
import { SuppliersService } from './suppliers.service';

export type SupplierOrderListRow = SupplierOrder & { lineCount: number; lines: [] };

export type SupplierOrderWithLines = SupplierOrder & { lines: SupplierOrderLine[] };

@Injectable()
export class SupplierOrdersService {
  private readonly logger = new Logger(SupplierOrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly channelSync: ChannelSyncFacade,
    private readonly suppliers: SuppliersService,
  ) {}

  listSuppliers(tenantId: string): Promise<Supplier[]> {
    return this.suppliers.listAll(tenantId);
  }

  createSupplier(tenantId: string, dto: CreateSupplierDto): Promise<Supplier> {
    return this.suppliers.create(tenantId, dto);
  }

  /**
   * Crea un ordine fornitore: snapshot di nome fornitore e SKU, totale calcolato
   * server-side. Nessun impatto su giacenze finché non si riceve la merce.
   */
  async create(
    tenantId: string,
    dto: CreateSupplierOrderDto,
    user?: UserProfileDto,
  ): Promise<SupplierOrderWithLines> {
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
    if (user) {
      assertLocationInUserScope(user, dto.destinationLocationId, 'write');
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
    const status = this.resolveInitialStatus(dto.status);
    const reference = await this.nextReference(tenantId);

    return this.prisma.$transaction(async (tx) => {
      const order = await tx.supplierOrder.create({
        data: {
          tenantId,
          reference,
          supplierId: supplier.id,
          supplierName: supplier.name,
          destinationLocationId: dto.destinationLocationId,
          status,
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

      if (status === SupplierOrderStatus.sent) {
        await applyIncomingForSupplierOrder(
          tx,
          tenantId,
          order.destinationLocationId,
          order.lines,
        );
      }

      return order;
    });
  }

  /** Aggiorna una bozza: righe sostituite integralmente, totale ricalcolato. */
  async update(
    tenantId: string,
    id: string,
    dto: UpdateSupplierOrderDto,
    user?: UserProfileDto,
  ): Promise<SupplierOrderWithLines> {
    // Nota: niente controllo location qui su getById (lettura interna): la
    // sede attuale dell'ordine viene verificata sotto, insieme alla nuova.
    const order = await this.getById(tenantId, id);
    if (order.status !== SupplierOrderStatus.draft) {
      throw new ConflictException('Solo gli ordini in bozza possono essere modificati.');
    }
    if (user) {
      // L'utente deve poter operare sia sulla sede attuale dell'ordine sia
      // (se cambia) sulla nuova destinazione.
      assertLocationInUserScope(user, order.destinationLocationId, 'write');
    }

    const supplier = await this.prisma.supplier.findFirst({
      where: { id: dto.supplierId ?? order.supplierId, tenantId },
    });
    if (!supplier) {
      throw new NotFoundException('Fornitore non trovato');
    }

    const destinationLocationId = dto.destinationLocationId ?? order.destinationLocationId;
    const location = await this.prisma.location.findFirst({
      where: { id: destinationLocationId, tenantId },
      select: { id: true },
    });
    if (!location) {
      throw new NotFoundException('Location di destinazione non trovata');
    }
    if (user) {
      assertLocationInUserScope(user, destinationLocationId, 'write');
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

    return this.prisma.$transaction(async (tx) => {
      await tx.supplierOrderLine.deleteMany({ where: { orderId: id } });
      return tx.supplierOrder.update({
        where: { id },
        data: {
          supplierId: supplier.id,
          supplierName: supplier.name,
          destinationLocationId,
          currency: dto.currency ?? order.currency,
          totalMinor,
          expectedAt:
            dto.expectedAt === null
              ? null
              : dto.expectedAt
                ? new Date(dto.expectedAt)
                : order.expectedAt,
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
    });
  }

  /** Annulla un ordine in bozza o inviato (non ancora ricevuto). */
  async cancel(
    tenantId: string,
    id: string,
    user?: UserProfileDto,
  ): Promise<SupplierOrderWithLines> {
    const order = await this.getById(tenantId, id);
    if (user) {
      assertLocationInUserScope(user, order.destinationLocationId, 'write');
    }
    if (
      order.status !== SupplierOrderStatus.draft &&
      order.status !== SupplierOrderStatus.sent
    ) {
      throw new ConflictException(
        'Solo ordini in bozza o inviati (non ancora ricevuti) possono essere annullati.',
      );
    }
    return this.prisma.$transaction(async (tx) => {
      if (order.status === SupplierOrderStatus.sent) {
        await reverseIncomingForSupplierOrder(
          tx,
          tenantId,
          order.destinationLocationId,
          order.lines,
        );
      }
      return tx.supplierOrder.update({
        where: { id },
        data: { status: SupplierOrderStatus.cancelled },
        include: { lines: true },
      });
    });
  }

  /** Elimina definitivamente un ordine annullato (righe in cascade). */
  async delete(tenantId: string, id: string, user?: UserProfileDto): Promise<void> {
    const order = await this.getById(tenantId, id);
    if (user) {
      assertLocationInUserScope(user, order.destinationLocationId, 'write');
    }
    if (order.status !== SupplierOrderStatus.cancelled) {
      throw new ConflictException('Solo gli ordini annullati possono essere eliminati.');
    }
    await this.prisma.supplierOrder.delete({ where: { id } });
  }

  /** Transizione bozza → inviato (rende l'ordine ricevibile). */
  async send(
    tenantId: string,
    id: string,
    user?: UserProfileDto,
  ): Promise<SupplierOrderWithLines> {
    const order = await this.getById(tenantId, id);
    if (user) {
      assertLocationInUserScope(user, order.destinationLocationId, 'write');
    }
    if (order.status !== SupplierOrderStatus.draft) {
      throw new ConflictException('Solo gli ordini in bozza possono essere inviati.');
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.supplierOrder.update({
        where: { id },
        data: { status: SupplierOrderStatus.sent },
        include: { lines: true },
      });
      await applyIncomingForSupplierOrder(
        tx,
        tenantId,
        updated.destinationLocationId,
        updated.lines,
      );
      return updated;
    });
  }

  private resolveInitialStatus(status?: SupplierOrderStatus): SupplierOrderStatus {
    const resolved = status ?? SupplierOrderStatus.draft;
    if (resolved !== SupplierOrderStatus.draft && resolved !== SupplierOrderStatus.sent) {
      throw new UnprocessableEntityException(
        'Stato iniziale consentito: solo bozza o inviato.',
      );
    }
    return resolved;
  }

  /**
   * Riferimento progressivo per anno: PO-YYYY-NNNN, univoco per tenant.
   *
   * Il prossimo numero deriva dal MASSIMO suffisso esistente + 1, non dal
   * conteggio: dopo l'eliminazione di un ordine annullato il conteggio cala e
   * un `count + 1` rigenererebbe un riferimento già presente, violando
   * `@@unique([tenantId, reference])` (P2002 → 500 permanente). Il massimo è
   * stabile rispetto ai buchi lasciati dalle eliminazioni.
   */
  private async nextReference(tenantId: string): Promise<string> {
    const prefix = `PO-${new Date().getFullYear()}-`;
    const existing = await this.prisma.supplierOrder.findMany({
      where: { tenantId, reference: { startsWith: prefix } },
      select: { reference: true },
    });
    let max = 0;
    for (const { reference } of existing) {
      const suffix = reference.slice(prefix.length);
      if (/^\d+$/.test(suffix)) {
        max = Math.max(max, Number.parseInt(suffix, 10));
      }
    }
    return `${prefix}${String(max + 1).padStart(4, '0')}`;
  }

  async list(
    tenantId: string,
    query: ListSupplierOrdersQueryDto,
    user?: UserProfileDto,
  ): Promise<Paginated<SupplierOrderListRow>> {
    const locationScope = await resolveReadableListLocationScope(this.prisma, tenantId, user);
    if (locationScope === null) {
      return { items: [], total: 0, page: query.page, pageSize: query.pageSize };
    }

    const where: Prisma.SupplierOrderWhereInput = {
      tenantId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.supplierId ? { supplierId: query.supplierId } : {}),
      ...(locationScope !== 'unrestricted'
        ? { destinationLocationId: { in: [...locationScope] } }
        : {}),
      ...(query.search
        ? {
            OR: [
              { reference: { contains: query.search, mode: 'insensitive' } },
              { supplierName: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.supplierOrder.findMany({
        where,
        include: { _count: { select: { lines: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.supplierOrder.count({ where }),
    ]);

    const items: SupplierOrderListRow[] = rows.map(({ _count, ...order }) => ({
      ...order,
      lineCount: _count.lines,
      lines: [],
    }));

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async getById(
    tenantId: string,
    id: string,
    user?: UserProfileDto,
  ): Promise<SupplierOrderWithLines> {
    const order = await this.prisma.supplierOrder.findFirst({
      where: { id, tenantId },
      include: { lines: true },
    });
    if (!order) {
      throw new NotFoundException('Ordine fornitore non trovato');
    }
    assertLocationReadableInUserScope(
      user,
      order.destinationLocationId,
      'Non sei autorizzato ad accedere a questo ordine fornitore.',
    );
    return order;
  }

  /**
   * @deprecated Usa il flusso documento arrivo merce (goods receipt).
   */
  async receive(
    _tenantId: string,
    _id: string,
    _dto: ReceiveSupplierOrderDto,
  ): Promise<SupplierOrderWithLines> {
    throw new GoneException(
      'La ricezione merce diretta non è più disponibile. Crea un documento di arrivo merce (goods receipt) collegato all\'ordine fornitore.',
    );
  }
}
