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
