import { randomUUID } from 'node:crypto';

import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { avviaApp, chiama, type AppIntegrazione } from './app';
import { creaDatasetCassa, fotografaCassa } from './cassa.fixture';
import { IDS, svuota } from './fixture';
import { creaClientIntegrazione } from './prisma';

describe('Cassa — contratto IVA lookup/checkout e rifiuto senza effetti', () => {
  let prisma: PrismaClient;
  let app: AppIntegrazione;
  let token: string;
  let sessionId: string;
  let fixture: Awaited<ReturnType<typeof creaDatasetCassa>>;
  let natureId: string;
  beforeAll(async () => {
    prisma = creaClientIntegrazione();
    fixture = await creaDatasetCassa(prisma);
    natureId = (await prisma.vatNature.findUniqueOrThrow({ where: { key: 'TAXABLE' } })).id;
    app = await avviaApp();
    token = await app.token(IDS.authA1);
    const opened = await chiama(app, 'POST', '/cash-sessions/open', {
      token,
      corpo: { locationId: IDS.locA1, openingFloatMinor: 0 },
    });
    expect(opened.stato).toBe(201);
    sessionId = (opened.corpo as { id: string }).id;
  });
  afterAll(async () => {
    await app?.chiudi();
    if (prisma) {
      await svuota(prisma);
      await prisma.$disconnect();
    }
  });
  function request(vatCodeId: string, amountMinor: number) {
    return {
      locationId: IDS.locA1,
      sessionId,
      creationIntentId: randomUUID(),
      lines: [{ variantId: fixture.variantId, quantity: 3, unitPriceMinor: 1000.1234, vatCodeId }],
      payments: [{ paymentOptionId: fixture.cashId, amountMinor, tenderedMinor: 4000 }],
    };
  }

  it('lookup conserva aliquota frazionaria e modalità; il checkout restituisce il lordo effettivo', async () => {
    const code = await prisma.vatCode.create({
      data: {
        tenantId: IDS.tenantA,
        natureId,
        code: 'IVA4.5',
        description: 'TEST',
        ratePercent: 4.5,
      },
    });
    const variant = await prisma.productVariant.findUniqueOrThrow({
      where: { id: fixture.variantId },
    });
    await prisma.product.update({
      where: { id: variant.productId },
      data: { defaultVatCodeId: code.id },
    });
    const lookup = await chiama(
      app,
      'GET',
      `/store-sales/lookup?locationId=${IDS.locA1}&code=CASSA-TEST`,
      { token },
    );
    expect(lookup.stato).toBe(200);
    expect(lookup.corpo).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          vatSnapshot: expect.objectContaining({ ratePercent: 4.5, calculationMode: 'standard' }),
        }),
      ]),
    );
    const response = await chiama(app, 'POST', '/cash-sessions/checkout', {
      token,
      corpo: request(code.id, 3135),
    });
    expect(response.stato, JSON.stringify(response.corpo)).toBe(201);
    expect(response.corpo).toMatchObject({ totaleMinor: 3135, restoMinor: 865 });
  });

  it('non converte silenziosamente un codice IVA altrui in aliquota zero', async () => {
    const foreign = await prisma.vatCode.create({
      data: {
        tenantId: IDS.tenantB,
        natureId,
        code: 'ALTRUI',
        description: 'TEST',
        ratePercent: 22,
      },
    });
    const before = await fotografaCassa(prisma);
    const response = await chiama(app, 'POST', '/cash-sessions/checkout', {
      token,
      corpo: request(foreign.id, 3000),
    });
    expect(response.stato, JSON.stringify(response.corpo)).toBe(422);
    expect(await fotografaCassa(prisma)).toBe(before);
  });

  it('non registra una vendita con netto più IVA diverso dal lordo pagato', async () => {
    const code = await prisma.vatCode.create({
      data: {
        tenantId: IDS.tenantA,
        natureId,
        code: 'RC TEST',
        description: 'TEST',
        ratePercent: 22,
        calculationMode: 'reverse_charge',
        vatAffectsSupplierTotal: false,
      },
    });
    const before = await fotografaCassa(prisma);
    const response = await chiama(app, 'POST', '/cash-sessions/checkout', {
      token,
      corpo: request(code.id, 3000),
    });
    expect(response.stato, JSON.stringify(response.corpo)).toBe(422);
    expect(await fotografaCassa(prisma)).toBe(before);
  });
});
