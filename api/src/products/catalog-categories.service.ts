import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { CatalogCategory } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

export interface CatalogCategoryDto {
  readonly id: string;
  readonly name: string;
  readonly parentId: string | null;
}

function toDto(row: CatalogCategory): CatalogCategoryDto {
  return { id: row.id, name: row.name, parentId: row.parentId };
}

/**
 * Vocabolario categorie/sottocategorie catalogo, gestito inline dal form
 * prodotto. I prodotti salvano i nomi come testo (category/subcategory):
 * il rename viene propagato qui ai prodotti, l'eliminazione lascia il testo
 * sui prodotti (diventa un valore "personalizzato").
 */
@Injectable()
export class CatalogCategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string): Promise<readonly CatalogCategoryDto[]> {
    const rows = await this.prisma.catalogCategory.findMany({
      where: { tenantId },
      orderBy: [{ parentId: 'asc' }, { name: 'asc' }],
    });
    return rows.map(toDto);
  }

  /** Crea (o restituisce, se già esistente con lo stesso nome) una voce. */
  async create(
    tenantId: string,
    name: string,
    parentId: string | null,
  ): Promise<CatalogCategoryDto> {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new UnprocessableEntityException('Il nome della categoria è obbligatorio.');
    }
    if (parentId) {
      const parent = await this.prisma.catalogCategory.findFirst({
        where: { id: parentId, tenantId, parentId: null },
      });
      if (!parent) {
        throw new NotFoundException('Categoria padre non trovata.');
      }
    }
    const existing = await this.prisma.catalogCategory.findFirst({
      where: {
        tenantId,
        parentId: parentId ?? null,
        name: { equals: trimmed, mode: 'insensitive' },
      },
    });
    if (existing) {
      return toDto(existing);
    }
    const created = await this.prisma.catalogCategory.create({
      data: { tenantId, name: trimmed, parentId: parentId ?? null },
    });
    return toDto(created);
  }

  /** Rinomina una voce e propaga il nuovo nome ai prodotti che la usano. */
  async rename(tenantId: string, id: string, name: string): Promise<CatalogCategoryDto> {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new UnprocessableEntityException('Il nome della categoria è obbligatorio.');
    }
    const current = await this.prisma.catalogCategory.findFirst({ where: { id, tenantId } });
    if (!current) {
      throw new NotFoundException('Categoria non trovata.');
    }
    const duplicate = await this.prisma.catalogCategory.findFirst({
      where: {
        tenantId,
        parentId: current.parentId,
        name: { equals: trimmed, mode: 'insensitive' },
        id: { not: id },
      },
    });
    if (duplicate) {
      throw new ConflictException('Esiste già una voce con questo nome.');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.catalogCategory.update({
        where: { id },
        data: { name: trimmed },
      });
      if (current.parentId === null) {
        // Categoria principale: propaga ai prodotti che la usano come testo.
        await tx.product.updateMany({
          where: { tenantId, category: { equals: current.name, mode: 'insensitive' } },
          data: { category: trimmed },
        });
      } else {
        const parent = await tx.catalogCategory.findFirst({
          where: { id: current.parentId, tenantId },
        });
        await tx.product.updateMany({
          where: {
            tenantId,
            subcategory: { equals: current.name, mode: 'insensitive' },
            ...(parent ? { category: { equals: parent.name, mode: 'insensitive' } } : {}),
          },
          data: { subcategory: trimmed },
        });
      }
      return toDto(updated);
    });
  }

  /** Elimina la voce (le sottocategorie seguono in cascade). */
  async delete(tenantId: string, id: string): Promise<void> {
    const current = await this.prisma.catalogCategory.findFirst({ where: { id, tenantId } });
    if (!current) {
      throw new NotFoundException('Categoria non trovata.');
    }
    await this.prisma.catalogCategory.delete({ where: { id } });
  }
}
