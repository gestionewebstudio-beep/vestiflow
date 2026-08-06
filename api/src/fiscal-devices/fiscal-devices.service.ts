import { Injectable, NotFoundException } from '@nestjs/common';
import type { FiscalDeviceBrand } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

import type { UpsertFiscalDeviceDto } from './dto/upsert-fiscal-device.dto';

/** Configurazione dispositivo per la UI (Impostazioni e cassa). */
export interface FiscalDeviceResult {
  readonly locationId: string;
  readonly locationName: string;
  readonly brand: FiscalDeviceBrand;
  readonly model: string | null;
  readonly endpoint: string;
  readonly serialNumber: string | null;
  readonly enabled: boolean;
  readonly notes: string | null;
  readonly lastSeenAt: Date | null;
  readonly lastError: string | null;
  readonly updatedAt: Date;
}

/**
 * Stampanti fiscali RT per sede (fondazione modulo cassa). Al più un
 * dispositivo per location: finché una sede non ne ha uno abilitato, la cassa
 * resta la registrazione interna non fiscale di sempre. Qui vive solo la
 * configurazione; l'emissione del documento commerciale è della Tranche 2.
 */
@Injectable()
export class FiscalDevicesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string): Promise<FiscalDeviceResult[]> {
    const devices = await this.prisma.fiscalDevice.findMany({
      where: { tenantId },
      include: { location: { select: { name: true } } },
      orderBy: { location: { name: 'asc' } },
    });
    return devices.map((device) => ({
      locationId: device.locationId,
      locationName: device.location.name,
      brand: device.brand,
      model: device.model,
      endpoint: device.endpoint,
      serialNumber: device.serialNumber,
      enabled: device.enabled,
      notes: device.notes,
      lastSeenAt: device.lastSeenAt,
      lastError: device.lastError,
      updatedAt: device.updatedAt,
    }));
  }

  async upsert(
    tenantId: string,
    locationId: string,
    dto: UpsertFiscalDeviceDto,
  ): Promise<FiscalDeviceResult> {
    const location = await this.prisma.location.findFirst({
      where: { id: locationId, tenantId, isActive: true, licensedInVf: true },
      select: { id: true, name: true },
    });
    if (!location) {
      throw new NotFoundException('Sede non trovata o non operativa.');
    }

    const data = {
      brand: dto.brand,
      model: dto.model?.trim() || null,
      // Senza slash finale: il driver compone i path sopra questo valore.
      endpoint: dto.endpoint.trim().replace(/\/+$/, ''),
      serialNumber: dto.serialNumber?.trim() || null,
      enabled: dto.enabled ?? true,
      notes: dto.notes?.trim() || null,
    };
    const device = await this.prisma.fiscalDevice.upsert({
      where: { locationId },
      create: { tenantId, locationId, ...data },
      update: data,
    });

    return {
      locationId: device.locationId,
      locationName: location.name,
      brand: device.brand,
      model: device.model,
      endpoint: device.endpoint,
      serialNumber: device.serialNumber,
      enabled: device.enabled,
      notes: device.notes,
      lastSeenAt: device.lastSeenAt,
      lastError: device.lastError,
      updatedAt: device.updatedAt,
    };
  }

  async remove(tenantId: string, locationId: string): Promise<void> {
    const deleted = await this.prisma.fiscalDevice.deleteMany({
      where: { tenantId, locationId },
    });
    if (deleted.count === 0) {
      throw new NotFoundException('Nessun dispositivo fiscale configurato per questa sede.');
    }
  }
}
