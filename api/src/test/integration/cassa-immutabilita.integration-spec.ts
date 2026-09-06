import { randomUUID } from 'node:crypto';

import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { avviaApp, chiama, type AppIntegrazione } from './app';
import { creaDatasetCassa, fotografaCassa } from './cassa.fixture';
import { IDS, svuota } from './fixture';
import { creaClientIntegrazione } from './prisma';

describe.each(['open', 'closed'] as const)(
  'immutabilità Cassa — sessione %s, HTTP reale',
  (status) => {
    let prisma: PrismaClient;
    let app: AppIntegrazione;
    let token: string;
    let fixture: Awaited<ReturnType<typeof creaDatasetCassa>>;
    let saleId: string;
    let returnId: string;
    let attachmentId: string;

    beforeAll(async () => {
      prisma = creaClientIntegrazione();
      fixture = await creaDatasetCassa(prisma);
      app = await avviaApp();
      token = await app.token(IDS.authA1);
      const opened = await chiama(app, 'POST', '/cash-sessions/open', {
        token,
        corpo: { locationId: IDS.locA1, openingFloatMinor: 0 },
      });
      expect(opened.stato, JSON.stringify(opened.corpo)).toBe(201);
      const sessionId = (opened.corpo as { id: string }).id;
      const sale = await chiama(app, 'POST', '/cash-sessions/checkout', {
        token,
        corpo: {
          locationId: IDS.locA1,
          sessionId,
          creationIntentId: randomUUID(),
          lines: [{ variantId: fixture.variantId, quantity: 2, unitPriceMinor: 100 }],
          payments: [{ paymentOptionId: fixture.cashId, amountMinor: 200, tenderedMinor: 200 }],
        },
      });
      expect(sale.stato, JSON.stringify(sale.corpo)).toBe(201);
      saleId = (sale.corpo as { documentId: string }).documentId;
      const doc = await prisma.document.findUniqueOrThrow({
        where: { id: saleId },
        include: { lines: true, storeSalePayments: true },
      });
      const returned = await chiama(app, 'POST', '/cash-sessions/returns', {
        token,
        corpo: {
          locationId: IDS.locA1,
          sessionId,
          originalDocumentId: saleId,
          creationIntentId: randomUUID(),
          reason: 'Reso TEST',
          lines: [{ originalLineId: doc.lines[0]!.id, quantity: 1 }],
          refunds: [{ originalPaymentId: doc.storeSalePayments[0]!.id, amountMinor: 100 }],
        },
      });
      expect(returned.stato, JSON.stringify(returned.corpo)).toBe(201);
      returnId = (returned.corpo as { documentId: string }).documentId;
      // Vendita senza resi: nessuna FK del reso può mascherare un gate mancante.
      const unreturned = await chiama(app, 'POST', '/cash-sessions/checkout', {
        token,
        corpo: {
          locationId: IDS.locA1,
          sessionId,
          creationIntentId: randomUUID(),
          lines: [{ variantId: fixture.variantId, quantity: 1, unitPriceMinor: 100 }],
          payments: [{ paymentOptionId: fixture.cashId, amountMinor: 100 }],
        },
      });
      expect(unreturned.stato, JSON.stringify(unreturned.corpo)).toBe(201);
      saleId = (unreturned.corpo as { documentId: string }).documentId;
      // Metadato storico senza upload: un rifiuto non deve contattare lo storage.
      const attachment = await prisma.documentAttachment.create({
        data: {
          tenantId: IDS.tenantA,
          documentId: saleId,
          fileName: 'storico.pdf',
          mimeType: 'application/pdf',
          storagePath: `${IDS.tenantA}/${saleId}/storico.pdf`,
          sizeBytes: 1,
          createdByName: 'TEST',
        },
      });
      attachmentId = attachment.id;
      if (status === 'closed') {
        const closed = await chiama(
          app,
          'POST',
          `/cash-sessions/${sessionId}/close?locationId=${IDS.locA1}`,
          {
            token,
            corpo: { countedCashMinor: 200 },
          },
        );
        expect(closed.stato, JSON.stringify(closed.corpo)).toBe(201);
      }
    }, 120_000);

    afterAll(async () => {
      await app?.chiudi();
      if (prisma) {
        await svuota(prisma);
        await prisma.$disconnect();
      }
    }, 60_000);

    for (const type of ['sale', 'return'] as const) {
      it.each(['banco', 'update', 'delete', 'cancel', 'conversion'] as const)(
        `${type}: rifiuta %s senza effetti su quote, magazzino e quadratura`,
        async (operation) => {
          const id = type === 'sale' ? saleId : returnId;
          const before = await fotografaCassa(prisma);
          const routes = {
            banco: [
              'POST',
              type === 'sale' ? '/store-sales' : '/store-sales/returns',
              {
                id,
                locationId: IDS.locA1,
                lines: [
                  {
                    variantId: fixture.variantId,
                    quantity: 1,
                    unitPriceMinor: 150,
                    ...(type === 'return' ? { restockable: true } : {}),
                  },
                ],
              },
            ],
            update: ['PATCH', `/documents/${id}`, { internalComment: 'Mutazione vietata' }],
            delete: ['DELETE', `/documents/${id}`, undefined],
            cancel: ['POST', `/documents/${id}/cancel`, undefined],
            conversion: ['POST', `/documents/${id}/convert-prefill`, { targetType: 'invoice' }],
          } as const;
          const [method, url, body] = routes[operation];
          const result = await chiama(app, method, url, { token, corpo: body });
          expect(result.stato, JSON.stringify(result.corpo)).toBe(409);
          expect(result.corpo).toMatchObject({ code: 'cash_document_immutable' });
          expect(await fotografaCassa(prisma)).toBe(before);
        },
      );
    }

    it.each(['PATCH', 'DELETE'] as const)(
      'rifiuta %s allegato prima dello storage',
      async (method) => {
        const before = await fotografaCassa(prisma);
        const result = await chiama(
          app,
          method,
          `/documents/${saleId}/attachments/${attachmentId}`,
          {
            token,
            corpo: method === 'PATCH' ? { fileName: 'alterato.pdf' } : undefined,
          },
        );
        expect(result.stato, JSON.stringify(result.corpo)).toBe(409);
        expect(await fotografaCassa(prisma)).toBe(before);
      },
    );

    it('rifiuta anche upload di un nuovo allegato', async () => {
      const before = await fotografaCassa(prisma);
      const form = new FormData();
      form.append('file', new Blob(['%PDF-1.4\nTEST'], { type: 'application/pdf' }), 'test.pdf');
      const response = await fetch(`${app.baseUrl}/documents/${saleId}/attachments`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
        body: form,
      });
      expect(response.status, await response.text()).toBe(409);
      expect(await fotografaCassa(prisma)).toBe(before);
    });

    it.each(['sale', 'return'] as const)(
      'il normale %s al banco resta modificabile e cancellabile',
      async (type) => {
        const path = type === 'sale' ? '/store-sales' : '/store-sales/returns';
        const body = {
          locationId: IDS.locA1,
          creationIntentId: randomUUID(),
          lines: [
            {
              variantId: fixture.variantId,
              quantity: 1,
              unitPriceMinor: 150,
              ...(type === 'return' ? { restockable: true } : { loadsStock: true }),
            },
          ],
        };
        const created = await chiama(app, 'POST', path, { token, corpo: body });
        expect(created.stato, JSON.stringify(created.corpo)).toBe(201);
        const id = (created.corpo as { id: string }).id;
        const modified = await chiama(app, 'POST', path, {
          token,
          corpo: {
            ...body,
            id,
            lines: [{ ...body.lines[0], quantity: 2 }],
          },
        });
        expect(modified.stato, JSON.stringify(modified.corpo)).toBe(201);
        const doc = await prisma.document.findUniqueOrThrow({ where: { id } });
        expect(doc.cashSessionId).toBeNull();
        expect(doc.sourceDocumentId).toBeNull();
        const removed = await chiama(app, 'DELETE', `/documents/${id}`, { token });
        expect(removed.stato, JSON.stringify(removed.corpo)).toBe(200);
        expect(await prisma.document.findUnique({ where: { id } })).toBeNull();
      },
    );

    it.each(['goods-receipt', 'purchase-invoice', 'transfer', 'adjustment'] as const)(
      'il salvataggio dedicato %s rifiuta un identificativo Cassa senza effetti',
      async (workflow) => {
        const before = await fotografaCassa(prisma);
        const common = { id: saleId, documentDate: '2026-09-05' };
        const lines = [{ variantId: fixture.variantId, description: 'TEST', quantity: 1 }];
        const bodies = {
          'goods-receipt': { ...common, type: 'manual_load', locationId: IDS.locA1, lines: [] },
          'purchase-invoice': { ...common, supplierId: fixture.supplierId, lines: [] },
          transfer: { ...common, locationId: IDS.locA1, targetLocationId: IDS.locA2, lines },
          adjustment: {
            ...common,
            locationId: IDS.locA1,
            adjustmentDirection: 'increase',
            internalComment: 'TEST',
            lines,
          },
        };
        const result = await chiama(app, 'POST', `/documents/${workflow}/save`, {
          token,
          corpo: bodies[workflow],
        });
        expect(result.stato, JSON.stringify(result.corpo)).toBe(
          workflow === 'goods-receipt' ? 409 : 404,
        );
        expect(await fotografaCassa(prisma)).toBe(before);
      },
    );
  },
);
