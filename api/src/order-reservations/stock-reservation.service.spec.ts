import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { TenantPermission } from '../auth/tenant-permission.constants';
import type { PrismaService } from '../prisma/prisma.service';
import { testClerkUser, testOwnerUser } from '../test/fixtures/user-profile.fixture';

import { StockReservationService } from './stock-reservation.service';

/**
 * Drill-down Impegnata: la sede arriva dalla query, non dalla rotta. Il gate
 * `section.inventory` non dice NULLA su quale magazzino si stia leggendo, e
 * questi test tengono fermo che la verifica di sede viva nel servizio — dove
 * il dato arriva davvero.
 */

const TENANT = 'tenant-1';
const VARIANT = 'var-1';
const SEDE_ASSEGNATA = 'loc-assegnata';
const SEDE_ALTRUI = 'loc-altrui';

function createService() {
  const prisma = {
    stockReservation: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
  const service = new StockReservationService(prisma as unknown as PrismaService);
  return { service, prisma };
}

describe('StockReservationService — la sede segue l’utente, non la query', () => {
  // Il commesso della fixture non ha sedi assegnate: senza questa esplicita
  // non si distinguerebbe «sede altrui» da «nessuna sede».
  const commesso = () => testClerkUser({ assignedLocationIds: [SEDE_ASSEGNATA] });

  it('nega gli impegni di una sede fuori dal proprio ambito, senza leggere nulla', async () => {
    const { service, prisma } = createService();

    await expect(
      service.listActiveForLevel(TENANT, VARIANT, SEDE_ALTRUI, commesso()),
    ).rejects.toBeInstanceOf(ForbiddenException);

    // Nessun effetto: il rifiuto arriva prima della query.
    expect(prisma.stockReservation.findMany).not.toHaveBeenCalled();
  });

  it('consente la sede assegnata', async () => {
    const { service, prisma } = createService();

    await expect(
      service.listActiveForLevel(TENANT, VARIANT, SEDE_ASSEGNATA, commesso()),
    ).resolves.toEqual([]);

    expect(prisma.stockReservation.findMany).toHaveBeenCalledTimes(1);
  });

  it('consente qualunque sede a chi ha inventory.view_all_locations', async () => {
    const { service, prisma } = createService();
    const supervisore = testClerkUser({
      assignedLocationIds: [SEDE_ASSEGNATA],
      permissions: [TenantPermission.InventoryViewAllLocations],
    });

    await expect(
      service.listActiveForLevel(TENANT, VARIANT, SEDE_ALTRUI, supervisore),
    ).resolves.toEqual([]);

    expect(prisma.stockReservation.findMany).toHaveBeenCalledTimes(1);
  });

  it('consente qualunque sede a chi ha accesso a tutte le sedi', async () => {
    const { service } = createService();
    const multisede = testClerkUser({ hasAllLocationsAccess: true, assignedLocationIds: [] });

    await expect(
      service.listActiveForLevel(TENANT, VARIANT, SEDE_ALTRUI, multisede),
    ).resolves.toEqual([]);
  });

  it('il titolare non è mai fermato: array permessi vuoto, accesso pieno', async () => {
    const { service } = createService();

    await expect(
      service.listActiveForLevel(
        TENANT,
        VARIANT,
        SEDE_ALTRUI,
        testOwnerUser({ permissions: [], assignedLocationIds: [] }),
      ),
    ).resolves.toEqual([]);
  });

  it('senza utente in contesto non decide: le chiamate interne passano', async () => {
    const { service, prisma } = createService();

    await expect(service.listActiveForLevel(TENANT, VARIANT, SEDE_ALTRUI)).resolves.toEqual([]);

    expect(prisma.stockReservation.findMany).toHaveBeenCalledTimes(1);
  });
});
