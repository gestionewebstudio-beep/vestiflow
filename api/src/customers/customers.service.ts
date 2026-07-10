import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma, type Customer } from '@prisma/client';

import type { Paginated } from '../common/dto/pagination.dto';
import { PrismaService } from '../prisma/prisma.service';
import { nextNumericSupplierCode } from '../supplier-orders/supplier-code.util';
import {
  customerNamesFromSupplier,
  supplierNameFromCustomer,
} from './customer-supplier-link.util';
import type { CreateCustomerDto } from './dto/create-customer.dto';
import type { ListCustomersQueryDto } from './dto/list-customers.query.dto';
import type { UpdateCustomerDto } from './dto/update-customer.dto';

type CustomerWriteData = {
  firstName?: string;
  lastName?: string;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  province?: string | null;
  postalCode?: string | null;
  countryCode?: string | null;
  companyName?: string | null;
  vatNumber?: string | null;
  customerDiscount?: string | null;
  paymentTerms?: string | null;
  commercialNotes?: string | null;
};

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, query: ListCustomersQueryDto): Promise<Paginated<Customer>> {
    const where: Prisma.CustomerWhereInput = {
      tenantId,
      ...(query.search
        ? {
            OR: [
              { firstName: { contains: query.search, mode: 'insensitive' } },
              { lastName: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
              { companyName: { contains: query.search, mode: 'insensitive' as const } },
              { vatNumber: { contains: query.search, mode: 'insensitive' as const } },
              { phone: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.customer.findMany({
        where,
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.customer.count({ where }),
    ]);

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async getById(tenantId: string, id: string): Promise<Customer> {
    const customer = await this.prisma.customer.findFirst({
      where: { id, tenantId },
    });
    if (!customer) {
      throw new NotFoundException('Cliente non trovato');
    }
    return customer;
  }

  async create(tenantId: string, dto: CreateCustomerDto): Promise<Customer> {
    const data = this.normalizeWrite(dto);
    if (!data.firstName || !data.lastName) {
      throw new UnprocessableEntityException('Nome e cognome sono obbligatori');
    }
    const firstName = data.firstName;
    const lastName = data.lastName;

    return this.prisma.$transaction(async (tx) => {
      const customer = await tx.customer.create({
        data: {
          tenantId,
          firstName,
          lastName,
          email: data.email ?? null,
          phone: data.phone ?? null,
          notes: data.notes ?? null,
          addressLine1: data.addressLine1 ?? null,
          addressLine2: data.addressLine2 ?? null,
          city: data.city ?? null,
          province: data.province ?? null,
          postalCode: data.postalCode ?? null,
          countryCode: data.countryCode ?? null,
          companyName: data.companyName ?? null,
          vatNumber: data.vatNumber ?? null,
          customerDiscount: data.customerDiscount ?? null,
          paymentTerms: data.paymentTerms ?? null,
          commercialNotes: data.commercialNotes ?? null,
        },
      });

      if (dto.alsoSupplier) {
        return this.linkSupplierToCustomer(tx, tenantId, customer);
      }

      return customer;
    });
  }

  async update(tenantId: string, id: string, dto: UpdateCustomerDto): Promise<Customer> {
    const existing = await this.getById(tenantId, id);
    const data = this.normalizeWrite(dto, existing.shopifyCustomerId != null);

    return this.prisma.$transaction(async (tx) => {
      const customer = await tx.customer.update({
        where: { id },
        data,
      });

      if (dto.alsoSupplier === true && !customer.linkedSupplierId) {
        return this.linkSupplierToCustomer(tx, tenantId, customer);
      }

      if (dto.alsoSupplier === false && customer.linkedSupplierId) {
        return tx.customer.update({
          where: { id },
          data: { linkedSupplierId: null },
        });
      }

      return customer;
    });
  }

  /** Crea o collega un cliente a un fornitore esistente (ruolo duale da scheda fornitore). */
  async linkCustomerToSupplier(
    tenantId: string,
    supplierId: string,
    enabled: boolean,
  ): Promise<Customer | null> {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: supplierId, tenantId },
    });
    if (!supplier) {
      throw new NotFoundException('Fornitore non trovato');
    }

    const existingLinked = await this.prisma.customer.findFirst({
      where: { tenantId, linkedSupplierId: supplierId },
    });

    if (!enabled) {
      if (!existingLinked) {
        return null;
      }
      return this.prisma.customer.update({
        where: { id: existingLinked.id },
        data: { linkedSupplierId: null },
      });
    }

    if (existingLinked) {
      return existingLinked;
    }

    const names = customerNamesFromSupplier(supplier);

    return this.prisma.$transaction(async (tx) => {
      const customer = await tx.customer.create({
        data: {
          tenantId,
          firstName: names.firstName,
          lastName: names.lastName,
          email: supplier.email,
          phone: supplier.phone,
          companyName: supplier.name,
          vatNumber: supplier.vatNumber,
          paymentTerms: supplier.paymentTerms,
          customerDiscount: supplier.supplierDiscount,
          addressLine1: supplier.addressLine1,
          addressLine2: supplier.addressLine2,
          city: supplier.city,
          province: supplier.province,
          postalCode: supplier.postalCode,
          countryCode: supplier.countryCode,
          linkedSupplierId: supplierId,
        },
      });
      return customer;
    });
  }

  private async linkSupplierToCustomer(
    tx: Prisma.TransactionClient,
    tenantId: string,
    customer: Customer,
  ): Promise<Customer> {
    if (customer.linkedSupplierId) {
      return customer;
    }

    const code = await this.allocateNextSupplierCode(tx, tenantId);
    const supplier = await tx.supplier.create({
      data: {
        tenantId,
        code,
        name: supplierNameFromCustomer(customer),
        vatNumber: customer.vatNumber,
        email: customer.email,
        phone: customer.phone,
        paymentTerms: customer.paymentTerms,
        supplierDiscount: customer.customerDiscount,
        addressLine1: customer.addressLine1,
        addressLine2: customer.addressLine2,
        city: customer.city,
        province: customer.province,
        postalCode: customer.postalCode,
        countryCode: customer.countryCode,
        contactName: `${customer.firstName} ${customer.lastName}`.trim(),
      },
    });

    return tx.customer.update({
      where: { id: customer.id },
      data: { linkedSupplierId: supplier.id },
    });
  }

  private async allocateNextSupplierCode(
    tx: Prisma.TransactionClient,
    tenantId: string,
  ): Promise<string> {
    const suppliers = await tx.supplier.findMany({
      where: { tenantId },
      select: { code: true },
    });
    const codes = suppliers.map((s) => s.code).filter((c): c is string => Boolean(c));
    return nextNumericSupplierCode(codes);
  }

  private normalizeWrite(
    dto: CreateCustomerDto | UpdateCustomerDto,
    shopifyOwned = false,
  ): CustomerWriteData {
    const trim = (value: string | undefined): string | null | undefined => {
      if (value === undefined) {
        return undefined;
      }
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : null;
    };

    const result: CustomerWriteData = {};

    if (!shopifyOwned) {
      if (dto.firstName !== undefined) {
        result.firstName = dto.firstName.trim();
      }
      if (dto.lastName !== undefined) {
        result.lastName = dto.lastName.trim();
      }
      if (dto.email !== undefined) {
        result.email = trim(dto.email);
      }
      if (dto.phone !== undefined) {
        result.phone = trim(dto.phone);
      }
      if (dto.notes !== undefined) {
        result.notes = trim(dto.notes);
      }
      if (dto.addressLine1 !== undefined) {
        result.addressLine1 = trim(dto.addressLine1);
      }
      if (dto.addressLine2 !== undefined) {
        result.addressLine2 = trim(dto.addressLine2);
      }
      if (dto.city !== undefined) {
        result.city = trim(dto.city);
      }
      if (dto.province !== undefined) {
        result.province = trim(dto.province);
      }
      if (dto.postalCode !== undefined) {
        result.postalCode = trim(dto.postalCode);
      }
      if (dto.countryCode !== undefined) {
        result.countryCode = trim(dto.countryCode);
      }
    }

    if (dto.companyName !== undefined) {
      result.companyName = trim(dto.companyName);
    }
    if (dto.vatNumber !== undefined) {
      result.vatNumber = trim(dto.vatNumber);
    }
    if (dto.customerDiscount !== undefined) {
      result.customerDiscount = trim(dto.customerDiscount);
    }
    if (dto.paymentTerms !== undefined) {
      result.paymentTerms = trim(dto.paymentTerms);
    }
    if (dto.commercialNotes !== undefined) {
      result.commercialNotes = trim(dto.commercialNotes);
    }

    return result;
  }
}
