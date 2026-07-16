import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import type { Paginated } from '../common/dto/pagination.dto';
import {
  CUSTOMER_PARTY_INCLUDE,
  toCustomerView,
  type CustomerView,
  type CustomerWithParty,
} from '../common/party/party-views';
import { PrismaService } from '../prisma/prisma.service';
import { nextNumericSupplierCode } from '../supplier-orders/supplier-code.util';
import type { CreateCustomerDto } from './dto/create-customer.dto';
import type { ListCustomersQueryDto } from './dto/list-customers.query.dto';
import type { UpdateCustomerDto } from './dto/update-customer.dto';

type PartyWriteData = {
  companyName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  vatNumber?: string | null;
  taxCode?: string | null;
  email?: string | null;
  pec?: string | null;
  phone?: string | null;
  website?: string | null;
  contactName?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  province?: string | null;
  postalCode?: string | null;
  countryCode?: string | null;
  notes?: string | null;
};

type CustomerRoleWriteData = {
  code?: string | null;
  customerDiscount?: string | null;
  paymentMethod?: string | null;
  paymentTerms?: string | null;
  transportResponsible?: string | null;
  documentCreationAlert?: string | null;
  documentCreationNote?: string | null;
  commercialNotes?: string | null;
};

/** Campi del soggetto owned da Shopify per i clienti sincronizzati (read-only). */
const SHOPIFY_OWNED_PARTY_FIELDS = [
  'firstName',
  'lastName',
  'email',
  'phone',
  'notes',
  'addressLine1',
  'addressLine2',
  'city',
  'province',
  'postalCode',
  'countryCode',
] as const satisfies readonly (keyof PartyWriteData)[];

/**
 * Anagrafica clienti come RUOLO del soggetto canonico (Party): i dati comuni
 * vivono una sola volta sul soggetto, qui restano i dati commerciali.
 * La spunta "È anche fornitore" aggiunge/riattiva il ruolo fornitore sullo
 * STESSO soggetto senza copiare nulla; la disattivazione esclude il ruolo
 * dai nuovi utilizzi senza eliminare dati, documenti o storico.
 */
