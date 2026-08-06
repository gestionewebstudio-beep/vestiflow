import { Injectable, NotFoundException } from '@nestjs/common';

import { LocationLicensingService } from '../inventory/location-licensing.service';
import { PrismaService } from '../prisma/prisma.service';
import type { TenantCompanyDto } from './dto/tenant-company.dto';

@Injectable()
export class TenantCompanyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly locationLicensing: LocationLicensingService,
  ) {}

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

    const licenseSummary = await this.locationLicensing.getSummary(tenantId);

    return {
      name: tenant.name,
      channelProfile: tenant.channelProfile,
      storeName: tenant.stores[0]?.name ?? null,
      licensedLocationCount: licenseSummary.licensedLocationCount,
      licensedLocationActiveCount: licenseSummary.licensedLocationActiveCount,
      locationSelectionLocked: licenseSummary.locationSelectionLocked,
      locationSelectionChangeGranted: licenseSummary.locationSelectionChangeGranted,
      canChangeLicensedLocations: licenseSummary.canChangeLicensedLocations,
      profile: {
        legalName: tenant.legalName,
        vatNumber: tenant.vatNumber,
        fiscalCode: tenant.fiscalCode,
        phone: tenant.phone,
        pec: tenant.pec,
        sdiCode: tenant.sdiCode,
        iban: tenant.iban,
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
