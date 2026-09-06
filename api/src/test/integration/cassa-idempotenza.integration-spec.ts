import { randomUUID } from 'node:crypto';

import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { CheckoutInput } from '../../cash-sessions/cash-checkout.service';
import type { ReturnInput } from '../../cash-sessions/cash-return.service';
import { avviaApp, chiama, type AppIntegrazione } from './app';
import { creaDatasetCassa, fotografaCassa } from './cassa.fixture';
import { IDS, svuota } from './fixture';
import { creaClientIntegrazione } from './prisma';

describe('idempotenza Cassa — HTTP e PostgreSQL reali', () => {
  let prisma: PrismaClient;
  let app: AppIntegrazione;
  let token: string;
  let restrictedToken: string;
  let otherTenantToken: string;
  let sale: CheckoutInput;
  let returned: ReturnInput;
  let saleResult: unknown;
  let returnResult: unknown;

  beforeAll(async () => {
    prisma = creaClientIntegrazione();
    const fixture = await creaDatasetCassa(prisma);
    // Questo operatore può registrare/resi ma opera soltanto in A1.
    await prisma.user.update({
      where: { id: IDS.utenteSupervisore },
      data: { permissions: ['retail.register', 'retail.cash_return'] },
    });
    const otherAuth = randomUUID();
    await prisma.user.create({
      data: {
        tenantId: IDS.tenantB,
        authUserId: otherAuth,
        role: 'owner',
        email: 'cassa.b@integrazione.local',
        displayName: 'Tenant B',
      },
    });
    app = await avviaApp();
    token = await app.token(IDS.authA1);
    restrictedToken = await app.token(IDS.authSupervisore);
    otherTenantToken = await app.token(otherAuth);
    const opened = await chiama(app, 'POST', '/cash-sessions/open', {
      token,
      corpo: { locationId: IDS.locA2, openingFloatMinor: 0 },
    });
    expect(opened.stato, JSON.stringify(opened.corpo)).toBe(201);
    sale = {
      locationId: IDS.locA2,
      sessionId: (opened.corpo as { id: string }).id,
      creationIntentId: randomUUID(),
      lines: [
        {
          variantId: fixture.variantId,
          quantity: 2,
          unitPriceMinor: 100,
          description: 'Originale',
        },
      ],
      payments: [{ paymentOptionId: fixture.cashId, amountMinor: 200, tenderedMinor: 250 }],
    };
    const result = await chiama(app, 'POST', '/cash-sessions/checkout', { token, corpo: sale });
    expect(result.stato, JSON.stringify(result.corpo)).toBe(201);
    saleResult = result.corpo;
    const document = await prisma.document.findUniqueOrThrow({
      where: { id: (saleResult as { documentId: string }).documentId },
      include: { lines: true, storeSalePayments: true },
    });
    returned = {
      locationId: sale.locationId,
      sessionId: sale.sessionId,
      creationIntentId: randomUUID(),
      originalDocumentId: document.id,
      reason: 'Motivo originale',
      lines: [{ originalLineId: document.lines[0]!.id, quantity: 1 }],
      refunds: [{ originalPaymentId: document.storeSalePayments[0]!.id, amountMinor: 100 }],
    };
    const reso = await chiama(app, 'POST', '/cash-sessions/returns', { token, corpo: returned });
    expect(reso.stato, JSON.stringify(reso.corpo)).toBe(201);
    returnResult = reso.corpo;
  }, 120_000);

  afterAll(async () => {
    await app?.chiudi();
    if (prisma) {
      await svuota(prisma);
      await prisma.$disconnect();
    }
  });

  for (const operation of ['checkout', 'returns'] as const) {
    const input = () => (operation === 'checkout' ? sale : returned);
    const expected = () => (operation === 'checkout' ? saleResult : returnResult);

    it(`${operation}: consulta l'intento senza il comando, con autorizzazione attuale e senza scritture`, async () => {
      const path = `/cash-sessions/${operation === 'checkout' ? 'checkout' : 'return'}-intents/${input().creationIntentId}`;
      const before = await fotografaCassa(prisma);
      const intents = await prisma.creationIntent.count();
      const result = await chiama(app, 'GET', path, { token });
      expect(result.stato, JSON.stringify(result.corpo)).toBe(200);
      expect(result.corpo).toMatchObject({
        status: 'recorded',
        documentId: (expected() as { documentId: string }).documentId,
        locationId: IDS.locA2,
        sessionId: input().sessionId,
      });
      expect(result.corpo).toMatchObject({
        intentId: input().creationIntentId,
        reference: expect.any(String),
        documentDate: expect.any(String),
        locationName: expect.any(String),
        totalMinor: operation === 'checkout' ? 200 : 100,
      });
      expect((await chiama(app, 'GET', path, { token })).corpo).toEqual(result.corpo);
      expect((await chiama(app, 'GET', path, { token: restrictedToken })).stato).toBe(403);
      const other = await chiama(app, 'GET', path, { token: otherTenantToken });
      expect(other.stato).toBe(200);
      expect(other.corpo).toEqual({ status: 'unconfirmed' });
      expect((await chiama(app, 'GET', path)).stato).toBe(401);
      expect(await fotografaCassa(prisma)).toBe(before);
      expect(await prisma.creationIntent.count()).toBe(intents);
    });

    it(`${operation}: intento assente o incompleto non dichiara che l'operazione non esiste`, async () => {
      const intentId = randomUUID();
      const path = `/cash-sessions/${operation === 'checkout' ? 'checkout' : 'return'}-intents/${intentId}`;
      expect((await chiama(app, 'GET', path, { token })).corpo).toEqual({ status: 'unconfirmed' });
      await prisma.creationIntent.create({
        data: {
          tenantId: IDS.tenantA,
          intentId,
          scope: operation === 'checkout' ? 'store_sale' : 'store_return',
          fingerprint: 'fixture',
        },
      });
      expect((await chiama(app, 'GET', path, { token })).corpo).toEqual({ status: 'unconfirmed' });
      await prisma.creationIntent.deleteMany({ where: { tenantId: IDS.tenantA, intentId } });
    });

    it(`${operation}: transazione ancora in corso non è assenza certa e non riceve scritture dal recupero`, async () => {
      const intentId = randomUUID();
      const path = `/cash-sessions/${operation === 'checkout' ? 'checkout' : 'return'}-intents/${intentId}`;
      const before = await fotografaCassa(prisma);
      let ready!: () => void;
      let release!: () => void;
      const started = new Promise<void>((resolve) => {
        ready = resolve;
      });
      const finish = new Promise<void>((resolve) => {
        release = resolve;
      });
      const transaction = prisma.$transaction(
        async (tx) => {
          await tx.creationIntent.create({
            data: {
              tenantId: IDS.tenantA,
              intentId,
              scope: operation === 'checkout' ? 'store_sale' : 'store_return',
              fingerprint: 'in-flight',
              resultRef: (expected() as { documentId: string }).documentId,
            },
          });
          ready();
          await finish;
        },
        { timeout: 15_000 },
      );
      try {
        await started;
        const response = await chiama(app, 'GET', path, { token });
        expect(response.stato).toBe(200);
        expect(response.corpo).toEqual({ status: 'unconfirmed' });
      } finally {
        release();
        await transaction;
      }
      expect((await chiama(app, 'GET', path, { token })).corpo).toMatchObject({
        status: 'recorded',
      });
      expect(await fotografaCassa(prisma)).toBe(before);
      await prisma.creationIntent.deleteMany({ where: { tenantId: IDS.tenantA, intentId } });
    });

    it(`${operation}: non recupera un intento del tipo opposto o un riferimento del tenant altrui`, async () => {
      const path = `/cash-sessions/${operation === 'checkout' ? 'checkout' : 'return'}-intents/`;
      const oppositeId =
        operation === 'checkout' ? returned.creationIntentId : sale.creationIntentId;
      expect((await chiama(app, 'GET', path + oppositeId, { token })).corpo).toEqual({
        status: 'unconfirmed',
      });
      const intentId = randomUUID();
      await prisma.creationIntent.create({
        data: {
          tenantId: IDS.tenantB,
          intentId,
          scope: operation === 'checkout' ? 'store_sale' : 'store_return',
          fingerprint: 'bad-ref',
          resultRef: (expected() as { documentId: string }).documentId,
        },
      });
      const before = await fotografaCassa(prisma);
      const otherBefore = await fotografaCassa(prisma, IDS.tenantB);
      const intentBefore = await prisma.creationIntent.findMany({ orderBy: { id: 'asc' } });
      expect(
        (await chiama(app, 'GET', path + intentId, { token: otherTenantToken })).corpo,
      ).toEqual({ status: 'unconfirmed' });
      expect(await fotografaCassa(prisma)).toBe(before);
      expect(await fotografaCassa(prisma, IDS.tenantB)).toBe(otherBefore);
      expect(await prisma.creationIntent.findMany({ orderBy: { id: 'asc' } })).toEqual(
        intentBefore,
      );
      await prisma.creationIntent.deleteMany({ where: { tenantId: IDS.tenantB, intentId } });
    });

    it(`${operation}: la normale Vendita al banco e il suo reso autonomo non diventano operazioni Cassa`, async () => {
      const intentId = randomUUID();
      const bank = await chiama(
        app,
        'POST',
        operation === 'checkout' ? '/store-sales' : '/store-sales/returns',
        {
          token,
          corpo: {
            locationId: IDS.locA1,
            creationIntentId: intentId,
            lines: [
              {
                variantId: sale.lines[0]!.variantId,
                quantity: 1,
                unitPriceMinor: 150,
                ...(operation === 'checkout' ? { loadsStock: false } : { restockable: false }),
              },
            ],
          },
        },
      );
      expect(bank.stato, JSON.stringify(bank.corpo)).toBe(201);
      const id = (bank.corpo as { id: string }).id;
      expect((await prisma.document.findUniqueOrThrow({ where: { id } })).cashSessionId).toBeNull();
      const before = await fotografaCassa(prisma);
      const intentsBefore = await prisma.creationIntent.findMany({ orderBy: { id: 'asc' } });
      const lookup = await chiama(
        app,
        'GET',
        `/cash-sessions/${operation === 'checkout' ? 'checkout' : 'return'}-intents/${intentId}`,
        { token },
      );
      expect(lookup.stato).toBe(200);
      expect(lookup.corpo).toEqual({ status: 'unconfirmed' });
      expect(await fotografaCassa(prisma)).toBe(before);
      expect(await prisma.creationIntent.findMany({ orderBy: { id: 'asc' } })).toEqual(
        intentsBefore,
      );
    });

    it(`${operation}: risposta persa, più retry recuperano il medesimo documento senza effetti`, async () => {
      const before = await fotografaCassa(prisma);
      const responses = await Promise.all(
        Array.from({ length: 3 }, () =>
          chiama(app, 'POST', `/cash-sessions/${operation}`, { token, corpo: input() }),
        ),
      );
      for (const response of responses) {
        expect(response.stato, JSON.stringify(response.corpo)).toBe(201);
        expect(response.corpo).toEqual(expected());
      }
      expect(await fotografaCassa(prisma)).toBe(before);
    });

    it.each(['identico', 'contenuto diverso', 'sede richiesta assegnata'] as const)(
      `${operation}: replay fuori sede (%s) negato senza riferimento al documento`,
      async (mode) => {
        const body = structuredClone(input());
        const payload = {
          ...body,
          ...(mode === 'contenuto diverso'
            ? { lines: body.lines.map((line) => ({ ...line, quantity: line.quantity + 1 })) }
            : {}),
          ...(mode === 'sede richiesta assegnata' ? { locationId: IDS.locA1 } : {}),
        };
        const before = await fotografaCassa(prisma);
        const response = await chiama(app, 'POST', `/cash-sessions/${operation}`, {
          token: restrictedToken,
          corpo: payload,
        });
        expect(response.stato, JSON.stringify(response.corpo)).toBe(403);
        expect(JSON.stringify(response.corpo)).not.toContain(
          (expected() as { documentId: string }).documentId,
        );
        expect(await fotografaCassa(prisma)).toBe(before);
      },
    );

    it(`${operation}: un altro tenant non recupera l'intento e non produce effetti`, async () => {
      const before = await fotografaCassa(prisma);
      const beforeOther = await fotografaCassa(prisma, IDS.tenantB);
      const response = await chiama(app, 'POST', `/cash-sessions/${operation}`, {
        token: otherTenantToken,
        corpo: input(),
      });
      expect(response.stato, JSON.stringify(response.corpo)).toBe(403);
      expect(await fotografaCassa(prisma)).toBe(before);
      expect(await fotografaCassa(prisma, IDS.tenantB)).toBe(beforeOther);
    });

    it(`${operation}: revoca della sede via API efficace anche su un replay già autorizzato`, async () => {
      const grant = await chiama(app, 'PATCH', `/tenant/users/${IDS.utenteSupervisore}`, {
        token,
        corpo: { assignedLocationIds: [IDS.locA1, IDS.locA2] },
      });
      expect(grant.stato, JSON.stringify(grant.corpo)).toBe(200);
      const lookupPath = `/cash-sessions/${operation === 'checkout' ? 'checkout' : 'return'}-intents/${input().creationIntentId}`;
      expect((await chiama(app, 'GET', lookupPath, { token: restrictedToken })).stato).toBe(200);
      const replay = await chiama(app, 'POST', `/cash-sessions/${operation}`, {
        token: restrictedToken,
        corpo: input(),
      });
      expect(replay.stato, JSON.stringify(replay.corpo)).toBe(201);
      expect(replay.corpo).toEqual(expected());
      const revoke = await chiama(app, 'PATCH', `/tenant/users/${IDS.utenteSupervisore}`, {
        token,
        corpo: { assignedLocationIds: [IDS.locA1] },
      });
      expect(revoke.stato, JSON.stringify(revoke.corpo)).toBe(200);
      const before = await fotografaCassa(prisma);
      expect((await chiama(app, 'GET', lookupPath, { token: restrictedToken })).stato).toBe(403);
      const denied = await chiama(app, 'POST', `/cash-sessions/${operation}`, {
        token: restrictedToken,
        corpo: input(),
      });
      expect(denied.stato, JSON.stringify(denied.corpo)).toBe(403);
      expect(await fotografaCassa(prisma)).toBe(before);
    });
  }

  it.each([
    'description',
    'vatCodeId',
    'discountPercent',
    'unitPriceMinor',
    'confirmed',
    'tenderedMinor',
    'paymentOptionId',
  ] as const)('vendita: %s diverso non è un replay', async (field) => {
    const line = { ...sale.lines[0]! };
    const payment = { ...sale.payments[0]! };
    if (field === 'description') line.description = 'Descrizione cambiata';
    if (field === 'vatCodeId') line.vatCodeId = randomUUID();
    if (field === 'discountPercent') line.discountPercent = 10;
    if (field === 'unitPriceMinor') line.unitPriceMinor = 110;
    if (field === 'confirmed') payment.confirmed = true;
    if (field === 'tenderedMinor') payment.tenderedMinor = 300;
    if (field === 'paymentOptionId') payment.paymentOptionId = randomUUID();
    const before = await fotografaCassa(prisma);
    const response = await chiama(app, 'POST', '/cash-sessions/checkout', {
      token,
      corpo: { ...sale, lines: [line], payments: [payment] },
    });
    expect(response.stato, JSON.stringify(response.corpo)).toBe(409);
    expect(response.corpo).toMatchObject({
      code: 'creation_intent_mismatch',
      resultRef: (saleResult as { documentId: string }).documentId,
    });
    expect(await fotografaCassa(prisma)).toBe(before);
  });

  it.each([
    'reason',
    'confirmed',
    'originalDocumentId',
    'originalLineId',
    'originalPaymentId',
    'amountMinor',
  ] as const)('reso: %s diverso non è un replay', async (field) => {
    const line = { ...returned.lines[0]! };
    const refund = { ...returned.refunds[0]! };
    if (field === 'confirmed') refund.confirmed = true;
    if (field === 'originalLineId') line.originalLineId = randomUUID();
    if (field === 'originalPaymentId') refund.originalPaymentId = randomUUID();
    if (field === 'amountMinor') refund.amountMinor = 90;
    const before = await fotografaCassa(prisma);
    const response = await chiama(app, 'POST', '/cash-sessions/returns', {
      token,
      corpo: {
        ...returned,
        lines: [line],
        refunds: [refund],
        ...(field === 'reason' ? { reason: 'Altro motivo' } : {}),
        ...(field === 'originalDocumentId' ? { originalDocumentId: randomUUID() } : {}),
      },
    });
    expect(response.stato, JSON.stringify(response.corpo)).toBe(409);
    expect(response.corpo).toMatchObject({
      code: 'creation_intent_mismatch',
      resultRef: (returnResult as { documentId: string }).documentId,
    });
    expect(await fotografaCassa(prisma)).toBe(before);
  });

  it('valori facoltativi equivalenti e spazi del motivo mantengono lo stesso intento', async () => {
    const result = await chiama(app, 'POST', '/cash-sessions/checkout', {
      token,
      corpo: {
        ...sale,
        lines: [{ ...sale.lines[0], discountPercent: 0, vatCodeId: null }],
        payments: [{ ...sale.payments[0], confirmed: false }],
      },
    });
    expect(result.corpo).toEqual(saleResult);
    const reso = await chiama(app, 'POST', '/cash-sessions/returns', {
      token,
      corpo: {
        ...returned,
        reason: '  Motivo   originale ',
        refunds: [{ ...returned.refunds[0], confirmed: false }],
      },
    });
    expect(reso.corpo).toEqual(returnResult);
  });

  it('un intento nuovo concorrente crea una sola vendita e un solo reso', async () => {
    const payload = { ...sale, creationIntentId: randomUUID() };
    const results = await Promise.all(
      Array.from({ length: 3 }, () =>
        chiama(app, 'POST', '/cash-sessions/checkout', { token, corpo: payload }),
      ),
    );
    for (const response of results) {
      expect(response.stato).toBe(201);
      expect(response.corpo).toEqual(results[0]!.corpo);
    }
    const id = (results[0]!.corpo as { documentId: string }).documentId;
    const doc = await prisma.document.findUniqueOrThrow({
      where: { id },
      include: { lines: true, storeSalePayments: true },
    });
    const reso = {
      ...returned,
      creationIntentId: randomUUID(),
      originalDocumentId: id,
      lines: [{ originalLineId: doc.lines[0]!.id, quantity: 1 }],
      refunds: [{ originalPaymentId: doc.storeSalePayments[0]!.id, amountMinor: 100 }],
    };
    const refunds = await Promise.all(
      Array.from({ length: 3 }, () =>
        chiama(app, 'POST', '/cash-sessions/returns', { token, corpo: reso }),
      ),
    );
    for (const response of refunds) {
      expect(response.stato).toBe(201);
      expect(response.corpo).toEqual(refunds[0]!.corpo);
    }
    expect(await prisma.document.count({ where: { sourceDocumentId: id } })).toBe(1);
    expect(await prisma.stockMovement.count({ where: { sourceDocumentId: id } })).toBe(1);
  });

  it('il replay resta possibile dopo chiusura, senza riscrivere la quadratura', async () => {
    const closed = await chiama(
      app,
      'POST',
      `/cash-sessions/${sale.sessionId}/close?locationId=${sale.locationId}`,
      { token, corpo: { countedCashMinor: 200 } },
    );
    expect(closed.stato, JSON.stringify(closed.corpo)).toBe(201);
    const before = await fotografaCassa(prisma);
    for (const [operation, payload, expected] of [
      ['checkout', sale, saleResult],
      ['returns', returned, returnResult],
    ] as const) {
      const result = await chiama(app, 'POST', `/cash-sessions/${operation}`, {
        token,
        corpo: payload,
      });
      expect(result.stato, JSON.stringify(result.corpo)).toBe(201);
      expect(result.corpo).toEqual(expected);
    }
    expect(await fotografaCassa(prisma)).toBe(before);
  });
});
