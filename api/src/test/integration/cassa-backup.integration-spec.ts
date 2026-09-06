import { randomUUID } from 'node:crypto';

import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { deleteTenantData } from '../../admin/tenant-delete.util';
import {
  readZipEntry,
  readZipManifest,
  rewriteTenantBackupZip,
} from '../fixtures/tenant-backup.fixture';
import { readTenantBackupData } from '../../tenant/tenant-backup/tenant-backup-entities.util';
import { TENANT_BACKUP_V3_ENTITY_FILES } from '../../tenant/tenant-backup/tenant-backup.constants';
import { avviaApp, chiama, type AppIntegrazione } from './app';
import { creaDatasetCassa, fotografaCassa } from './cassa.fixture';
import { IDS, svuota } from './fixture';
import { creaClientIntegrazione } from './prisma';
import { ADMIN_EMAIL_INTEGRAZIONE } from './setup';

describe('backup Cassa — export ZIP, import HTTP e PostgreSQL', () => {
  let prisma: PrismaClient;
  let app: AppIntegrazione;
  let token: string;
  let archive: Buffer;
  let originalState: string;
  let otherState: string;
  let globals: string;
  let saleInput: Record<string, unknown>;
  let saleId: string;
  const authB = randomUUID();
  let tokenB: string;
  const authAdmin = randomUUID();
  let adminToken: string;

  beforeAll(async () => {
    prisma = creaClientIntegrazione();
    const fixture = await creaDatasetCassa(prisma);
    const adminTenant = await prisma.tenant.create({
      data: { name: 'Operatore piattaforma TEST' },
    });
    await prisma.user.create({
      data: {
        tenantId: adminTenant.id,
        authUserId: authAdmin,
        role: 'owner',
        email: ADMIN_EMAIL_INTEGRAZIONE,
        displayName: 'Amministratore TEST',
      },
    });
    await prisma.user.create({
      data: {
        tenantId: IDS.tenantB,
        authUserId: authB,
        role: 'owner',
        email: 'owner-b@integrazione.local',
        displayName: 'Titolare B TEST',
      },
    });
    const method = await prisma.paymentMethodCode.findUniqueOrThrow({ where: { code: 'MP01' } });
    await prisma.paymentOption.update({
      where: { id: fixture.cashId },
      data: { methodCodeId: method.id },
    });
    const nature = await prisma.vatNature.findUniqueOrThrow({ where: { key: 'TAXABLE' } });
    const vat = await prisma.vatCode.create({
      data: {
        tenantId: IDS.tenantA,
        natureId: nature.id,
        code: 'IVA TEST',
        description: 'Test backup',
        ratePercent: 0,
      },
    });
    app = await avviaApp();
    token = await app.token(IDS.authA1);
    tokenB = await app.token(authB);
    adminToken = await app.token(authAdmin);
    const device = await prisma.fiscalDevice.create({
      data: { tenantId: IDS.tenantA, locationId: IDS.locA1, brand: 'other' },
    });
    const session = await prisma.cashSession.create({
      data: {
        tenantId: IDS.tenantA,
        locationId: IDS.locA1,
        openedById: IDS.utenteA1,
        openedByName: 'Titolare TEST',
        openingFloatMinor: 500,
        fiscalDeviceId: device.id,
      },
    });
    await prisma.cashSessionDeviceChange.create({
      data: {
        tenantId: IDS.tenantA,
        locationId: IDS.locA1,
        sessionId: session.id,
        newDeviceId: device.id,
        changedById: IDS.utenteA1,
        changedByName: 'Titolare TEST',
        reason: 'Storico da conservare',
      },
    });
    await prisma.cashSessionMovement.create({
      data: {
        tenantId: IDS.tenantA,
        sessionId: session.id,
        type: 'deposit',
        amountMinor: 50,
        reason: 'Versamento TEST',
        createdByName: 'Titolare TEST',
        createdById: IDS.utenteA1,
      },
    });
    saleInput = {
      locationId: IDS.locA1,
      sessionId: session.id,
      creationIntentId: randomUUID(),
      lines: [
        { variantId: fixture.variantId, quantity: 3, unitPriceMinor: 1218.6667, vatCodeId: vat.id },
      ],
      payments: [{ paymentOptionId: fixture.cashId, amountMinor: 3656, tenderedMinor: 4000 }],
    };
    const sale = await chiama(app, 'POST', '/cash-sessions/checkout', { token, corpo: saleInput });
    expect(sale.stato, JSON.stringify(sale.corpo)).toBe(201);
    saleId = (sale.corpo as { documentId: string }).documentId;
    const line = await prisma.documentLine.findFirstOrThrow({ where: { documentId: saleId } });
    const payment = await prisma.storeSalePayment.findFirstOrThrow({
      where: { documentId: saleId },
    });
    const returned = await chiama(app, 'POST', '/cash-sessions/returns', {
      token,
      corpo: {
        locationId: IDS.locA1,
        sessionId: session.id,
        creationIntentId: randomUUID(),
        originalDocumentId: saleId,
        reason: 'Reso TEST',
        lines: [{ originalLineId: line.id, quantity: 1 }],
        refunds: [{ originalPaymentId: payment.id, amountMinor: 1219 }],
      },
    });
    expect(returned.stato, JSON.stringify(returned.corpo)).toBe(201);
    const receipt = await prisma.fiscalReceipt.create({
      data: {
        tenantId: IDS.tenantA,
        documentId: saleId,
        deviceId: device.id,
        status: 'emitted',
        fiscalNumber: '0001',
        closureNumber: '0042',
      },
    });
    await prisma.fiscalReceipt.create({
      data: {
        tenantId: IDS.tenantA,
        documentId: (returned.corpo as { documentId: string }).documentId,
        deviceId: device.id,
        originalReceiptId: receipt.id,
        status: 'pending',
      },
    });
    const closed = await chiama(
      app,
      'POST',
      `/cash-sessions/${session.id}/close?locationId=${IDS.locA1}`,
      {
        token,
        corpo: { countedCashMinor: 2987, declaredElectronicMinor: 0 },
      },
    );
    expect(closed.stato, JSON.stringify(closed.corpo)).toBe(201);
    await prisma.cashSession.create({
      data: {
        tenantId: IDS.tenantA,
        locationId: IDS.locA2,
        openedByName: 'Sessione aperta TEST',
      },
    });
    await prisma.posTerminal.create({
      data: {
        tenantId: IDS.tenantA,
        locationId: IDS.locA1,
        terminalId: 'POS TEST',
        acquirerName: 'Acquirer TEST',
        activatedAt: new Date('2026-09-01'),
      },
    });
    originalState = await fotografaCassa(prisma);
    otherState = await fotografaCassa(prisma, IDS.tenantB);
    globals = JSON.stringify(
      await Promise.all([
        prisma.vatNature.findMany({ orderBy: { id: 'asc' } }),
        prisma.paymentMethodCode.findMany({ orderBy: { id: 'asc' } }),
      ]),
    );
    const response = await fetch(`${app.baseUrl}/tenant/backup/export`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.status, await response.clone().text()).toBe(200);
    archive = Buffer.from(await response.arrayBuffer());
  }, 120_000);

  afterAll(async () => {
    await app?.chiudi();
    if (prisma) {
      await svuota(prisma);
      await prisma.$disconnect();
    }
  });

  async function restore(buffer = archive, bearer = token) {
    const form = new FormData();
    form.append(
      'file',
      new Blob([new Uint8Array(buffer)], { type: 'application/zip' }),
      'backup.zip',
    );
    return fetch(`${app.baseUrl}/tenant/backup/import?confirm=REPLACE`, {
      method: 'POST',
      headers: { authorization: `Bearer ${bearer}` },
      body: form,
    });
  }

  async function fullState() {
    return prisma.$transaction(async (tx) => {
      const data = await readTenantBackupData(tx, IDS.tenantA);
      for (const rows of Object.values(data))
        rows.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
      return JSON.stringify(data);
    });
  }

  function patchRows(
    files: Map<string, Buffer>,
    key: string,
    change: (rows: Record<string, unknown>[]) => void,
  ) {
    const path = `data/${key}.json`;
    const rows = JSON.parse(files.get(path)!.toString('utf8')) as Record<string, unknown>[];
    change(rows);
    files.set(path, Buffer.from(JSON.stringify(rows)));
  }

  it('esporta tutti i fatti Cassa, gli intenti e i riferimenti storici', async () => {
    const manifest = await readZipManifest(archive);
    expect(manifest.entityCounts).toMatchObject({
      cashSessions: 2,
      cashSessionMovements: 1,
      cashSessionDeviceChanges: 1,
      fiscalDevices: 1,
      fiscalReceipts: 2,
      posTerminals: 1,
      storeSalePayments: 2,
      creationIntents: 2,
    });
    const rows = JSON.parse(await readZipEntry(archive, 'data/documentLines.json')) as Array<{
      unitPriceMinor: string;
    }>;
    expect(rows.every((row) => row.unitPriceMinor === '1218.6667')).toBe(true);
  });

  it('ripristina l’archivio reale senza perdere quote, origine del reso, quadratura e retry', async () => {
    const response = await restore();
    expect(response.status, await response.clone().text()).toBe(201);
    expect(await fotografaCassa(prisma)).toBe(originalState);
    expect(await fotografaCassa(prisma, IDS.tenantB)).toBe(otherState);
    const retry = await chiama(app, 'POST', '/cash-sessions/checkout', { token, corpo: saleInput });
    expect(retry.stato, JSON.stringify(retry.corpo)).toBe(201);
    expect(retry.corpo).toMatchObject({ documentId: saleId });
    expect(await fotografaCassa(prisma)).toBe(originalState);
  });

  it.each([
    ['cashSessions', 'locationId', IDS.locB1],
    ['cashSessionDeviceChanges', 'newDeviceId', randomUUID()],
    ['cashSessionDeviceChanges', 'locationId', IDS.locA2],
    ['cashSessionMovements', 'sessionId', randomUUID()],
    ['documents', 'cashSessionId', randomUUID()],
    ['documents', 'tenantId', IDS.tenantB],
    ['documentLines', 'returnedFromLineId', randomUUID()],
    ['storeSalePayments', 'refundedFromPaymentId', randomUUID()],
    ['paymentOptions', 'methodCodeId', randomUUID()],
    ['userLocations', 'locationId', IDS.locB1],
  ])('rifiuta %s.%s invalido senza effetti', async (key, field, value) => {
    const before = await fullState();
    const altered = await rewriteTenantBackupZip(archive, (files) =>
      patchRows(files, key, (rows) => {
        rows[0]![field] = value;
      }),
    );
    const response = await restore(altered);
    expect(response.status, await response.clone().text()).toBe(400);
    expect(await fullState()).toBe(before);
    expect(await fotografaCassa(prisma, IDS.tenantB)).toBe(otherState);
  });

  it.each(['missing', 'invalid-json', 'traversal', 'count', 'extra-column'])(
    'rifiuta archivio %s prima di sostituire dati',
    async (kind) => {
      const before = await fullState();
      const altered = await rewriteTenantBackupZip(archive, (files) => {
        if (kind === 'missing') files.delete('data/storeSalePayments.json');
        if (kind === 'invalid-json') files.set('data/cashSessions.json', Buffer.from('{broken'));
        if (kind === 'traversal') files.set('../outside.txt', Buffer.from('invalid'));
        if (kind === 'count') patchRows(files, 'cashSessions', (rows) => rows.pop());
        if (kind === 'extra-column')
          patchRows(files, 'cashSessions', (rows) => {
            rows[0]!['unexpected'] = true;
          });
      });
      expect((await restore(altered)).status).toBe(400);
      expect(await fullState()).toBe(before);
    },
  );

  it('una violazione di vincolo dopo il purge ripristina atomicamente anche utenti e anagrafiche', async () => {
    const before = await fullState();
    const altered = await rewriteTenantBackupZip(archive, (files) =>
      patchRows(files, 'storeSalePayments', (rows) => {
        rows[0]!['amountMinor'] = -1;
      }),
    );
    const response = await restore(altered);
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(await fullState()).toBe(before);
  });

  it('risolve gli identificativi dei cataloghi tramite chiave senza modificare i cataloghi', async () => {
    const altered = await rewriteTenantBackupZip(archive, (files) => {
      const manifest = JSON.parse(files.get('manifest.json')!.toString('utf8')) as {
        globalReferences: { paymentMethodCodes: { id: string; code: string }[] };
      };
      const id = randomUUID();
      manifest.globalReferences.paymentMethodCodes.find((row) => row.code === 'MP01')!.id = id;
      patchRows(files, 'paymentOptions', (rows) => {
        for (const row of rows) if (row['methodCodeId']) row['methodCodeId'] = id;
      });
      files.set('manifest.json', Buffer.from(JSON.stringify(manifest)));
    });
    const response = await restore(altered);
    expect(response.status, await response.clone().text()).toBe(201);
    expect(await fotografaCassa(prisma)).toBe(originalState);
  });

  it('importa un archivio v3 senza Cassa; rifiuta quelli che hanno riferimenti Cassa ma non i dati', async () => {
    async function asV3(buffer: Buffer) {
      return rewriteTenantBackupZip(buffer, (files) => {
        const keep = new Set(TENANT_BACKUP_V3_ENTITY_FILES.map((key) => `data/${key}.json`));
        for (const key of files.keys())
          if (key.startsWith('data/') && !keep.has(key)) files.delete(key);
        const manifest = JSON.parse(files.get('manifest.json')!.toString('utf8')) as {
          formatVersion: number;
          entityCounts: Record<string, number>;
          globalReferences?: unknown;
        };
        manifest.formatVersion = 3;
        delete manifest.globalReferences;
        for (const key of Object.keys(manifest.entityCounts))
          if (!keep.has(`data/${key}.json`)) delete manifest.entityCounts[key];
        files.set('manifest.json', Buffer.from(JSON.stringify(manifest)));
      });
    }
    const exportedB = await fetch(`${app.baseUrl}/tenant/backup/export`, {
      headers: { authorization: `Bearer ${tokenB}` },
    });
    expect(exportedB.status).toBe(200);
    const response = await restore(await asV3(Buffer.from(await exportedB.arrayBuffer())), tokenB);
    expect(response.status, await response.clone().text()).toBe(201);
    expect((await restore(await asV3(archive))).status).toBe(400);
    expect(await fotografaCassa(prisma)).toBe(originalState);
  });

  it('blocca restore e cancellazione quando un altro tenant punta ai dati bersaglio', async () => {
    const invalid = await prisma.document.create({
      data: {
        tenantId: IDS.tenantB,
        type: 'store_sale',
        reference: 'CORROTTO TEST',
        year: 2026,
        documentDate: new Date('2026-09-05'),
        createdByName: 'TEST',
        locationId: IDS.locB1,
        cashSessionId: String(saleInput['sessionId']),
      },
    });
    try {
      const before = await fullState();
      const beforeB = await fotografaCassa(prisma, IDS.tenantB);
      expect((await restore()).status).toBe(409);
      await expect(prisma.$transaction((tx) => deleteTenantData(tx, IDS.tenantA))).rejects.toThrow(
        /tra negozi/,
      );
      expect(await fullState()).toBe(before);
      expect(await fotografaCassa(prisma, IDS.tenantB)).toBe(beforeB);
    } finally {
      await prisma.document.delete({ where: { id: invalid.id } });
    }
  });

  it('la cancellazione amministrativa elimina solo il tenant bersaglio e preserva i cataloghi globali', async () => {
    expect((await chiama(app, 'DELETE', `/admin/tenants/${IDS.tenantA}`, { token })).stato).toBe(
      403,
    );
    const removed = await chiama(app, 'DELETE', `/admin/tenants/${IDS.tenantA}`, {
      token: adminToken,
    });
    expect(removed.stato, JSON.stringify(removed.corpo)).toBe(200);
    expect(await prisma.tenant.findUnique({ where: { id: IDS.tenantA } })).toBeNull();
    expect(await prisma.cashSession.count({ where: { tenantId: IDS.tenantA } })).toBe(0);
    expect(await prisma.creationIntent.count({ where: { tenantId: IDS.tenantA } })).toBe(0);
    expect(await fotografaCassa(prisma, IDS.tenantB)).toBe(otherState);
    expect(
      JSON.stringify(
        await Promise.all([
          prisma.vatNature.findMany({ orderBy: { id: 'asc' } }),
          prisma.paymentMethodCode.findMany({ orderBy: { id: 'asc' } }),
        ]),
      ),
    ).toBe(globals);
  });
});
