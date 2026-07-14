import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma, type Supplier, type SupplierVariantLink } from '@prisma/client';

import type { Paginated } from '../common/dto/pagination.dto';
import { CustomersService } from '../customers/customers.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateSupplierDto } from './dto/create-supplier.dto';
import type { ListSuppliersQueryDto } from './dto/list-suppliers.query.dto';
import type { UpdateSupplierDto } from './dto/update-supplier.dto';
import type { UpsertSupplierVariantLinkDto } from './dto/upsert-supplier-variant-link.dto';
import { nextNumericSupplierCode, SUPPLIER_NUMERIC_CODE_PAD } from './supplier-code.util';

const SUPPLIER_VARIANT_LINK_INCLUDE = {
  supplier: { select: { id: true, name: true, code: true } },
  variant: {
    select: {
      id: true,
      sku: true,
      product: { select: { id: true, name: true } },
    },
  },
} satisfies Prisma.SupplierVariantLinkInclude;

export type SupplierVariantLinkRow = SupplierVariantLink & {
  supplier: { id: string; name: string; code: string | null };
  variant: {
    id: string;
    sku: string;
    product: { id: string; name: string };
  };
};

export type SupplierWithLinkedCustomer = Supplier & {
  readonly linkedCustomerId: string | null;
};

type SupplierWriteData = {
  code?: string | null;
  name?: string;
  vatNumber?: string | null;
  taxCode?: string | null;
  email?: string | null;
  pec?: string | null;
  phone?: string | null;
  contactName?: string | null;
  website?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  province?: string | null;
  postalCode?: string | null;
  countryCode?: string | null;
  paymentTerms?: string | null;
  supplierDiscount?: string | null;
  defaultVatCodeId?: string | null;
  transportResponsible?: string | null;
  freightTerms?: string | null;
  documentCreationNote?: string | null;
  notes?: string | null;
};

