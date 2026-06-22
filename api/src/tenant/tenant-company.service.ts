import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import type { TenantCompanyDto } from './dto/tenant-company.dto';

@Injectable()
export class TenantCompanyService {
  constructor(private readonly prisma: PrismaService) {}

  async getCompany(tenantId: string): Promise<TenantCompanyDto> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        stores: { orderBy: { createdAt: 'asc' }, take: 1, select: { name: true } },
      },
    });

    if (!tenant) {
      throw new NotFoundException('Azienda non trovata');
    }

    return {
      name: tenant.name,
      channelProfile: tenant.channelProfile,
      storeName: tenant.stores[0]?.name ?? null,
      profile: {
        legalName: tenant.legalName,
        vatNumber: tenant.vatNumber,
        fiscalCode: tenant.fiscalCode,
        phone: tenant.phone,
        pec: tenant.pec,
        sdiCode: tenant.sdiCode,
        addressLine1: tenant.addressLine1,
        addressLine2: tenant.addressLine2,
        city: tenant.city,
        province: tenant.province,
        postalCode: tenant.postalCode,
        countryCode: tenant.countryCode,
      },
    };
  }
}