@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Elenco completo dei ruoli attivi (select inline Ordine cliente), speculare a suppliers/all. */
  async listAll(tenantId: string): Promise<CustomerView[]> {
    const rows = await this.prisma.customer.findMany({
      where: { tenantId, isActive: true },
      include: CUSTOMER_PARTY_INCLUDE,
      orderBy: [
        { party: { lastName: 'asc' } },
        { party: { firstName: 'asc' } },
        { party: { companyName: 'asc' } },
      ],
    });
    return rows.map(toCustomerView);
  }

  async list(tenantId: string, query: ListCustomersQueryDto): Promise<Paginated<CustomerView>> {
    const search = query.search?.trim();
    const where: Prisma.CustomerWhereInput = {
      tenantId,
      ...(query.active ? { isActive: true } : {}),
      ...(search
        ? {
            OR: [
              { code: { contains: search, mode: 'insensitive' } },
              { party: { firstName: { contains: search, mode: 'insensitive' } } },
              { party: { lastName: { contains: search, mode: 'insensitive' } } },
              { party: { companyName: { contains: search, mode: 'insensitive' } } },
              { party: { email: { contains: search, mode: 'insensitive' } } },
              { party: { vatNumber: { contains: search, mode: 'insensitive' } } },
              { party: { phone: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.customer.findMany({
        where,
        include: CUSTOMER_PARTY_INCLUDE,
        orderBy: [
          { party: { lastName: 'asc' } },
          { party: { firstName: 'asc' } },
          { party: { companyName: 'asc' } },
        ],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.customer.count({ where }),
    ]);

    return {
      items: items.map(toCustomerView),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async getById(tenantId: string, id: string): Promise<CustomerView> {
    return toCustomerView(await this.getRowById(tenantId, id));
  }

  async create(tenantId: string, dto: CreateCustomerDto): Promise<CustomerView> {
    const partyData = this.normalizePartyWrite(dto);
    const roleData = this.normalizeRoleWrite(dto);
    this.assertIdentityPresent(partyData);

    const created = await this.prisma.$transaction(async (tx) => {
      if (roleData.code) {
        await this.assertCodeAvailable(tx, tenantId, roleData.code);
      }
      const code = roleData.code ?? (await this.allocateNextCustomerCode(tx, tenantId));

      const party = await tx.party.create({
        data: { tenantId, ...partyData },
        select: { id: true },
      });
      const customer = await tx.customer.create({
        data: { tenantId, partyId: party.id, ...roleData, code },
        select: { id: true, partyId: true },
      });

      if (dto.alsoSupplier) {
        await this.setSupplierRoleTx(tx, tenantId, customer, true);
      }

      return customer.id;
    });

    return this.getById(tenantId, created);
  }

  async update(tenantId: string, id: string, dto: UpdateCustomerDto): Promise<CustomerView> {
    const existing = await this.getRowById(tenantId, id);
    const partyData = this.normalizePartyWrite(dto, existing.shopifyCustomerId != null);
    const roleData = this.normalizeRoleWrite(dto);
    this.assertIdentityPresent({
      companyName: existing.party.companyName,
      firstName: existing.party.firstName,
      lastName: existing.party.lastName,
      ...partyData,
    });

    await this.prisma.$transaction(async (tx) => {
      if (roleData.code !== undefined && roleData.code !== existing.code) {
        await this.assertCodeAvailable(tx, tenantId, roleData.code, id);
      }

      await tx.customer.update({ where: { id }, data: roleData });
      if (Object.keys(partyData).length > 0) {
        await tx.party.update({ where: { id: existing.partyId }, data: partyData });
      }

      if (dto.alsoSupplier === true) {
        await this.setSupplierRoleTx(tx, tenantId, existing, true);
      } else if (dto.alsoSupplier === false) {
        await this.setSupplierRoleTx(tx, tenantId, existing, false);
      }
    });

    return this.getById(tenantId, id);
  }

  /** Prossimo codice cliente progressivo (anteprima nel form). */
  async previewNextCode(tenantId: string): Promise<{ readonly code: string }> {
    const code = await this.allocateNextCustomerCode(this.prisma, tenantId);
    return { code };
  }

  /**
   * Attiva/disattiva il ruolo CLIENTE del soggetto di un fornitore
   * (spunta "È anche cliente" nella scheda fornitore). Nessuna copia dati:
   * il ruolo si aggancia allo stesso soggetto; la disattivazione conserva
   * la riga (e quindi documenti e storico), escludendola dai nuovi utilizzi.
   */
  async setCustomerRoleForSupplier(
    tenantId: string,
    supplierId: string,
    enabled: boolean,
  ): Promise<CustomerView | null> {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: supplierId, tenantId },
      include: { party: { include: { customerRole: { select: { id: true } } } } },
    });
    if (!supplier) {
      throw new NotFoundException('Fornitore non trovato');
    }

    const existingRole = supplier.party.customerRole;

    if (!enabled) {
      if (!existingRole) {
        return null;
      }
      await this.prisma.customer.update({
        where: { id: existingRole.id },
        data: { isActive: false },
      });
      return this.getById(tenantId, existingRole.id);
    }

    if (existingRole) {
      await this.prisma.customer.update({
        where: { id: existingRole.id },
        data: { isActive: true },
      });
      return this.getById(tenantId, existingRole.id);
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const code = await this.allocateNextCustomerCode(tx, tenantId);
      return tx.customer.create({
        data: { tenantId, partyId: supplier.partyId, code },
        select: { id: true },
      });
    });
    return this.getById(tenantId, created.id);
  }

  private async getRowById(tenantId: string, id: string): Promise<CustomerWithParty> {
    const customer = await this.prisma.customer.findFirst({
      where: { id, tenantId },
      include: CUSTOMER_PARTY_INCLUDE,
    });
    if (!customer) {
      throw new NotFoundException('Cliente non trovato');
    }
    return customer;
  }

  /**
   * Attiva/disattiva il ruolo FORNITORE del soggetto del cliente
   * (spunta "È anche fornitore"). Attivazione senza copia dati; la
   * disattivazione conserva riga, documenti e collegamenti storici.
   */
  private async setSupplierRoleTx(
    tx: Prisma.TransactionClient,
    tenantId: string,
    customer: { readonly partyId: string },
    enabled: boolean,
  ): Promise<void> {
    const existingRole = await tx.supplier.findUnique({
      where: { partyId: customer.partyId },
      select: { id: true, isActive: true },
    });

    if (!enabled) {
      if (existingRole && existingRole.isActive) {
        await tx.supplier.update({
          where: { id: existingRole.id },
          data: { isActive: false },
        });
      }
      return;
    }

    if (existingRole) {
      if (!existingRole.isActive) {
        await tx.supplier.update({
          where: { id: existingRole.id },
          data: { isActive: true },
        });
      }
      return;
    }

    const code = await this.allocateNextSupplierCode(tx, tenantId);
    await tx.supplier.create({
      data: { tenantId, partyId: customer.partyId, code },
    });
  }

  private async allocateNextCustomerCode(
    tx: Prisma.TransactionClient | PrismaService,
    tenantId: string,
  ): Promise<string> {
    const rows = await tx.customer.findMany({
      where: { tenantId, code: { not: null } },
      select: { code: true },
    });
    return nextNumericSupplierCode(rows.map((row) => row.code ?? '').filter(Boolean));
  }

  private async allocateNextSupplierCode(
    tx: Prisma.TransactionClient,
    tenantId: string,
  ): Promise<string> {
    const rows = await tx.supplier.findMany({
      where: { tenantId, code: { not: null } },
      select: { code: true },
    });
    return nextNumericSupplierCode(rows.map((row) => row.code ?? '').filter(Boolean));
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
    const existing = await tx.customer.findFirst({
      where: {
        tenantId,
        code,
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (existing) {
      throw new UnprocessableEntityException(`Codice cliente "${code}" già in uso`);
    }
  }

  /** Denominazione obbligatoria: ragione sociale oppure nome e cognome. */
  private assertIdentityPresent(party: PartyWriteData): void {
    const hasCompany = Boolean(party.companyName?.trim());
    const hasPerson = Boolean(party.firstName?.trim()) && Boolean(party.lastName?.trim());
    if (!hasCompany && !hasPerson) {
      throw new UnprocessableEntityException(
        'Indica la ragione sociale oppure nome e cognome del cliente',
      );
    }
  }

  private normalizePartyWrite(
    dto: CreateCustomerDto | UpdateCustomerDto,
    shopifyOwned = false,
  ): PartyWriteData {
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

    assign('companyName', dto.companyName);
    assign('firstName', dto.firstName);
    assign('lastName', dto.lastName);
    assign('vatNumber', dto.vatNumber);
    assign('taxCode', dto.taxCode);
    assign('email', dto.email);
    assign('pec', dto.pec);
    assign('phone', dto.phone);
    assign('website', dto.website);
    assign('contactName', dto.contactName);
    assign('addressLine1', dto.addressLine1);
    assign('addressLine2', dto.addressLine2);
    assign('city', dto.city);
    assign('province', dto.province);
    assign('postalCode', dto.postalCode);
    assign('countryCode', dto.countryCode);
    assign('notes', dto.notes);

    if (shopifyOwned) {
      for (const field of SHOPIFY_OWNED_PARTY_FIELDS) {
        delete result[field];
      }
    }

    return result;
  }

  private normalizeRoleWrite(dto: CreateCustomerDto | UpdateCustomerDto): CustomerRoleWriteData {
    const trim = (value: string | undefined): string | null | undefined => {
      if (value === undefined) {
        return undefined;
      }
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : null;
    };

    const result: CustomerRoleWriteData = {};
    const assign = (key: keyof CustomerRoleWriteData, value: string | undefined): void => {
      const normalized = trim(value);
      if (normalized !== undefined) {
        result[key] = normalized;
      }
    };

    assign('code', dto.code);
    assign('customerDiscount', dto.customerDiscount);
    assign('paymentMethod', dto.paymentMethod);
    assign('paymentTerms', dto.paymentTerms);
    assign('transportResponsible', dto.transportResponsible);
    assign('documentCreationAlert', dto.documentCreationAlert);
    assign('documentCreationNote', dto.documentCreationNote);
    assign('commercialNotes', dto.commercialNotes);
    return result;
  }
}