@Injectable()
export class SuppliersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customers: CustomersService,
  ) {}

  /** Elenco completo non paginato (compatibilità select inline ordini/arrivi). */
  listAll(tenantId: string): Promise<Supplier[]> {
    return this.prisma.supplier.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
    });
  }

  async list(tenantId: string, query: ListSuppliersQueryDto): Promise<Paginated<Supplier>> {
    const where: Prisma.SupplierWhereInput = {
      tenantId,
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { code: { contains: query.search, mode: 'insensitive' as const } },
              { vatNumber: { contains: query.search, mode: 'insensitive' as const } },
              { email: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.supplier.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.supplier.count({ where }),
    ]);

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async getById(tenantId: string, id: string): Promise<SupplierWithLinkedCustomer> {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id, tenantId },
    });
    if (!supplier) {
      throw new NotFoundException('Fornitore non trovato');
    }
    return this.withLinkedCustomerId(supplier);
  }

  async create(tenantId: string, dto: CreateSupplierDto): Promise<SupplierWithLinkedCustomer> {
    const data = this.normalizeWrite(dto);
    if (!data.name) {
      throw new UnprocessableEntityException('Il nome fornitore è obbligatorio');
    }
    if (!data.code) {
      data.code = await this.allocateNextSupplierCode(tenantId);
    }
    await this.assertCodeAvailable(tenantId, data.code ?? null);
    await this.assertVatCodeBelongsToTenant(tenantId, data.defaultVatCodeId);
    const supplier = await this.prisma.supplier.create({
      data: { tenantId, ...data, name: data.name },
    });
    if (dto.alsoCustomer) {
      await this.customers.linkCustomerToSupplier(tenantId, supplier.id, true);
    }
    return this.getById(tenantId, supplier.id);
  }

  async previewNextCode(tenantId: string): Promise<{ readonly code: string }> {
    const code = await this.allocateNextSupplierCode(tenantId);
    return { code };
  }

  async update(tenantId: string, id: string, dto: UpdateSupplierDto): Promise<SupplierWithLinkedCustomer> {
    await this.getById(tenantId, id);
    const data = this.normalizeWrite(dto);
    if (data.code !== undefined) {
      await this.assertCodeAvailable(tenantId, data.code, id);
    }
    await this.assertVatCodeBelongsToTenant(tenantId, data.defaultVatCodeId);
    await this.prisma.supplier.update({
      where: { id },
      data,
    });
    if (dto.alsoCustomer === true) {
      await this.customers.linkCustomerToSupplier(tenantId, id, true);
    } else if (dto.alsoCustomer === false) {
      await this.customers.linkCustomerToSupplier(tenantId, id, false);
    }
    return this.getById(tenantId, id);
  }

  async delete(tenantId: string, id: string): Promise<void> {
    await this.getById(tenantId, id);

    const [orderCount, documentCount] = await this.prisma.$transaction([
      this.prisma.supplierOrder.count({ where: { tenantId, supplierId: id } }),
      this.prisma.document.count({ where: { tenantId, supplierId: id } }),
    ]);

    if (orderCount > 0 || documentCount > 0) {
      throw new ConflictException(
        'Il fornitore è collegato a ordini o documenti: non può essere eliminato.',
      );
    }

    await this.prisma.supplier.delete({ where: { id } });
  }

  listVariantLinksBySupplier(tenantId: string, supplierId: string): Promise<SupplierVariantLinkRow[]> {
    return this.prisma.supplierVariantLink.findMany({
      where: { tenantId, supplierId },
      include: SUPPLIER_VARIANT_LINK_INCLUDE,
      orderBy: [{ variant: { sku: 'asc' } }],
    }) as Promise<SupplierVariantLinkRow[]>;
  }

  async listVariantLinksByProduct(
    tenantId: string,
    productId: string,
  ): Promise<SupplierVariantLinkRow[]> {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, tenantId },
      select: { id: true },
    });
    if (!product) {
      throw new NotFoundException('Prodotto non trovato');
    }

    return this.prisma.supplierVariantLink.findMany({
      where: { tenantId, variant: { productId } },
      include: SUPPLIER_VARIANT_LINK_INCLUDE,
      orderBy: [{ variant: { sku: 'asc' } }, { supplier: { name: 'asc' } }],
    }) as Promise<SupplierVariantLinkRow[]>;
  }

  async upsertVariantLink(
    tenantId: string,
    dto: UpsertSupplierVariantLinkDto,
  ): Promise<SupplierVariantLinkRow> {
    await this.getById(tenantId, dto.supplierId);

    const variant = await this.prisma.productVariant.findFirst({
      where: { id: dto.variantId, tenantId },
    });
    if (!variant) {
      throw new NotFoundException('Variante non trovata');
    }

    const supplierSku = dto.supplierSku?.trim() || null;
    const isPreferred = dto.isPreferred ?? false;

    const link = await this.prisma.$transaction(async (tx) => {
      if (isPreferred) {
        await tx.supplierVariantLink.updateMany({
          where: { tenantId, variantId: dto.variantId, isPreferred: true },
          data: { isPreferred: false },
        });
      }

      return tx.supplierVariantLink.upsert({
        where: {
          tenantId_supplierId_variantId: {
            tenantId,
            supplierId: dto.supplierId,
            variantId: dto.variantId,
          },
        },
        create: {
          tenantId,
          supplierId: dto.supplierId,
          variantId: dto.variantId,
          supplierSku,
          isPreferred,
          lastPurchasePriceMinor: dto.lastPurchasePriceMinor ?? null,
          minOrderQuantity: dto.minOrderQuantity ?? null,
          currency: dto.currency?.trim().toUpperCase() || 'EUR',
        },
        update: {
          supplierSku,
          ...(dto.isPreferred !== undefined ? { isPreferred } : {}),
          ...(dto.lastPurchasePriceMinor !== undefined
            ? { lastPurchasePriceMinor: dto.lastPurchasePriceMinor }
            : {}),
          ...(dto.minOrderQuantity !== undefined
            ? { minOrderQuantity: dto.minOrderQuantity }
            : {}),
          ...(dto.currency !== undefined
            ? { currency: dto.currency.trim().toUpperCase() }
            : {}),
        },
        include: SUPPLIER_VARIANT_LINK_INCLUDE,
      });
    });

    return link as SupplierVariantLinkRow;
  }

  async deleteVariantLink(tenantId: string, linkId: string): Promise<void> {
    const link = await this.prisma.supplierVariantLink.findFirst({
      where: { id: linkId, tenantId },
    });
    if (!link) {
      throw new NotFoundException('Collegamento fornitore-articolo non trovato');
    }
    await this.prisma.supplierVariantLink.delete({ where: { id: linkId } });
  }

  private normalizeWrite(
    dto: CreateSupplierDto | UpdateSupplierDto,
  ): Partial<SupplierWriteData> {
    const result: Partial<SupplierWriteData> = {};

    if ('name' in dto && dto.name !== undefined) {
      const trimmed = dto.name.trim();
      if (!trimmed) {
        throw new UnprocessableEntityException('Il nome fornitore è obbligatorio');
      }
      result.name = trimmed;
    }

    if ('code' in dto && dto.code !== undefined) {
      const trimmed = dto.code.trim();
      result.code = trimmed ? trimmed : null;
    }

    const optionalStrings: (keyof SupplierWriteData)[] = [
      'vatNumber',
      'taxCode',
      'email',
      'pec',
      'phone',
      'contactName',
      'website',
      'addressLine1',
      'addressLine2',
      'city',
      'province',
      'postalCode',
      'countryCode',
      'paymentTerms',
      'supplierDiscount',
      'transportResponsible',
      'freightTerms',
      'documentCreationNote',
      'notes',
    ];

    for (const key of optionalStrings) {
      const value = dto[key as keyof typeof dto];
      if (value !== undefined) {
        const trimmed = typeof value === 'string' ? value.trim() : value;
        (result as Record<string, string | null | undefined>)[key] = trimmed
          ? (trimmed as string)
          : null;
      }
    }

    if ('defaultVatCodeId' in dto && dto.defaultVatCodeId !== undefined) {
      result.defaultVatCodeId = dto.defaultVatCodeId;
    }

    return result;
  }

  /** Il Codice IVA predefinito, se impostato, deve appartenere al tenant (isolamento). */
  private async assertVatCodeBelongsToTenant(
    tenantId: string,
    vatCodeId: string | null | undefined,
  ): Promise<void> {
    if (!vatCodeId) {
      return;
    }
    const found = await this.prisma.vatCode.findFirst({
      where: { id: vatCodeId, tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!found) {
      throw new UnprocessableEntityException('Il Codice IVA selezionato non esiste o non è più disponibile.');
    }
  }

  private async assertCodeAvailable(
    tenantId: string,
    code: string | null | undefined,
    excludeId?: string,
  ): Promise<void> {
    if (!code) {
      return;
    }
    const existing = await this.prisma.supplier.findFirst({
      where: {
        tenantId,
        code,
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(`Codice fornitore "${code}" già in uso`);
    }
  }

  private async allocateNextSupplierCode(tenantId: string): Promise<string> {
    const rows = await this.prisma.supplier.findMany({
      where: { tenantId, code: { not: null } },
      select: { code: true },
    });
    let candidate = nextNumericSupplierCode(
      rows.map((row) => row.code ?? '').filter(Boolean),
    );
    for (let attempt = 0; attempt < 20; attempt++) {
      const taken = await this.prisma.supplier.findFirst({
        where: { tenantId, code: candidate },
        select: { id: true },
      });
      if (!taken) {
        return candidate;
      }
      const numeric = Number.parseInt(candidate, 10);
      candidate = String(numeric + 1).padStart(SUPPLIER_NUMERIC_CODE_PAD, '0');
    }
    throw new ConflictException('Impossibile generare un codice fornitore progressivo univoco');
  }

  private async withLinkedCustomerId(supplier: Supplier): Promise<SupplierWithLinkedCustomer> {
    const linked = await this.prisma.customer.findFirst({
      where: { linkedSupplierId: supplier.id },
      select: { id: true },
    });
    return { ...supplier, linkedCustomerId: linked?.id ?? null };
  }
}
