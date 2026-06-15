import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type Customer } from '@prisma/client';

import type { Paginated } from '../common/dto/pagination.dto';
import { PrismaService } from '../prisma/prisma.service';
import type { ListCustomersQueryDto } from './dto/list-customers.query.dto';

/**
 * Anagrafica clienti read-only (owner Shopify per ecommerce).
 * Nessun CRUD locale: i dati arrivano da sync/webhook Shopify.
 */
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
}
