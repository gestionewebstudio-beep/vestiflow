import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../prisma/prisma.service';
import { LocationLicensingService } from './location-licensing.service';

describe('LocationLicensingService', () => {
  const tenantId = 'tenant-1';

  function createService(options?: {
    licensedLocationCount?: number;
    locationSelectionLocked?: boolean;
    locationSelectionChangeGranted?: boolean;
    locations?: Array<{ id: string; isActive: boolean }>;
    licensedCount?: number;
  }) {
    const licensedLocationCount = options?.licensedLocationCount ?? 2;
    const locationSelectionLocked = options?.locationSelectionLocked ?? false;
    const locationSelectionChangeGranted = options?.locationSelectionChangeGranted ?? false;
    const locations = options?.locations ?? [
      { id: 'loc-1', isActive: true },
      { id: 'loc-2', isActive: true },
    ];

    const prisma = {
      tenant: {
        findUnique: vi.fn().mockResolvedValue({
          licensedLocationCount,
          locationSelectionLocked,
          locationSelectionChangeGranted,
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      location: {
        count: vi
          .fn()
          .mockResolvedValueOnce(options?.licensedCount ?? 0)
          .mockResolvedValue(options?.licensedCount ?? 1),
        findMany: vi.fn().mockImplementation(({ where }: { where: { id?: { in: string[] } } }) => {
          const ids = where.id?.in ?? [];
          return Promise.resolve(
            ids.map((id) => locations.find((location) => location.id === id)).filter(Boolean),
          );
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: vi.fn(async (callback: (tx: typeof prisma) => Promise<unknown>) =>
        callback(prisma),
      ),
    };

    return {
      service: new LocationLicensingService(prisma as unknown as PrismaService),
      prisma,
    };
  }

  it('rifiuta più location del limite contrattuale', async () => {
    const { service } = createService({ licensedLocationCount: 1 });

    await expect(service.setLicensedLocations(tenantId, ['loc-1', 'loc-2'])).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('aggiorna le location licenziate e blocca la selezione', async () => {
    const { service, prisma } = createService({ licensedLocationCount: 2 });

    const summary = await service.setLicensedLocations(tenantId, ['loc-1']);

    expect(prisma.location.updateMany).toHaveBeenCalled();
    expect(prisma.tenant.update).toHaveBeenCalledWith({
      where: { id: tenantId },
      data: {
        locationSelectionLocked: true,
        locationSelectionChangeGranted: false,
      },
    });
    expect(summary.licensedLocationCount).toBe(2);
    expect(summary.canChangeLicensedLocations).toBe(true);
  });

  it('rifiuta salvataggio cliente se selezione bloccata senza sblocco admin', async () => {
    const { service } = createService({
      locationSelectionLocked: true,
      locationSelectionChangeGranted: false,
    });

    await expect(service.setLicensedLocations(tenantId, ['loc-1'])).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('consente salvataggio se sblocco admin attivo e riblocca dopo', async () => {
    const { service, prisma } = createService({
      locationSelectionLocked: true,
      locationSelectionChangeGranted: true,
    });

    await service.setLicensedLocations(tenantId, ['loc-2']);

    expect(prisma.tenant.update).toHaveBeenCalledWith({
      where: { id: tenantId },
      data: {
        locationSelectionLocked: true,
        locationSelectionChangeGranted: false,
      },
    });
  });

  it('grantLocationSelectionChange abilita un nuovo round di selezione', async () => {
    const { service, prisma } = createService({
      locationSelectionLocked: true,
      locationSelectionChangeGranted: false,
    });

    await service.grantLocationSelectionChange(tenantId);

    expect(prisma.tenant.update).toHaveBeenCalledWith({
      where: { id: tenantId },
      data: { locationSelectionChangeGranted: true },
    });
  });

  it('grantLocationSelectionChange rifiuta se non bloccato', async () => {
    const { service } = createService({ locationSelectionLocked: false });

    await expect(service.grantLocationSelectionChange(tenantId)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('grantLocationSelectionChange rifiuta se sblocco già concesso', async () => {
    const { service } = createService({
      locationSelectionLocked: true,
      locationSelectionChangeGranted: true,
    });

    await expect(service.grantLocationSelectionChange(tenantId)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('getSummary espone canChangeLicensedLocations coerente col blocco', async () => {
    const { service, prisma } = createService({
      locationSelectionLocked: true,
      locationSelectionChangeGranted: false,
      licensedCount: 1,
    });
    prisma.tenant.findUnique.mockResolvedValue({
      licensedLocationCount: 2,
      locationSelectionLocked: true,
      locationSelectionChangeGranted: false,
    });

    const summary = await service.getSummary(tenantId);

    expect(summary.canChangeLicensedLocations).toBe(false);
    expect(summary.locationSelectionLocked).toBe(true);
  });

  it('setLicensedLocations con lockAfterSave false non aggiorna flag tenant', async () => {
    const { service, prisma } = createService({ licensedLocationCount: 1 });

    await service.setLicensedLocations(tenantId, ['loc-1'], {
      lockAfterSave: false,
      bypassSelectionLock: true,
    });

    expect(prisma.tenant.update).not.toHaveBeenCalled();
  });

  it('trimLicensedLocationsToLimit disattiva le sedi in eccesso mantenendo le più vecchie', async () => {
    const licensedRows = [
      { id: 'loc-1' },
      { id: 'loc-2' },
      { id: 'loc-3' },
    ];
    const prisma = {
      location: {
        findMany: vi.fn().mockResolvedValue(licensedRows),
        updateMany: vi.fn().mockResolvedValue({ count: 2 }),
      },
    };
    const service = new LocationLicensingService(prisma as unknown as PrismaService);

    const deactivated = await service.trimLicensedLocationsToLimit(tenantId, 1, prisma as never);

    expect(deactivated).toBe(2);
    expect(prisma.location.updateMany).toHaveBeenCalledWith({
      where: { tenantId, id: { in: ['loc-2', 'loc-3'] } },
      data: { licensedInVf: false },
    });
  });

  it('trimLicensedLocationsToLimit con zero sedi attive non modifica nulla', async () => {
    const prisma = {
      location: {
        findMany: vi.fn().mockResolvedValue([]),
        updateMany: vi.fn(),
      },
    };
    const service = new LocationLicensingService(prisma as unknown as PrismaService);

    const deactivated = await service.trimLicensedLocationsToLimit(tenantId, 1, prisma as never);

    expect(deactivated).toBe(0);
    expect(prisma.location.updateMany).not.toHaveBeenCalled();
  });

  it('applyAdminLicensedLocationLimit delega al trim', async () => {
    const prisma = {
      location: {
        findMany: vi.fn().mockResolvedValue([{ id: 'loc-1' }, { id: 'loc-2' }]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const service = new LocationLicensingService(prisma as unknown as PrismaService);

    const deactivated = await service.applyAdminLicensedLocationLimit(tenantId, 1, prisma as never);

    expect(deactivated).toBe(1);
    expect(prisma.location.updateMany).toHaveBeenCalledWith({
      where: { tenantId, id: { in: ['loc-2'] } },
      data: { licensedInVf: false },
    });
  });
});
