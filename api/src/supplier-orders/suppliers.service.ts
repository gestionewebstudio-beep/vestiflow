import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma, type SupplierVariantLink } from '@prisma/client';

import type { Paginated } from '../common/dto/pagination.dto';
import {
  SUPPLIER_PARTY_INCLUDE,
  toSupplierView,
  type SupplierView,
  type SupplierWithParty,
} from '../common/party/party-views';
import { CustomersService } from '../customers/customers.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateSupplierDto } from './dto/create-supplier.dto';
import type { ListSuppliersQueryDto } from './dto/list-suppliers.query.dto';
import type { UpdateSupplierDto } from './dto/update-supplier.dto';
import type { UpsertSupplierVariantLinkDto } from './dto/upsert-supplier-variant-link.dto';
import { nextNumericSupplierCode, SUPPLIER_NUMERIC_CODE_PAD } from './supplier-code.util';

const SUPPLIER_VARIANT_LINK_INCLUDE = {
  supplier: { select: { id: true, code: true, party: { select: { companyName: true, firstName: true, lastName: true } } } },
  variant: {
    select: {
      id: true,
      sku: true,
      product: { select: { id: true, name: true } },
    },
  },
} satisfies Prisma.SupplierVariantLinkInclude;

type SupplierVariantLinkRawRow = Prisma.SupplierVariantLinkGetPayload<{
  include: typeof SUPPLIER_VARIANT_LINK_INCLUDE;
}>;

export type SupplierVariantLinkRow = SupplierVariantLink & {
  supplier: { id: string; name: string; code: string | null };
  variant: {
    id: string;
    sku: string | null;
    product: { id: string; name: string };
  };
};

type PartyWriteData = {
  companyName?: string | null;
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
  notes?: string | null;
};

type SupplierRoleWriteData = {
  code?: string | null;
  paymentMethod?: string | null;
  paymentTerms?: string | null;
  supplierDiscount?: string | null;
  defaultVatCodeId?: string | null;
  transportResponsible?: string | null;
  freightTerms?: string | null;
  documentCreationAlert?: string | null;
  documentCreationNote?: string | null;
};

/**
 * Anagrafica fornitori come RUOLO del soggetto canonico (Party): i dati
 * comuni vivono una sola volta sul soggetto, qui restano i dati commerciali.
 * La spunta "È anche cliente" aggiunge/riattiva il ruolo cliente sullo
 * STESSO soggetto senza copiare nulla; la disattivazione esclude il ruolo
 * dai nuovi utilizzi senza eliminare dati, documenti o storico.
 */
