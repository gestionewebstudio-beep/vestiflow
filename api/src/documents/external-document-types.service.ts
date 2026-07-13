import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { ExternalDocumentType } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

/** Tipi documento fornitore iniziali di VestiFlow (voci di sistema). */
const SYSTEM_TYPES: readonly {
  readonly name: string;
  readonly shortLabel: string;
  readonly causalTemplate: string;
}[] = [
  { name: 'DDT', shortLabel: 'DDT', causalTemplate: 'DDT {numero} del {data}' },
  { name: 'Fattura', shortLabel: 'Fatt.', causalTemplate: 'Fatt. {numero} del {data}' },
  { name: 'Reso', shortLabel: 'Reso', causalTemplate: 'Reso {numero} del {data}' },
] as const;

export interface UpsertExternalDocumentTypeInput {
  readonly name: string;
  readonly shortLabel?: string;
  readonly causalTemplate?: string;
  readonly isActive?: boolean;
}

/**
 * Tipi documento fornitore per Arrivo merce (DDT, Fattura, Reso + tipi
 * personalizzati per tenant). Il nome è univoco per tenant senza distinguere
 * maiuscole/minuscole; le voci già usate si disattivano, mai eliminate.
 */
@Injectable()
export class ExternalDocumentTypesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string): Promise<ExternalDocumentType[]> {
    await this.seedIfEmpty(tenantId);
    return this.prisma.externalDocumentType.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async create(
    tenantId: string,
    input: UpsertExternalDocumentTypeInput,
  ): Promise<ExternalDocumentType> {
    const name = input.name.trim();
    if (!name) {
      throw new UnprocessableEntityException('Il nome del tipo documento è obbligatorio.');
    }
    await this.assertNameAvailable(tenantId, name);
    const last = await this.prisma.externalDocumentType.aggregate({
      where: { tenantId, deletedAt: null },
      _max: { sortOrder: true },
    });
    return this.prisma.externalDocumentType.create({
      data: {
        tenantId,
        name,
        shortLabel: input.shortLabel?.trim() || name,
        causalTemplate: input.causalTemplate?.trim() || null,
        isSystem: false,
        isActive: input.isActive ?? true,
        sortOrder: (last._max.sortOrder ?? 0) + 1,
      },
    });
  }

  async update(
    tenantId: string,
    id: string,
    input: Partial<UpsertExternalDocumentTypeInput>,
  ): Promise<ExternalDocumentType> {
    const type = await this.getById(tenantId, id);
    const name = input.name?.trim();
    if (input.name !== undefined && !name) {
      throw new UnprocessableEntityException('Il nome del tipo documento è obbligatorio.');
    }
    if (name && name.toLowerCase() !== type.name.toLowerCase()) {
      await this.assertNameAvailable(tenantId, name);
    }
    return this.prisma.externalDocumentType.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(input.shortLabel !== undefined
          ? { shortLabel: input.shortLabel.trim() || name || type.name }
          : {}),
        ...(input.causalTemplate !== undefined
          ? { causalTemplate: input.causalTemplate.trim() || null }
          : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    });
  }

  /** Riordina i tipi secondo la sequenza di id fornita. */
  async reorder(tenantId: string, orderedIds: readonly string[]): Promise<ExternalDocumentType[]> {
    const types = await this.prisma.externalDocumentType.findMany({
      where: { tenantId, deletedAt: null },
    });
    const known = new Set(types.map((type) => type.id));
    const filtered = orderedIds.filter((id) => known.has(id));
    await this.prisma.$transaction(
      filtered.map((id, index) =>
        this.prisma.externalDocumentType.update({
          where: { id },
          data: { sortOrder: index + 1 },
        }),
      ),
    );
    return this.list(tenantId);
  }

  /**
   * Elimina un tipo SOLO se mai utilizzato in un documento (§6). Le voci già
   * usate si disattivano: restano visibili nei documenti storici.
   */
  async delete(tenantId: string, id: string): Promise<void> {
    const type = await this.getById(tenantId, id);
    const usageCount = await this.prisma.document.count({
      where: { tenantId, externalDocumentTypeId: id },
    });
    if (usageCount > 0) {
      throw new ConflictException(
        'Questo tipo documento è già stato usato in un arrivo merce: disattivalo invece di eliminarlo.',
      );
    }
    const causalUsage = await this.prisma.goodsReceiptCausal.count({
      where: { tenantId, externalDocumentTypeId: id },
    });
    if (causalUsage > 0) {
      throw new ConflictException(
        'Questo tipo documento è collegato a una o più causali: scollegalo o disattivalo.',
      );
    }
    await this.prisma.externalDocumentType.delete({ where: { id: type.id } });
  }

  async getById(tenantId: string, id: string): Promise<ExternalDocumentType> {
    const type = await this.prisma.externalDocumentType.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!type) {
      throw new NotFoundException('Tipo documento fornitore non trovato');
    }
    return type;
  }

  private async assertNameAvailable(tenantId: string, name: string): Promise<void> {
    const duplicate = await this.prisma.externalDocumentType.findFirst({
      where: {
        tenantId,
        deletedAt: null,
        name: { equals: name, mode: 'insensitive' },
      },
    });
    if (duplicate) {
      throw new ConflictException('Esiste già un tipo documento con questo nome.');
    }
  }

  private async seedIfEmpty(tenantId: string): Promise<void> {
    const count = await this.prisma.externalDocumentType.count({ where: { tenantId } });
    if (count > 0) {
      return;
    }
    await this.prisma.externalDocumentType.createMany({
      data: SYSTEM_TYPES.map((type, index) => ({
        tenantId,
        name: type.name,
        shortLabel: type.shortLabel,
        causalTemplate: type.causalTemplate,
        isSystem: true,
        isActive: true,
        sortOrder: index + 1,
      })),
      skipDuplicates: true,
    });
  }
}
