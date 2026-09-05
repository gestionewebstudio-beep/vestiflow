import { randomUUID } from 'node:crypto';

import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { ReturnInput, ReturnPreviewResult } from '../../cash-sessions/cash-return.service';
import { toStorableMinor } from '../../common/money.util';
import { avviaApp, chiama, type AppIntegrazione } from './app';
import { creaDatasetCassa, fotografaCassa } from './cassa.fixture';
import { IDS, svuota } from './fixture';
import { creaClientIntegrazione } from './prisma';

describe('resi parziali — importi originali, HTTP e PostgreSQL', () => {
  let prisma: PrismaClient;
  let app: AppIntegrazione;
  let token: string;
  let sessionId: string;
  let secondSessionId: string;
  let fixture: Awaited<ReturnType<typeof creaDatasetCassa>>;

  beforeAll(async () => {
    prisma = creaClientIntegrazione();
    fixture = await creaDatasetCassa(prisma);
    await prisma.user.update({
      where: { id: IDS.utenteSupervisore },
      data: { permissions: ['retail.register', 'retail.cash_return'] },
    });
    app = await avviaApp();
    token = await app.token(IDS.authA1);
    for (const locationId of [IDS.locA1, IDS.locA2]) {
      const response = await chiama(app, 'POST', '/cash-sessions/open', {
        token,
        corpo: { locationId, openingFloatMinor: 0 },
      });
      expect(response.stato).toBe(201);
      if (locationId === IDS.locA1) sessionId = (response.corpo as { id: string }).id;
      else secondSessionId = (response.corpo as { id: string }).id;
    }
  }, 120_000);

  afterAll(async () => {
    await app?.chiudi();
    if (prisma) {
      await svuota(prisma);
      await prisma.$disconnect();
    }
  });

  async function vendi(vat = 22, discount = 0) {
    const nature = await prisma.vatNature.findUniqueOrThrow({ where: { key: 'TAXABLE' } });
    const code = await prisma.vatCode.create({
      data: {
        tenantId: IDS.tenantA,
        natureId: nature.id,
        code: randomUUID().slice(0, 12),
        description: 'IVA TEST',
        ratePercent: vat,
      },
    });
    const unitPriceMinor = toStorableMinor(3656 / 3 / (1 + vat / 100) / (1 - discount / 100));
    const response = await chiama(app, 'POST', '/cash-sessions/checkout', {
      token,
      corpo: {
        locationId: IDS.locA1,
        sessionId,
        creationIntentId: randomUUID(),
        lines: [
          {
            variantId: fixture.variantId,
            quantity: 3,
            unitPriceMinor,
            discountPercent: discount,
            vatCodeId: code.id,
            description: 'Tre pezzi originali',
          },
        ],
        payments: [
          { paymentOptionId: fixture.cashId, amountMinor: 600 },
          { paymentOptionId: fixture.cardId, amountMinor: 3056, confirmed: true },
        ],
      },
    });
    expect(response.stato, JSON.stringify(response.corpo)).toBe(201);
    const document = await prisma.document.findUniqueOrThrow({
      where: { id: (response.corpo as { documentId: string }).documentId },
      include: { lines: true, storeSalePayments: { orderBy: { position: 'asc' } } },
    });
    expect(document.totalMinor).toBe(3656);
    expect(Number(document.lines[0]!.unitPriceMinor)).toBe(unitPriceMinor);
    // Prezzo, aliquota e descrizione correnti cambiano: il reso deve ignorarli.
    await prisma.productVariant.update({
      where: { id: fixture.variantId },
      data: { sellingPriceMinor: 99999 },
    });
    await prisma.vatCode.update({
      where: { id: code.id },
      data: { ratePercent: 77, description: 'IVA cambiata' },
    });
    return document;
  }

  async function anteprima(documentId: string, lineId: string, quantity: number) {
    const response = await chiama(app, 'POST', '/cash-sessions/returns/preview', {
      token,
      corpo: {
        locationId: IDS.locA1,
        originalDocumentId: documentId,
        lines: [{ originalLineId: lineId, quantity }],
      },
    });
    expect(response.stato, JSON.stringify(response.corpo)).toBe(201);
    return response.corpo as ReturnPreviewResult;
  }

  function richiesta(
    documentId: string,
    lineId: string,
    quantity: number,
    preview: ReturnPreviewResult,
  ): ReturnInput {
    let amount = preview.totalMinor;
    const refunds = preview.payments.flatMap((payment) => {
      const share = Math.min(amount, payment.remainingMinor);
      amount -= share;
      return share > 0
        ? [{ originalPaymentId: payment.originalPaymentId, amountMinor: share, confirmed: true }]
        : [];
    });
    expect(amount).toBe(0);
    return {
      locationId: IDS.locA1,
      sessionId,
      originalDocumentId: documentId,
      creationIntentId: randomUUID(),
      reason: 'Reso parziale TEST',
      lines: [{ originalLineId: lineId, quantity }],
      refunds,
    };
  }

  const scenarios = [0, 22].flatMap((vat) =>
    [0, 10, 33.33].flatMap((discount) =>
      [[1, 1, 1], [1, 2], [2, 1], [3]].map((quantities) => ({ vat, discount, quantities })),
    ),
  );
  it.each(scenarios)(
    '36,56 EUR — IVA $vat, sconto $discount, resi $quantities',
    async ({ vat, discount, quantities }) => {
      const original = await vendi(vat, discount);
      const line = original.lines[0]!;
      const amounts: number[] = [];
      for (const quantity of quantities) {
        const beforePreview = await fotografaCassa(prisma);
        const preview = await anteprima(original.id, line.id, quantity);
        expect(await fotografaCassa(prisma)).toBe(beforePreview);
        const payload = richiesta(original.id, line.id, quantity, preview);
        const response = await chiama(app, 'POST', '/cash-sessions/returns', {
          token,
          corpo: payload,
        });
        expect(response.stato, JSON.stringify(response.corpo)).toBe(201);
        expect(response.corpo).toMatchObject({ totaleMinor: preview.totalMinor });
        const returned = await prisma.document.findUniqueOrThrow({
          where: { id: (response.corpo as { documentId: string }).documentId },
          include: { lines: true, storeSalePayments: true },
        });
        expect(returned.subtotalMinor + returned.taxMinor).toBe(returned.totalMinor);
        expect(returned.lines[0]).toMatchObject({
          unitPriceMinor: line.unitPriceMinor,
          discountPercent: line.discountPercent,
          vatSnapshot: line.vatSnapshot,
          description: line.description,
          lineTotalMinor: preview.netMinor,
          lineVatTotalMinor: preview.vatMinor,
          lineGrossTotalMinor: preview.totalMinor,
        });
        expect(
          returned.storeSalePayments.reduce((sum, payment) => sum + payment.amountMinor, 0),
        ).toBe(preview.totalMinor);
        amounts.push(preview.totalMinor);
        const beforeRetry = await fotografaCassa(prisma);
        const retry = await chiama(app, 'POST', '/cash-sessions/returns', {
          token,
          corpo: payload,
        });
        expect(retry.corpo).toEqual(response.corpo);
        expect(await fotografaCassa(prisma)).toBe(beforeRetry);
      }
      expect(amounts.reduce((a, b) => a + b, 0)).toBe(3656);
      if (quantities.length === 3) expect(amounts).toEqual([1219, 1218, 1219]);
      const returned = await prisma.document.aggregate({
        where: { sourceDocumentId: original.id },
        _sum: { subtotalMinor: true, taxMinor: true, totalMinor: true },
      });
      expect(returned._sum).toEqual({
        subtotalMinor: original.subtotalMinor,
        taxMinor: original.taxMinor,
        totalMinor: original.totalMinor,
      });
      for (const payment of original.storeSalePayments) {
        const refunded = await prisma.storeSalePayment.aggregate({
          where: { refundedFromPaymentId: payment.id },
          _sum: { amountMinor: true },
        });
        expect(refunded._sum.amountMinor).toBe(payment.amountMinor);
      }
    },
  );

  it('concorrenza tra due sedi: rifiuta un preventivo diventato obsoleto senza effetti parziali', async () => {
    const original = await vendi();
    const lineId = original.lines[0]!.id;
    const preview = await anteprima(original.id, lineId, 1);
    const first = richiesta(original.id, lineId, 1, preview);
    const second = {
      ...richiesta(original.id, lineId, 1, preview),
      locationId: IDS.locA2,
      sessionId: secondSessionId,
    };
    const results = await Promise.all(
      [first, second].map((corpo) =>
        chiama(app, 'POST', '/cash-sessions/returns', { token, corpo }),
      ),
    );
    expect(results.map((result) => result.stato).sort()).toEqual([201, 422]);
    expect(await prisma.document.count({ where: { sourceDocumentId: original.id } })).toBe(1);
    const rejected = results[0]!.stato === 422 ? first : second;
    expect(
      await prisma.creationIntent.count({
        where: { tenantId: IDS.tenantA, intentId: rejected.creationIntentId },
      }),
    ).toBe(0);
    const beforeRefusal = await fotografaCassa(prisma);
    const retryRejected = await chiama(app, 'POST', '/cash-sessions/returns', {
      token,
      corpo: rejected,
    });
    expect(retryRejected.stato).toBe(422);
    expect(await fotografaCassa(prisma)).toBe(beforeRefusal);
    for (const amount of [1218, 1219]) {
      const updated = await anteprima(original.id, lineId, 1);
      expect(updated.totalMinor).toBe(amount);
      const response = await chiama(app, 'POST', '/cash-sessions/returns', {
        token,
        corpo: richiesta(original.id, lineId, 1, updated),
      });
      expect(response.stato, JSON.stringify(response.corpo)).toBe(201);
    }
    const total = await prisma.document.aggregate({
      where: { sourceDocumentId: original.id },
      _sum: { totalMinor: true },
    });
    expect(total._sum.totalMinor).toBe(3656);
  });

  it('righe duplicate rifiutate da anteprima e salvataggio senza effetti', async () => {
    const original = await vendi();
    const lineId = original.lines[0]!.id;
    const preview = await anteprima(original.id, lineId, 1);
    const payload = richiesta(original.id, lineId, 1, preview);
    const lines = [...payload.lines, ...payload.lines];
    const before = await fotografaCassa(prisma);
    const saved = await chiama(app, 'POST', '/cash-sessions/returns', {
      token,
      corpo: { ...payload, lines },
    });
    expect(saved.stato).toBe(422);
    const quoted = await chiama(app, 'POST', '/cash-sessions/returns/preview', {
      token,
      corpo: { locationId: IDS.locA1, originalDocumentId: original.id, lines },
    });
    expect(quoted.stato).toBe(422);
    expect(await fotografaCassa(prisma)).toBe(before);
  });

  it('anteprima soggetta a tenant e sede; nessuna informazione o scrittura fuori perimetro', async () => {
    const original = await vendi();
    const restrictedToken = await app.token(IDS.authSupervisore);
    for (const locationId of [IDS.locA2, IDS.locB1]) {
      const response = await chiama(app, 'POST', '/cash-sessions/returns/preview', {
        token: restrictedToken,
        corpo: {
          locationId,
          originalDocumentId: original.id,
          lines: [{ originalLineId: original.lines[0]!.id, quantity: 1 }],
        },
      });
      expect(response.stato).toBe(403);
    }
    const response = await chiama(app, 'POST', '/cash-sessions/returns/preview', {
      token,
      corpo: {
        locationId: IDS.locA1,
        originalDocumentId: IDS.docB1,
        lines: [{ originalLineId: original.lines[0]!.id, quantity: 1 }],
      },
    });
    expect(response.stato).toBe(404);
  });

  it('uno storico incoerente viene segnalato senza correggere o troncare importi in silenzio', async () => {
    const original = await vendi();
    const lineId = original.lines[0]!.id;
    const preview = await anteprima(original.id, lineId, 1);
    const first = await chiama(app, 'POST', '/cash-sessions/returns', {
      token,
      corpo: richiesta(original.id, lineId, 1, preview),
    });
    expect(first.stato).toBe(201);
    // Rappresenta una riga legacy incoerente; la mutazione è esclusivamente della fixture TEST.
    await prisma.documentLine.updateMany({
      where: { documentId: (first.corpo as { documentId: string }).documentId },
      data: { lineVatTotalMinor: { increment: 1 } },
    });
    const before = await fotografaCassa(prisma);
    const quoted = await chiama(app, 'POST', '/cash-sessions/returns/preview', {
      token,
      corpo: {
        locationId: IDS.locA1,
        originalDocumentId: original.id,
        lines: [{ originalLineId: lineId, quantity: 1 }],
      },
    });
    expect(quoted.stato).toBe(422);
    const saved = await chiama(app, 'POST', '/cash-sessions/returns', {
      token,
      corpo: richiesta(original.id, lineId, 1, preview),
    });
    expect(saved.stato).toBe(422);
    expect(await fotografaCassa(prisma)).toBe(before);
  });
});