@Injectable()
export class SuppliersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customers: CustomersService,
  ) {}

  /** Elenco per i select di ordini/arrivi merce: SOLO ruoli attivi. */
  async listAll(tenantId: string): Promise<SupplierView[]> {
    const rows = await this.prisma.supplier.findMany({
      where: { tenantId, isActive: true },
      include: SUPPLIER_PARTY_INCLUDE,
      orderBy: [{ party: { companyName: 'asc' } }, { party: { lastName: 'asc' } }],
    });
    return rows.map(toSupplierView);
  }

  async list(tenantId: string, query: ListSuppliersQueryDto): Promise<Paginated<SupplierView>> {
    const search = query.search?.trim();
    const where: Prisma.SupplierWhereInput = {
      tenantId,
      ...(query.active ? { isActive: true } : {}),
      ...(search
        ? {
            OR: [
              { code: { contains: search, mode: 'insensitive' } },
              { party: { companyName: { contains: search, mode: 'insensitive' } } },
              { party: { firstName: { contains: search, mode: 'insensitive' } } },
              { party: { lastName: { contains: search, mode: 'insensitive' } } },
              { party: { vatNumber: { contains: search, mode: 'insensitive' } } },
              { party: { email: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.supplier.findMany({
        where,
        include: SUPPLIER_PARTY_INCLUDE,
        orderBy: [{ party: { companyName: 'asc' } }, { party: { lastName: 'asc' } }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.supplier.count({ where }),
    ]);

    return {
      items: items.map(toSupplierView),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async getById(tenantId: string, id: string): Promise<SupplierView> {
    return toSupplierView(await this.getRowById(tenantId, id));
  }

  async create(tenantId: string, dto: CreateSupplierDto): Promise<SupplierView> {
    const partyData = this.normalizePartyWrite(dto);
    const roleData = this.normalizeRoleWrite(dto);
    if (!partyData.companyName) {
      throw new UnprocessableEntityException('Il nome fornitore è obbligatorio');
    }
    await this.assertVatCodeBelongsToTenant(tenantId, roleData.defaultVatCodeId);

    const createdId = await this.prisma.$transaction(async (tx) => {
      if (roleData.code) {
        await this.assertCodeAvailable(tx, tenantId, roleData.code);
      }
      const code = roleData.code ?? (await this.allocateNextSupplierCodeTx(tx, tenantId));

      const party = await tx.party.create({
        data: { tenantId, ...partyData },
        select: { id: true },
      });
      const supplier = await tx.supplier.create({
        data: { tenantId, partyId: party.id, ...roleData, code },
        select: { id: true },
      });
      return supplier.id;
    });

    if (dto.alsoCustomer) {
      await this.customers.setCustomerRoleForSupplier(tenantId, createdId, true);
    }
    return this.getById(tenantId, createdId);
  }

  async previewNextCode(tenantId: string): Promise<{ readonly code: string }> {
    const code = await this.allocateNextSupplierCode(tenantId);
    return { code };
  }

  async update(tenantId: string, id: string, dto: UpdateSupplierDto): Promise<SupplierView> {
    const existing = await this.getRowById(tenantId, id);
    const partyData = this.normalizePartyWrite(dto);
    const roleData = this.normalizeRoleWrite(dto);
    if (partyData.companyName === null) {
      throw new UnprocessableEntityException('Il nome fornitore è obbligatorio');
    }
    await this.assertVatCodeBelongsToTenant(tenantId, roleData.defaultVatCodeId);

    await this.prisma.$transaction(async (tx) => {
      if (roleData.code !== undefined && roleData.code !== existing.code) {
        await this.assertCodeAvailable(tx, tenantId, roleData.code, id);
      }
      await tx.supplier.update({ where: { id }, data: roleData });
      if (Object.keys(partyData).length > 0) {
        await tx.party.update({ where: { id: existing.partyId }, data: partyData });
      }
    });

    if (dto.alsoCustomer === true) {
      await this.customers.setCustomerRoleForSupplier(tenantId, id, true);
    } else if (dto.alsoCustomer === false) {
      await this.customers.setCustomerRoleForSupplier(tenantId, id, false);
    }
    return this.getById(tenantId, id);
  }

  /**
   * Elimina il RUOLO fornitore (solo se mai usato in ordini/documenti).
   * Il soggetto resta se ha ancora il ruolo cliente; i ruoli disattivati
   * si gestiscono invece con isActive=false (che non tocca lo storico).
   */
  async delete(tenantId: string, id: string): Promise<void> {
    const supplier = await this.getRowById(tenantId, id);

    const [orderCount, documentCount] = await this.prisma.$transaction([
      this.prisma.supplierOrder.count({ where: { tenantId, supplierId: id } }),
      this.prisma.document.count({ where: { tenantId, supplierId: id } }),
    ]);

    if (orderCount > 0 || documentCount > 0) {
      throw new ConflictException(
        'Il fornitore è collegato a ordini o documenti: non può essere eliminato.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.supplier.delete({ where: { id } });
      if (!supplier.party.customerRole) {
        await tx.party.delete({ where: { id: supplier.partyId } });
      }
    });
  }

  listVariantLinksBySupplier(tenantId: string, supplierId: string): Promise<SupplierVariantLinkRow[]> {
    return this.prisma.supplierVariantLink
      .findMany({
        where: { tenantId, supplierId },
        include: SUPPLIER_VARIANT_LINK_INCLUDE,
        orderBy: [{ variant: { sku: 'asc' } }],
      })
      .then((rows) => rows.map((row) => this.toVariantLinkRow(row)));
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

    const rows = await this.prisma.supplierVariantLink.findMany({
      where: { tenantId, variant: { productId } },
      include: SUPPLIER_VARIANT_LINK_INCLUDE,
      orderBy: [{ variant: { sku: 'asc' } }, { supplier: { party: { companyName: 'asc' } } }],
    });
    return rows.map((row) => this.toVariantLinkRow(row));
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

    return this.toVariantLinkRow(link);
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

  private toVariantLinkRow(row: SupplierVariantLinkRawRow): SupplierVariantLinkRow {
    const { supplier, ...rest } = row;
    const name =
      supplier.party.companyName?.trim() ||
      [supplier.party.firstName, supplier.party.lastName]
        .map((value) => value?.trim() ?? '')
        .filter(Boolean)
        .join(' ');
    return {
      ...rest,
      supplier: { id: supplier.id, name, code: supplier.code },
    };
  }

  private async getRowById(tenantId: string, id: string): Promise<SupplierWithParty> {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id, tenantId },
      include: SUPPLIER_PARTY_INCLUDE,
    });
    if (!supplier) {
      throw new NotFoundException('Fornitore non trovato');
    }
    return supplier;
  }

  private normalizePartyWrite(dto: CreateSupplierDto | UpdateSupplierDto): PartyWriteData {
    const trim = (value: string | undefined): string | null | undefined => {
      if (value === undefined) {
        return undefined;
      }
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : null;
    };

    const result: PartyWriteData = {};
    const assign = (key: keyof PartyWriteData, value: string | undefined): void => {
      const normalized = trim(value);
      if (normalized !== undefined) {
        result[key] = normalized;
      }
    };

    // Il "nome fornitore" del gestionale è la ragione sociale del soggetto.
    assign('companyName', dto.name);
    assign('vatNumber', dto.vatNumber);
    assign('taxCode', dto.taxCode);
    assign('email', dto.email);
    assign('pec', dto.pec);
    assign('phone', dto.phone);
    assign('contactName', dto.contactName);
    assign('website', dto.website);
    assign('addressLine1', dto.addressLine1);
    assign('addressLine2', dto.addressLine2);
    assign('city', dto.city);
    assign('province', dto.province);
    assign('postalCode', dto.postalCode);
    assign('countryCode', dto.countryCode);
    assign('notes', dto.notes);
    return result;
  }

  private normalizeRoleWrite(dto: CreateSupplierDto | UpdateSupplierDto): SupplierRoleWriteData {
    const trim = (value: string | undefined): string | null | undefined => {
      if (value === undefined) {
        return undefined;
      }
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : null;
    };

    const result: SupplierRoleWriteData = {};
    const assign = (key: Exclude<keyof SupplierRoleWriteData, 'defaultVatCodeId'>, value: string | undefined): void => {
      const normalized = trim(value);
      if (normalized !== undefined) {
        result[key] = normalized;
      }
    };

    assign('code', dto.code);
    assign('paymentMethod', dto.paymentMethod);
    assign('paymentTerms', dto.paymentTerms);
    assign('supplierDiscount', dto.supplierDiscount);
    assign('transportResponsible', dto.transportResponsible);
    assign('freightTerms', dto.freightTerms);
    assign('documentCreationAlert', dto.documentCreationAlert);
    assign('documentCreationNote', dto.documentCreationNote);

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
    tx: Prisma.TransactionClient,
    tenantId: string,
    code: string | null | undefined,
    excludeId?: string,
  ): Promise<void> {
    if (!code) {
      return;
    }
    const existing = await tx.supplier.findFirst({
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

  private async allocateNextSupplierCodeTx(
    tx: Prisma.TransactionClient,
    tenantId: string,
  ): Promise<string> {
    const rows = await tx.supplier.findMany({
      where: { tenantId, code: { not: null } },
      select: { code: true },
    });
    return nextNumericSupplierCode(rows.map((row) => row.code ?? '').filter(Boolean));
  }
}
