import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { serializeCsv } from '../common/csv.util';
import { PrismaService } from '../prisma/prisma.service';
import type { ExportCustomersQueryDto } from './dto/export-customers.query.dto';

export const CUSTOMER_EXPORT_HEADERS = [
  'Nome',
  'Cognome',
  'Email',
  'Telefono',
  'Indirizzo',
  'Città',
  'Provincia',
  'CAP',
  'Paese',
  'Note',
  'ID Shopify',
] as const;

@Injectable()
export class CustomersExportService {
  constructor(private readonly prisma: PrismaService) {}

  async exportCsv(tenantId: string, query: ExportCustomersQueryDto): Promise<string> {
    const customers = await this.prisma.customer.findMany({
      where: this.buildWhere(tenantId, query),
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });

    const rows = customers.map((customer) => ({
      Nome: customer.firstName,
      Cognome: customer.lastName,
      Email: customer.email ?? '',
      Telefono: customer.phone ?? '',
      Indirizzo: [customer.addressLine1, customer.addressLine2].filter(Boolean).join(', '),
      Città: customer.city ?? '',
      Provincia: customer.province ?? '',
      CAP: customer.postalCode ?? '',
      Paese: customer.countryCode ?? '',
      Note: customer.notes ?? '',
      'ID Shopify': customer.shopifyCustomerId ?? '',
    }));

    return serializeCsv(CUSTOMER_EXPORT_HEADERS, rows);
  }

  private buildWhere(tenantId: string, query: ExportCustomersQueryDto): Prisma.CustomerWhereInput {
    return {
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
  }
}
