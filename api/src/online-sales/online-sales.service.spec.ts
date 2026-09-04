import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { TenantPermission } from '../auth/tenant-permission.constants';
import type { PrismaService } from '../prisma/prisma.service';
import { testClerkUser, testOwnerUser } from '../test/fixtures/user-profile.fixture';

import { OnlineSalesService } from './online-sales.service';

/**
 * ⛔ **Conoscere un id non concede alcun diritto.**
 *
 * `OnlineSale.locationId` è la sede di scarico della vendita. Fino al
 * 28/08/2026 `getDetail` non aveva nemmeno il parametro utente: risolveva la
 * vendita con `{ id, tenantId }` e restituiva righe, movimenti e perfino il
 * **nome della sede** — di un magazzino su cui chi chiedeva poteva non avere
 * alcun diritto.
 *
 * ⚠️ Due porte, non una: `GET /online-sales/:id` e
 * `GET /online-sales/by-order/:salesOrderId`, che delega alla prima. Una
 * correzione che ne coprisse una sola lascerebbe l'altra aperta, ed è il
 * motivo per cui il test le esercita entrambe.
 */

const TENANT = 'tenant-1';
const VENDITA = 'vendita-1';
const ORDINE = 'ordine-1';
const SEDE_MIA = 'loc-mia';
const SEDE_ALTRUI = 'loc-altrui';

const commesso = () => testClerkUser({ assignedLocationIds: [SEDE_MIA] });

function createService(locationId: string | null, trovata = true) {
  const prisma = {
    onlineSale: {
      findFirst: vi.fn().mockImplementation(({ select }: { select?: unknown }) => {
        if (!trovata) {
          return Promise.resolve(null);
        }
        // La ricerca per ordine seleziona il solo id; il dettaglio l'intero record.
        if (select) {
          return Promise.resolve({ id: VENDITA });
        }
        return Promise.resolve({
          id: VENDITA,
          tenantId: TENANT,
          locationId,
          source: 'online',
          orderNumber: 'OS-1',
          externalOrderId: 'ext-1',
          externalFulfillmentId: null,
          customerName: 'Cliente',
          customerAddress: null,
          subtotalMinor: 0,
          discountMinor: 0,
          shippingMinor: 0,
          taxMinor: 0,
          totalMinor: 0,
          currencyCode: 'EUR',
          orderPlacedAt: new Date('2026-08-01'),
          fulfilledAt: new Date('2026-08-02'),
          refundedAt: null,
          lines: [],
          location: locationId ? { name: 'Magazzino' } : null,
          documents: [],
        });
      }),
    },
    stockMovement: { findMany: vi.fn().mockResolvedValue([]) },
  };
  const service = new OnlineSalesService(prisma as unknown as PrismaService);
  return { service, prisma };
}

describe('Vendite online — la sede si verifica anche conoscendo l’id', () => {
  it('⛔ stesso tenant, sede altrui: il dettaglio è NEGATO', async () => {
    const { service } = createService(SEDE_ALTRUI);

    await expect(service.getDetail(TENANT, VENDITA, commesso())).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('⛔ e nessun movimento viene letto dopo il rifiuto', async () => {
    const { service, prisma } = createService(SEDE_ALTRUI);

    await expect(service.getDetail(TENANT, VENDITA, commesso())).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    expect(prisma.stockMovement.findMany).not.toHaveBeenCalled();
  });

  // ⚠️ La seconda porta: delega alla prima, ma se non le passasse l'utente
  // resterebbe aperta mentre la prima è chiusa.
  it('⛔ anche la ricerca per ordine è NEGATA sulla sede altrui', async () => {
    const { service } = createService(SEDE_ALTRUI);

    await expect(service.findByOrder(TENANT, ORDINE, commesso())).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('✅ la propria sede si legge, da entrambe le porte', async () => {
    const a = createService(SEDE_MIA);
    const b = createService(SEDE_MIA);

    await expect(a.service.getDetail(TENANT, VENDITA, commesso())).resolves.toMatchObject({
      id: VENDITA,
    });
    await expect(b.service.findByOrder(TENANT, ORDINE, commesso())).resolves.toMatchObject({
      id: VENDITA,
    });
  });
});

describe('Vendite online — chi legge ovunque, e i casi limite', () => {
  it('il titolare accede a qualunque sede', async () => {
    const { service } = createService(SEDE_ALTRUI);

    await expect(
      service.getDetail(TENANT, VENDITA, testOwnerUser({ assignedLocationIds: [] })),
    ).resolves.toMatchObject({ id: VENDITA });
  });

  it('chi ha inventory.view_all_locations legge qualunque sede', async () => {
    const { service } = createService(SEDE_ALTRUI);
    const supervisore = testClerkUser({
      assignedLocationIds: [SEDE_MIA],
      permissions: [TenantPermission.InventoryViewAllLocations],
    });

    await expect(service.getDetail(TENANT, VENDITA, supervisore)).resolves.toMatchObject({
      id: VENDITA,
    });
  });

  // ⚠️ Comportamento PRESERVATO dal contratto del predicato, non norma nuova:
  // va deciso a parte se un record senza sede debba essere leggibile da tutti.
  it('vendita SENZA sede: passa — comportamento preservato, non dedotto', async () => {
    const { service } = createService(null);

    await expect(service.getDetail(TENANT, VENDITA, commesso())).resolves.toMatchObject({
      id: VENDITA,
    });
  });

  it('tenant diverso: 404 come prima', async () => {
    const { service } = createService(SEDE_ALTRUI, false);

    await expect(service.getDetail(TENANT, VENDITA, commesso())).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('la ricerca per ordine senza vendita collegata resta null', async () => {
    const { service } = createService(SEDE_MIA, false);

    await expect(service.findByOrder(TENANT, ORDINE, commesso())).resolves.toBeNull();
  });
});
