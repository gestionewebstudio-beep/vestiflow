import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { GoodsReceiptCausal } from '@prisma/client';

import { ExternalDocumentTypesService } from './external-document-types.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Causali di carico iniziali (modelli con segnaposto {numero}/{data}, §11).
 * `typeName` collega la causale al tipo documento fornitore di sistema.
 */
const DEFAULT_CAUSALS: readonly { readonly label: string; readonly typeName: string | null }[] = [
  { label: 'DDT {numero} del {data}', typeName: 'DDT' },
  { label: 'DDT {numero} del {data} - C/Lavorazione', typeName: 'DDT' },
  { label: 'DDT {numero} del {data} - C/Riparazione', typeName: 'DDT' },
  { label: 'DDT {numero} del {data} - C/Vendita', typeName: 'DDT' },
  { label: 'DDT {numero} del {data} - C/Visione', typeName: 'DDT' },
  { label: 'Reso {numero} del {data}', typeName: 'Reso' },
  { label: 'Fatt. {numero} del {data}', typeName: 'Fattura' },
  { label: 'Reso da Cliente Conto Visione', typeName: 'Reso' },
] as const;

export interface UpsertGoodsReceiptCausalInput {
  readonly label: string;
  readonly externalDocumentTypeId?: string | null;
  readonly isDefault?: boolean;
  readonly isActive?: boolean;
}

/**
 * Gestione causali di carico Arrivo merce: elenco per tenant con ordinamento,
 * predefinita e seed lazy dei valori iniziali (finestra "Gestione causali").
 */
@Injectable()
export class GoodsReceiptCausalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly externalTypes: ExternalDocumentTypesService,
  ) {}

  async list(tenantId: string): Promise<GoodsReceiptCausal[]> {
    await this.seedIfEmpty(tenantId);
    return this.prisma.goodsReceiptCausal.findMany({
      where: { tenantId },
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    });
  }

  async create(
    tenantId: string,
    input: UpsertGoodsReceiptCausalInput,
  ): Promise<GoodsReceiptCausal> {
    const label = input.label.trim();
    if (!label) {
      throw new UnprocessableEntityException('Il testo della causale è obbligatorio.');
    }
    const existing = await this.prisma.goodsReceiptCausal.findUnique({
      where: { tenantId_label: { tenantId, label } },
    });
    if (existing) {
      throw new ConflictException('Esiste già una causale con questo testo.');
    }
    const last = await this.prisma.goodsReceiptCausal.aggregate({
      where: { tenantId },
      _max: { sortOrder: true },
    });
    if (input.externalDocumentTypeId) {
      await this.externalTypes.getById(tenantId, input.externalDocumentTypeId);
    }
    return this.prisma.$transaction(async (tx) => {
      if (input.isDefault) {
        await tx.goodsReceiptCausal.updateMany({
          where: { tenantId, isDefault: true },
          data: { isDefault: false },
        });
      }
      return tx.goodsReceiptCausal.create({
        data: {
          tenantId,
          label,
          externalDocumentTypeId: input.externalDocumentTypeId ?? null,
          sortOrder: (last._max.sortOrder ?? 0) + 1,
          isDefault: input.isDefault ?? false,
          isActive: input.isActive ?? true,
        },
      });
    });
  }

  async update(
    tenantId: string,
    id: string,
    input: Partial<UpsertGoodsReceiptCausalInput>,
  ): Promise<GoodsReceiptCausal> {
    const causal = await this.getById(tenantId, id);
    const label = input.label?.trim();
    if (input.label !== undefined && !label) {
      throw new UnprocessableEntityException('Il testo della causale è obbligatorio.');
    }
    if (label && label !== causal.label) {
      const duplicate = await this.prisma.goodsReceiptCausal.findUnique({
        where: { tenantId_label: { tenantId, label } },
      });
      if (duplicate) {
        throw new ConflictException('Esiste già una causale con questo testo.');
      }
    }
    if (input.externalDocumentTypeId) {
      await this.externalTypes.getById(tenantId, input.externalDocumentTypeId);
    }
    return this.prisma.$transaction(async (tx) => {
      if (input.isDefault === true) {
        await tx.goodsReceiptCausal.updateMany({
          where: { tenantId, isDefault: true, id: { not: id } },
          data: { isDefault: false },
        });
      }
      return tx.goodsReceiptCausal.update({
        where: { id },
        data: {
          ...(label !== undefined ? { label } : {}),
          ...(input.externalDocumentTypeId !== undefined
            ? { externalDocumentTypeId: input.externalDocumentTypeId }
            : {}),
          ...(input.isDefault !== undefined ? { isDefault: input.isDefault } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        },
      });
    });
  }

  /** Riordina le causali secondo la sequenza di id fornita. */
  async reorder(tenantId: string, orderedIds: readonly string[]): Promise<GoodsReceiptCausal[]> {
    const causals = await this.prisma.goodsReceiptCausal.findMany({ where: { tenantId } });
    const known = new Set(causals.map((causal) => causal.id));
    const filtered = orderedIds.filter((id) => known.has(id));
    await this.prisma.$transaction(
      filtered.map((id, index) =>
        this.prisma.goodsReceiptCausal.update({
          where: { id },
          data: { sortOrder: index + 1 },
        }),
      ),
    );
    return this.list(tenantId);
  }

  async delete(tenantId: string, id: string): Promise<void> {
    await this.getById(tenantId, id);
    // Una causale "usata" vive come testo snapshot sui documenti (causalText):
    // eliminarla dall'elenco non tocca i documenti già salvati.
    await this.prisma.goodsReceiptCausal.delete({ where: { id } });
  }

  private async getById(tenantId: string, id: string): Promise<GoodsReceiptCausal> {
    const causal = await this.prisma.goodsReceiptCausal.findFirst({
      where: { id, tenantId },
    });
    if (!causal) {
      throw new NotFoundException('Causale non trovata');
    }
    return causal;
  }

  private async seedIfEmpty(tenantId: string): Promise<void> {
    const count = await this.prisma.goodsReceiptCausal.count({ where: { tenantId } });
    if (count > 0) {
      return;
    }
    // I tipi documento di sistema devono esistere per collegare le causali seed.
    const types = await this.externalTypes.list(tenantId);
    const typeIdByName = new Map(types.map((type) => [type.name, type.id]));
    await this.prisma.goodsReceiptCausal.createMany({
      data: DEFAULT_CAUSALS.map((causal, index) => ({
        tenantId,
        label: causal.label,
        externalDocumentTypeId: causal.typeName
          ? (typeIdByName.get(causal.typeName) ?? null)
          : null,
        sortOrder: index + 1,
        isDefault: index === 0,
        isActive: true,
      })),
      skipDuplicates: true,
    });
  }
}
