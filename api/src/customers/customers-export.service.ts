import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { serializeCsv } from '../common/csv.util';
import { PrismaService } from '../prisma/prisma.service';
import type { ExportCustomersQueryDto } from './dto/export-customers.query.dto';

export const CUSTOMER_EXPORT_HEADERS = [
  'Codice',
  'Nome',
  'Cognome',
  'Ragione sociale',
  'P. IVA',
  'Email',
  'Telefono',
  'Indirizzo',
  'Città',
  'Provincia',
  'CAP',
  'Paese',
  'Note',
  'ID Shopify',
  'Anche fornitore',
  'Ruolo attivo',
] as const;

@Injectable()
export class CustomersExportService {
  constructor(private readonly prisma: PrismaService) {}

  async exportCsv(tenantId: string, query: ExportCustomersQueryDto): Promise<string> {
    const customers = await this.prisma.customer.findMany({
      where: this.buildWhere(tenantId, query),
      include: {
        party: { include: { supplierRole: { select: { id: true, isActive: true } } } },
      },
      orderBy: [{ party: { lastName: 'asc' } }, { party: { firstName: 'asc' } }],
    });

    const rows = customers.map((customer) => ({
      Codice: customer.code ?? '',
      Nome: customer.party.firstName ?? '',
      Cognome: customer.party.lastName ?? '',
      'Ragione sociale': customer.party.companyName ?? '',
      'P. IVA': customer.party.vatNumber ?? '',
      Email: customer.party.email ?? '',
      Telefono: customer.party.phone ?? '',
      Indirizzo: [customer.party.addressLine1, customer.party.addressLine2]
        .filter(Boolean)
        .join(', '),
      Città: customer.party.city ?? '',
      Provincia: customer.party.province ?? '',
      CAP: customer.party.postalCode ?? '',
      Paese: customer.party.countryCode ?? '',
      Note: customer.party.notes ?? '',
      'ID Shopify': customer.shopifyCustomerId ?? '',
      'Anche fornitore': customer.party.supplierRole?.isActive ? 'Sì' : 'No',
      'Ruolo attivo': customer.isActive ? 'Sì' : 'No',
    }));

    return serializeCsv(CUSTOMER_EXPORT_HEADERS, rows);
  }

  private buildWhere(tenantId: string, query: ExportCustomersQueryDto): Prisma.CustomerWhereInput {
    return {
      tenantId,
      ...(query.search
        ? {
            OR: [
              { code: { contains: query.search, mode: 'insensitive' } },
              { party: { firstName: { contains: query.search, mode: 'insensitive' } } },
              { party: { lastName: { contains: query.search, mode: 'insensitive' } } },
              { party: { companyName: { contains: query.search, mode: 'insensitive' } } },
              { party: { email: { contains: query.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
  }
}
