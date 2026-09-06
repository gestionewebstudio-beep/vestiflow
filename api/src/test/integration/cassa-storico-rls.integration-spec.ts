import { randomUUID } from 'node:crypto';

import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { avviaApp, chiama, type AppIntegrazione } from './app';
import { creaDatasetCassa, fotografaCassa } from './cassa.fixture';
import { IDS, svuota } from './fixture';
import { creaClientIntegrazione } from './prisma';

describe('storico dispositivi — privilegi reali e percorsi API', () => {
  let prisma: PrismaClient;
  let app: AppIntegrazione;
  let token: string;
  let restricted: string;
  const sessions: Record<string, string> = {};
  let deviceId: string;

  beforeAll(async () => {
    prisma = creaClientIntegrazione();
    await creaDatasetCassa(prisma);
    await prisma.user.update({
      where: { id: IDS.utenteSupervisore },
      data: { permissions: ['retail.register'] },
    });
    const otherAuth = randomUUID();
    const other = await prisma.user.create({
      data: {
        tenantId: IDS.tenantB,
        authUserId: otherAuth,
        email: 'rls.b@integrazione.local',
        displayName: 'Utente B',
        role: 'owner',
      },
    });
    app = await avviaApp();
    token = await app.token(IDS.authA1);
    restricted = await app.token(IDS.authSupervisore);
    const otherToken = await app.token(otherAuth);
    for (const [tenantId, locationId, userId, bearer] of [
      [IDS.tenantA, IDS.locA1, IDS.utenteA1, token],
      [IDS.tenantA, IDS.locA2, IDS.utenteA1, token],
      [IDS.tenantB, IDS.locB1, other.id, otherToken],
    ]) {
      const device = await prisma.fiscalDevice.create({
        data: { tenantId: tenantId!, locationId: locationId!, brand: 'other', enabled: false },
      });
      // Dispositivo precedentemente operativo, ora disabilitato: fixture storica.
      const session = await prisma.cashSession.create({
        data: {
          tenantId: tenantId!,
          locationId: locationId!,
          fiscalDeviceId: device.id,
          openedById: userId!,
          openedByName: 'Storico TEST',
          openingFloatMinor: 0,
        },
      });
      sessions[locationId!] = session.id;
      if (locationId === IDS.locA1) deviceId = device.id;
      const changed = await chiama(
        app,
        'POST',
        `/cash-sessions/${session.id}/device?locationId=${locationId}`,
        { token: bearer, corpo: { fiscalDeviceId: null, reason: 'Dispositivo dismesso TEST' } },
      );
      expect(changed.stato, JSON.stringify(changed.corpo)).toBe(201);
    }
  }, 120_000);

  afterAll(async () => {
    await app?.chiudi();
    if (prisma) {
      await svuota(prisma);
      await prisma.$disconnect();
    }
  });

  it('RLS abilitata senza FORCE, nessuna concessione a PUBLIC', async () => {
    const [row] = await prisma.$queryRaw<
      { enabled: boolean; forced: boolean; publicGrants: number }[]
    >`
      SELECT c.relrowsecurity AS enabled, c.relforcerowsecurity AS forced,
        (SELECT count(*)::int FROM aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) a WHERE a.grantee = 0) AS "publicGrants"
      FROM pg_class c WHERE c.oid = 'public.cash_session_device_changes'::regclass`;
    expect(row).toEqual({ enabled: true, forced: false, publicGrants: 0 });
    expect(await prisma.cashSessionDeviceChange.count()).toBe(3);
  });

  for (const role of ['anon', 'authenticated'] as const) {
    it(`${role}: nessun privilegio effettivo o BYPASSRLS`, async () => {
      const privileges = await prisma.$queryRaw<{ allowed: boolean }[]>`
        SELECT has_table_privilege(${role}, 'public.cash_session_device_changes', privilege) AS allowed
        FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) privilege`;
      expect(privileges.every((row) => !row.allowed)).toBe(true);
      const [flags] = await prisma.$queryRaw<{ superuser: boolean; bypass: boolean }[]>`
        SELECT rolsuper AS superuser, rolbypassrls AS bypass FROM pg_roles WHERE rolname = ${role}`;
      expect(flags).toEqual({ superuser: false, bypass: false });
    });

    it.each(['SELECT', 'UPDATE', 'DELETE', 'TRUNCATE'] as const)(
      `${role}: %s diretto negato senza effetti`,
      async (operation) => {
        const before = await fotografaCassa(prisma);
        const statements = {
          SELECT: 'SELECT * FROM "cash_session_device_changes"',
          UPDATE: 'UPDATE "cash_session_device_changes" SET reason = \'alterato\'',
          DELETE: 'DELETE FROM "cash_session_device_changes"',
          TRUNCATE: 'TRUNCATE "cash_session_device_changes"',
        };
        await expect(
          prisma.$transaction(async (tx) => {
            await tx.$executeRawUnsafe(`SET LOCAL ROLE ${role}`);
            await tx.$queryRawUnsafe(statements[operation]);
          }),
        ).rejects.toMatchObject({ meta: { code: '42501' } });
        expect(await fotografaCassa(prisma)).toBe(before);
      },
    );

    it(`${role}: RLS nega righe anche con concessioni accidentali, join e CTE`, async () => {
      const rollback = new Error('rollback della sola prova TEST');
      const before = await fotografaCassa(prisma);
      await expect(
        prisma.$transaction(async (tx) => {
          // Solo questa transazione sul DB usa-e-getta: il rollback ripristina ogni ACL.
          await tx.$executeRawUnsafe(
            `GRANT SELECT, UPDATE, DELETE ON "cash_session_device_changes" TO ${role}`,
          );
          await tx.$executeRawUnsafe(`SET LOCAL ROLE ${role}`);
          await tx.$executeRaw`SELECT set_config('request.jwt.claims', ${JSON.stringify({ tenant_id: IDS.tenantA, role })}, true)`;
          const rows = await tx.$queryRaw<{ id: string }[]>`
          WITH history AS (SELECT id, tenant_id FROM cash_session_device_changes)
          SELECT history.id FROM history JOIN (VALUES (${IDS.tenantA}::uuid), (${IDS.tenantB}::uuid)) tenants(id) ON history.tenant_id = tenants.id`;
          expect(rows).toEqual([]);
          expect(
            await tx.$executeRaw`UPDATE cash_session_device_changes SET reason = 'alterato'`,
          ).toBe(0);
          expect(await tx.$executeRaw`DELETE FROM cash_session_device_changes`).toBe(0);
          throw rollback;
        }),
      ).rejects.toBe(rollback);
      expect(await fotografaCassa(prisma)).toBe(before);
    });

    it(`${role}: RLS rifiuta INSERT anche se il privilegio viene concesso`, async () => {
      const before = await fotografaCassa(prisma);
      await expect(
        prisma.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(`GRANT INSERT ON "cash_session_device_changes" TO ${role}`);
          await tx.$executeRawUnsafe(`SET LOCAL ROLE ${role}`);
          await tx.$executeRaw`
          INSERT INTO cash_session_device_changes (id, tenant_id, location_id, session_id, previous_device_id, reason, changed_by_name)
          VALUES (${randomUUID()}::uuid, ${IDS.tenantA}::uuid, ${IDS.locA1}::uuid, ${sessions[IDS.locA1]}::uuid, ${deviceId}::uuid, 'Tentativo TEST', 'Non autorizzato')`;
          // Anche una regressione deve annullare dati e GRANT della prova.
          throw new Error('INSERT non protetto da RLS');
        }),
      ).rejects.toMatchObject({ meta: { code: '42501' } });
      expect(await fotografaCassa(prisma)).toBe(before);
    });
  }

  it('lista dedicata e dettaglio sessione applicano tenant e sede', async () => {
    for (const locationId of [IDS.locA1, IDS.locA2, IDS.locB1]) {
      const sessionId = sessions[locationId]!;
      const list = await chiama(
        app,
        'GET',
        `/cash-sessions/${sessionId}/device-changes?locationId=${locationId}`,
        { token: restricted },
      );
      const detail = await chiama(app, 'GET', `/cash-sessions/sessions/${sessionId}`, {
        token: restricted,
      });
      if (locationId === IDS.locA1) {
        expect(list.stato).toBe(200);
        expect(list.corpo).toEqual([
          expect.objectContaining({
            tenantId: IDS.tenantA,
            locationId: IDS.locA1,
            reason: 'Dispositivo dismesso TEST',
          }),
        ]);
        expect(detail.stato).toBe(200);
        expect(detail.corpo).toMatchObject({
          deviceChanges: [expect.objectContaining({ reason: 'Dispositivo dismesso TEST' })],
        });
      } else {
        expect([403, 404]).toContain(list.stato);
        expect([403, 404]).toContain(detail.stato);
      }
    }
    const mismatch = await chiama(
      app,
      'GET',
      `/cash-sessions/${sessions[IDS.locA2]}/device-changes?locationId=${IDS.locA1}`,
      { token: restricted },
    );
    expect(mismatch.stato).toBe(404);
  });
});
