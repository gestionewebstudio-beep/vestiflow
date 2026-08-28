import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { SupplierOrderStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { TenantPermission } from '../auth/tenant-permission.constants';
import { testClerkUser, testOwnerUser } from '../test/fixtures/user-profile.fixture';

import { assertSupplierOrderLinkable } from './document-supplier-order.util';

/**
 * ⛔ **Un id nel selettore non è un'autorizzazione.**
 *
 * `supplierOrderId` arriva dall'API validato come solo UUID. Prima del
 * 28/08/2026 i tre ingressi che lo accettano — `POST /documents`,
 * `PATCH /documents/:id` e `POST /documents/goods-receipt/save` — risolvevano
 * l'ordine con `where: { id, tenantId }` e `select: { status: true }`: la sede
 * **non era nemmeno letta**, quindi non poteva essere confrontata.
 *
 * Un utente assegnato alla sola sede A agganciava così un ordine della sede B
 * al proprio Arrivo merce, e ne otteneva i dati che l'apertura diretta gli
 * rifiuterebbe con 403 (`supplier-orders.service.ts:593`).
 *
 * ⭐ Questa funzione è il **punto comune** dei tre: provata qui, vale per tutti.
 */

const TENANT = 'tenant-1';
const ORDINE = 'po-1';
const SEDE_MIA = 'loc-mia';
const SEDE_ALTRUI = 'loc-altrui';

const commesso = () => testClerkUser({ assignedLocationIds: [SEDE_MIA] });

function reader(
  order: { status: SupplierOrderStatus; destinationLocationId: string | null } | null,
) {
  const findFirst = vi.fn().mockResolvedValue(order);
  return { db: { supplierOrder: { findFirst } } as never, findFirst };
}

const confermato = (destinationLocationId: string | null) => ({
  status: SupplierOrderStatus.confirmed,
  destinationLocationId,
});

describe('assertSupplierOrderLinkable — la sede dell’ordine agganciato', () => {
  it('✅ ordine della propria sede: consentito', async () => {
    const { db } = reader(confermato(SEDE_MIA));

    await expect(
      assertSupplierOrderLinkable(db, TENANT, ORDINE, commesso()),
    ).resolves.toBeUndefined();
  });

  it('⛔ stesso tenant, ordine di sede fuori ambito: RIFIUTATO', async () => {
    const { db } = reader(confermato(SEDE_ALTRUI));

    await expect(assertSupplierOrderLinkable(db, TENANT, ORDINE, commesso())).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('⛔ tenant diverso: 404, come prima', async () => {
    const { db } = reader(null);

    await expect(assertSupplierOrderLinkable(db, TENANT, ORDINE, commesso())).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('✅ il titolare aggancia ordini di qualunque sede', async () => {
    const { db } = reader(confermato(SEDE_ALTRUI));

    await expect(
      assertSupplierOrderLinkable(db, TENANT, ORDINE, testOwnerUser({ assignedLocationIds: [] })),
    ).resolves.toBeUndefined();
  });

  // La politica è quella di LETTURA, la stessa di `SupplierOrdersService.getById`:
  // la regola è «non si usa un ordine che non si potrebbe leggere».
  it('✅ chi ha inventory.view_all_locations aggancia qualunque sede', async () => {
    const { db } = reader(confermato(SEDE_ALTRUI));
    const supervisore = testClerkUser({
      assignedLocationIds: [SEDE_MIA],
      permissions: [TenantPermission.InventoryViewAllLocations],
    });

    await expect(
      assertSupplierOrderLinkable(db, TENANT, ORDINE, supervisore),
    ).resolves.toBeUndefined();
  });

  /**
   * ⭐ **La sede si verifica PRIMA dello stato**, e non è un dettaglio: un
   * ordine che non si può leggere non deve nemmeno rivelare in che stato si
   * trova. Qui l'ordine è di sede altrui **e** già concluso: se l'ordine dei
   * due controlli fosse invertito, l'errore direbbe «già concluso» e
   * confermerebbe l'esistenza di un ordine che il richiedente non può vedere.
   */
  it('⛔ sede altrui e ordine concluso: risponde 403, non «già concluso»', async () => {
    const { db } = reader({
      status: SupplierOrderStatus.concluded,
      destinationLocationId: SEDE_ALTRUI,
    });

    await expect(assertSupplierOrderLinkable(db, TENANT, ORDINE, commesso())).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('lo stato resta verificato: un ordine concluso della PROPRIA sede è rifiutato', async () => {
    const { db } = reader({
      status: SupplierOrderStatus.concluded,
      destinationLocationId: SEDE_MIA,
    });

    await expect(assertSupplierOrderLinkable(db, TENANT, ORDINE, commesso())).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  // ⚠️ Comportamento PRESERVATO: un ordine senza sede non ha nulla da
  // confrontare — è il contratto dichiarato del predicato, non una scelta presa
  // qui. Se debba essere ammesso è una domanda aperta, non decisa in questo fix.
  it('ordine senza sede: passa, policy preservata', async () => {
    const { db } = reader(confermato(null));

    await expect(
      assertSupplierOrderLinkable(db, TENANT, ORDINE, commesso()),
    ).resolves.toBeUndefined();
  });

  it('la lettura seleziona la sede, altrimenti non ci sarebbe niente da confrontare', async () => {
    const { db, findFirst } = reader(confermato(SEDE_MIA));

    await assertSupplierOrderLinkable(db, TENANT, ORDINE, commesso());

    expect(findFirst).toHaveBeenCalledWith({
      where: { id: ORDINE, tenantId: TENANT },
      select: { status: true, destinationLocationId: true },
    });
  });
});
