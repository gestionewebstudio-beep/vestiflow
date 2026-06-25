import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import {
  TENANT_LICENSED_LOCATION_MAX,
  TENANT_LICENSED_LOCATION_MIN,
} from '../common/tenant-location-license.constants';
import { PrismaService } from '../prisma/prisma.service';

export interface LocationLicenseSummaryDto {
  readonly licensedLocationCount: number;
  readonly licensedLocationActiveCount: number;
  readonly locationSelectionLocked: boolean;
  readonly locationSelectionChangeGranted: boolean;
  readonly canChangeLicensedLocations: boolean;
}

export interface SetLicensedLocationsOptions {
  /** Blocca ulteriori modifiche dopo il salvataggio (default: true per salvataggi cliente). */
  readonly lockAfterSave?: boolean;
  /** Salta il controllo blocco (sync automatico / operazioni di sistema). */
  readonly bypassSelectionLock?: boolean;
}

@Injectable()
export class LocationLicensingService {
  constructor(private readonly prisma: PrismaService) {}

  assertLicensedLocationCount(value: number): void {
    if (
      !Number.isInteger(value) ||
      value < TENANT_LICENSED_LOCATION_MIN ||
      value > TENANT_LICENSED_LOCATION_MAX
    ) {
      throw new BadRequestException(
        `Location incluse nel contratto: da ${TENANT_LICENSED_LOCATION_MIN} a ${TENANT_LICENSED_LOCATION_MAX}.`,
      );
    }
  }

  private toSummary(
    licensedLocationCount: number,
    licensedLocationActiveCount: number,
    locationSelectionLocked: boolean,
    locationSelectionChangeGranted: boolean,
  ): LocationLicenseSummaryDto {
    return {
      licensedLocationCount,
      licensedLocationActiveCount,
      locationSelectionLocked,
      locationSelectionChangeGranted,
      canChangeLicensedLocations:
        !locationSelectionLocked || locationSelectionChangeGranted,
    };
  }

  async getSummary(tenantId: string): Promise<LocationLicenseSummaryDto> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        licensedLocationCount: true,
        locationSelectionLocked: true,
        locationSelectionChangeGranted: true,
      },
    });
    if (!tenant) {
      throw new NotFoundException('Azienda non trovata');
    }

    const licensedLocationActiveCount = await this.prisma.location.count({
      where: { tenantId, licensedInVf: true, isActive: true },
    });

    return this.toSummary(
      tenant.licensedLocationCount,
      licensedLocationActiveCount,
      tenant.locationSelectionLocked,
      tenant.locationSelectionChangeGranted,
    );
  }

  async grantLocationSelectionChange(tenantId: string): Promise<LocationLicenseSummaryDto> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        licensedLocationCount: true,
        locationSelectionLocked: true,
        locationSelectionChangeGranted: true,
      },
    });
    if (!tenant) {
      throw new NotFoundException('Cliente non trovato');
    }

    if (!tenant.locationSelectionLocked) {
      throw new BadRequestException(
        'Il cliente può già modificare le sedi attive: nessuno sblocco necessario.',
      );
    }

    if (tenant.locationSelectionChangeGranted) {
      throw new BadRequestException(
        'Il cambio sede è già stato concesso: in attesa che il cliente salvi.',
      );
    }

    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { locationSelectionChangeGranted: true },
    });

    return this.getSummary(tenantId);
  }

  async trimLicensedLocationsToLimit(
    tenantId: string,
    nextLimit: number,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<number> {
    this.assertLicensedLocationCount(nextLimit);

    const licensed = await tx.location.findMany({
      where: { tenantId, licensedInVf: true },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });

    if (licensed.length <= nextLimit) {
      return 0;
    }

    const toDeactivate = licensed.slice(nextLimit).map((location) => location.id);
    await tx.location.updateMany({
      where: { tenantId, id: { in: toDeactivate } },
      data: { licensedInVf: false },
    });

    return toDeactivate.length;
  }

  /** Validazione limite + eventuale trim sedi attive (solo flusso admin). */
  async applyAdminLicensedLocationLimit(
    tenantId: string,
    nextLimit: number,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<number> {
    this.assertLicensedLocationCount(nextLimit);
    return this.trimLicensedLocationsToLimit(tenantId, nextLimit, tx);
  }

  async setLicensedLocations(
    tenantId: string,
    locationIds: readonly string[],
    options: SetLicensedLocationsOptions = {},
  ): Promise<LocationLicenseSummaryDto> {
    const lockAfterSave = options.lockAfterSave ?? true;
    const bypassSelectionLock = options.bypassSelectionLock ?? false;

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        licensedLocationCount: true,
        locationSelectionLocked: true,
        locationSelectionChangeGranted: true,
      },
    });
    if (!tenant) {
      throw new NotFoundException('Azienda non trovata');
    }

    if (
      !bypassSelectionLock &&
      tenant.locationSelectionLocked &&
      !tenant.locationSelectionChangeGranted
    ) {
      throw new ForbiddenException(
        'Contatta l\'assistenza per modificare le sedi attive.',
      );
    }

    const uniqueIds = [...new Set(locationIds)];
    if (uniqueIds.length > tenant.licensedLocationCount) {
      throw new BadRequestException(
        `Puoi attivare al massimo ${tenant.licensedLocationCount} sedi incluse nel tuo piano.`,
      );
    }

    if (uniqueIds.length > 0) {
      const locations = await this.prisma.location.findMany({
        where: { tenantId, id: { in: uniqueIds } },
        select: { id: true, isActive: true },
      });

      if (locations.length !== uniqueIds.length) {
        throw new BadRequestException('Una o più sedi selezionate non sono valide.');
      }

      const inactive = locations.find((location) => !location.isActive);
      if (inactive) {
        throw new BadRequestException(
          'Non puoi attivare sedi disattivate su Shopify. Riattivale da Shopify Admin o scegli altre sedi.',
        );
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.location.updateMany({
        where: { tenantId, licensedInVf: true },
        data: { licensedInVf: false },
      });

      if (uniqueIds.length > 0) {
        await tx.location.updateMany({
          where: { tenantId, id: { in: uniqueIds } },
          data: { licensedInVf: true },
        });
      }

      if (lockAfterSave) {
        await tx.tenant.update({
          where: { id: tenantId },
          data: {
            locationSelectionLocked: true,
            locationSelectionChangeGranted: false,
          },
        });
      }
    });

    return this.getSummary(tenantId);
  }

  /** Se il piano prevede 1 sola sede e Shopify ne espone una sola attiva, selezionala automaticamente. */
  async tryAutoLicenseSingleShopifyLocation(tenantId: string): Promise<boolean> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { licensedLocationCount: true },
    });
    if (!tenant || tenant.licensedLocationCount !== 1) {
      return false;
    }

    const alreadyLicensed = await this.prisma.location.count({
      where: { tenantId, licensedInVf: true, shopifyLocationId: { not: null } },
    });
    if (alreadyLicensed > 0) {
      return false;
    }

    const shopifyCandidates = await this.prisma.location.findMany({
      where: {
        tenantId,
        isActive: true,
        shopifyLocationId: { not: null },
      },
      orderBy: { createdAt: 'asc' },
    });

    if (shopifyCandidates.length !== 1) {
      return false;
    }

    await this.setLicensedLocations(tenantId, [shopifyCandidates[0]!.id], {
      lockAfterSave: false,
      bypassSelectionLock: true,
    });
    return true;
  }
}
