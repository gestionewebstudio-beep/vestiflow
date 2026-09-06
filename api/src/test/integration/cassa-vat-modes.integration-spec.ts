import { randomUUID } from 'node:crypto';

import type { PrismaClient, VatCalculationMode, VatUsageScope } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { VAT_CODE_SEED, VAT_NATURE_SEED } from '../../vat/vat-code-seed.data';

import { avviaApp, chiama, type AppIntegrazione } from './app';
import { creaDatasetCassa, fotografaCassa } from './cassa.fixture';
import { IDS, svuota } from './fixture';
import { creaClientIntegrazione } from './prisma';

interface Case {
  label: string;
  natureKey: string;
  calculationMode: VatCalculationMode;
  usageScope: VatUsageScope;
  ratePercent: number;
  vatAffectsSupplierTotal: boolean;
  tax: number;
  accepted: boolean;
  small?: boolean;
  isActive?: boolean;
}

// Caratterizzazione dell'accettazione attuale, NON promessa di supporto fiscale.
// Ciascun caso crea il codice attraverso l'API ordinaria del catalogo, poi vende
// via HTTP: nessuna combinazione viene resa possibile aggirando la validazione.
const cases: Case[] = VAT_CODE_SEED.map((entry) => ({
  ...entry,
  label: `seed ${entry.code}`,
  tax: 30 * entry.ratePercent,
  accepted: entry.calculationMode !== 'reverse_charge',
}));
for (const nature of VAT_NATURE_SEED) {
  if (VAT_CODE_SEED.some((code) => code.natureKey === nature.key)) continue;
  const split = nature.defaultCalculationMode === 'split_payment';
  cases.push({
    label: `natura ${nature.key}`,
    natureKey: nature.key,
    calculationMode: nature.defaultCalculationMode,
    usageScope: nature.defaultUsageScope,
    ratePercent: split ? 22 : 0,
    vatAffectsSupplierTotal: false,
    tax: split ? 660 : 0,
    accepted:
      nature.defaultCalculationMode === 'standard' || nature.defaultCalculationMode === 'zero_rate',
  });
}
cases.push(
  {
    label: 'aliquota frazionaria',
    natureKey: 'TAXABLE',
    calculationMode: 'standard',
    usageScope: 'both',
    ratePercent: 4.5,
    vatAffectsSupplierTotal: true,
    tax: 135,
    accepted: true,
  },
  {
    label: 'reverse charge acquisto a zero',
    natureKey: 'PURCHASE_REVERSE_CHARGE',
    calculationMode: 'reverse_charge',
    usageScope: 'purchase',
    ratePercent: 0,
    vatAffectsSupplierTotal: false,
    tax: 0,
    accepted: false,
  },
  {
    label: 'reverse charge acquisto 22% su un centesimo',
    natureKey: 'PURCHASE_REVERSE_CHARGE',
    calculationMode: 'reverse_charge',
    usageScope: 'purchase',
    ratePercent: 22,
    vatAffectsSupplierTotal: false,
    tax: 0,
    accepted: false,
    small: true,
  },
  {
    label: 'standard solo acquisto e disattivo',
    natureKey: 'TAXABLE',
    calculationMode: 'standard',
    usageScope: 'purchase',
    ratePercent: 22,
    vatAffectsSupplierTotal: true,
    tax: 660,
    accepted: false,
    isActive: false,
  },
  {
    label: 'standard con IVA esclusa dal dovuto fornitore',
    natureKey: 'TAXABLE',
    calculationMode: 'standard',
    usageScope: 'both',
    ratePercent: 22,
    vatAffectsSupplierTotal: false,
    tax: 660,
    accepted: true,
  },
  ...(['margin_scheme', 'informational', 'zero_rate'] as const).map((mode, index) => ({
    label: `${mode} con aliquota 22%`,
    natureKey: ['N5', 'OTHER', 'N4'][index]!,
    calculationMode: mode,
    usageScope: 'both' as const,
    ratePercent: 22,
    vatAffectsSupplierTotal: false,
    tax: 660,
    accepted: false,
  })),
  ...(['split_payment', 'margin_scheme', 'informational', 'zero_rate'] as const).map(
    (mode, index) => ({
      label: `${mode} 22% su un centesimo`,
      natureKey: ['SPLIT_PAYMENT', 'N5', 'OTHER', 'N4'][index]!,
      calculationMode: mode,
      usageScope: 'both' as const,
      ratePercent: 22,
      vatAffectsSupplierTotal: false,
      tax: 0,
      accepted: false,
      small: true,
    }),
  ),
  {
    label: 'standard vendite inattivo',
    natureKey: 'TAXABLE',
    calculationMode: 'standard',
    usageScope: 'sales',
    ratePercent: 22,
    vatAffectsSupplierTotal: true,
    tax: 660,
    accepted: true,
    isActive: false,
  },
  {
    label: 'standard zero',
    natureKey: 'TAXABLE',
    calculationMode: 'standard',
    usageScope: 'both',
    ratePercent: 0,
    vatAffectsSupplierTotal: true,
    tax: 0,
    accepted: true,
  },
);

describe('Cassa — censimento delle modalità IVA, accettazione aritmetica distinta dal supporto', () => {
  let prisma: PrismaClient;
  let app: AppIntegrazione;
  let token: string;
  let sessionId: string;
  let fixture: Awaited<ReturnType<typeof creaDatasetCassa>>;
  beforeAll(async () => {
    prisma = creaClientIntegrazione();
    fixture = await creaDatasetCassa(prisma);
    app = await avviaApp();
    token = await app.token(IDS.authA1);
    const response = await chiama(app, 'POST', '/cash-sessions/open', {
      token,
      corpo: { locationId: IDS.locA1, openingFloatMinor: 0 },
    });
    expect(response.stato).toBe(201);
    sessionId = (response.corpo as { id: string }).id;
  });
  afterAll(async () => {
    await app?.chiudi();
    if (prisma) {
      await svuota(prisma);
      await prisma.$disconnect();
    }
  });

  it.each(cases)('$label: accettato=$accepted', async (item) => {
    const nature = await prisma.vatNature.findUniqueOrThrow({ where: { key: item.natureKey } });
    const created = await chiama(app, 'POST', '/vat-codes', {
      token,
      corpo: {
        code: randomUUID().slice(0, 16),
        natureId: nature.id,
        description: 'Caratterizzazione TEST',
        ratePercent: item.ratePercent,
        calculationMode: item.calculationMode,
        usageScope: item.usageScope,
        vatAffectsSupplierTotal: item.vatAffectsSupplierTotal,
        isActive: item.isActive ?? true,
      },
    });
    expect(created.stato, JSON.stringify(created.corpo)).toBe(201);
    const vatCodeId = (created.corpo as { id: string }).id;
    const net = item.small ? 1 : 3000;
    const exposed = ['standard', 'split_payment'].includes(item.calculationMode);
    const gross = net + (exposed ? item.tax : 0);
    const body = {
      locationId: IDS.locA1,
      sessionId,
      creationIntentId: randomUUID(),
      lines: [
        {
          variantId: fixture.variantId,
          quantity: item.small ? 1 : 3,
          unitPriceMinor: item.small ? 1 : 1000.1234,
          vatCodeId,
        },
      ],
      payments: [{ paymentOptionId: fixture.cashId, amountMinor: gross, tenderedMinor: gross }],
    };
    const before = await fotografaCassa(prisma);
    const intents = await prisma.creationIntent.count();
    const response = await chiama(app, 'POST', '/cash-sessions/checkout', { token, corpo: body });
    expect(response.stato, JSON.stringify(response.corpo)).toBe(item.accepted ? 201 : 422);
    if (!item.accepted) {
      expect(JSON.stringify(response.corpo)).toMatch(/IVA.*(Cassa|acquisti)/);
      expect(await fotografaCassa(prisma)).toBe(before);
      expect(await prisma.creationIntent.count()).toBe(intents);
      return;
    }
    const doc = await prisma.document.findUniqueOrThrow({
      where: { id: (response.corpo as { documentId: string }).documentId },
      include: { lines: true, storeSalePayments: true },
    });
    expect([Number(doc.subtotalMinor), Number(doc.taxMinor), Number(doc.totalMinor)]).toEqual([
      net,
      item.tax,
      gross,
    ]);
    const line = doc.lines[0]!;
    expect(line.unitPriceMinor.toString()).toBe(item.small ? '1' : '1000.1234');
    expect(line.vatSnapshot).toMatchObject({
      calculationMode: item.calculationMode,
      natureKey: item.natureKey,
      ratePercent: item.ratePercent,
    });
    expect(Number(line.supplierPayableLineMinor)).toBe(
      net + (item.vatAffectsSupplierTotal ? item.tax : 0),
    );
    expect(doc.storeSalePayments.map((p) => p.amountMinor)).toEqual([gross]);
    const committed = await fotografaCassa(prisma);
    const replay = await chiama(app, 'POST', '/cash-sessions/checkout', { token, corpo: body });
    expect(replay.stato, JSON.stringify(replay.corpo)).toBe(201);
    expect(replay.corpo).toEqual(response.corpo);
    expect(await fotografaCassa(prisma)).toBe(committed);
    expect(await prisma.creationIntent.count()).toBe(intents + 1);
  });

  it.each([
    { mode: 'standard', rate: 22, small: false },
    { mode: 'zero_rate', rate: 0, small: false },
    { mode: 'split_payment', rate: 22, small: false },
    { mode: 'margin_scheme', rate: 0, small: false },
    { mode: 'informational', rate: 0, small: false },
    { mode: 'reverse_charge', rate: 0, small: false },
    { mode: 'reverse_charge', rate: 22, small: true },
  ] as const)(
    'storico $mode al $rate: replay, consultazione e reso mantengono fatti e snapshot originali',
    async ({ mode, rate, small }) => {
      const code = await prisma.vatCode.create({
        data: {
          tenantId: IDS.tenantA,
          code: randomUUID(),
          description: 'Fixture storico pre-perimetro',
          natureId: (await prisma.vatNature.findUniqueOrThrow({ where: { key: 'TAXABLE' } })).id,
          calculationMode: 'standard',
          ratePercent: rate,
          usageScope: 'both',
        },
      });
      const gross = small ? 1 : rate === 22 ? 3656 : 2997;
      const body = {
        locationId: IDS.locA1,
        sessionId,
        creationIntentId: randomUUID(),
        lines: [
          {
            variantId: fixture.variantId,
            quantity: small ? 1 : 3,
            unitPriceMinor: small ? 1 : 998.9071,
            vatCodeId: code.id,
          },
        ],
        payments: [
          { paymentOptionId: fixture.cashId, amountMinor: gross, tenderedMinor: gross + 10 },
        ],
      };
      const created = await chiama(app, 'POST', '/cash-sessions/checkout', { token, corpo: body });
      expect(created.stato, JSON.stringify(created.corpo)).toBe(201);
      const id = (created.corpo as { documentId: string }).documentId;
      const doc = await prisma.document.findUniqueOrThrow({
        where: { id },
        include: { lines: true, storeSalePayments: true },
      });
      // Fixture di un documento già concluso prima del perimetro temporaneo:
      // questi casi erano accettati con gli stessi importi (matrice 42ff9f86).
      // Cambia SOLO lo snapshot della fixture TEST, mai le protezioni dell'API.
      const snapshot = {
        ...(doc.lines[0]!.vatSnapshot as Record<string, unknown>),
        calculationMode: mode,
      };
      await prisma.documentLine.update({
        where: { id: doc.lines[0]!.id },
        data: { vatSnapshot: snapshot },
      });
      // Il catalogo corrente ora non è utilizzabile per nuovi checkout.
      await prisma.vatCode.update({
        where: { id: code.id },
        data: {
          calculationMode: 'reverse_charge',
          usageScope: 'purchase',
          ratePercent: 22,
          isActive: false,
        },
      });
      const before = await fotografaCassa(prisma);
      const intentsBefore = await prisma.creationIntent.findMany({ orderBy: { id: 'asc' } });
      const blocked = await chiama(app, 'POST', '/cash-sessions/checkout', {
        token,
        corpo: { ...body, creationIntentId: randomUUID() },
      });
      expect(blocked.stato).toBe(422);
      const replay = await chiama(app, 'POST', '/cash-sessions/checkout', { token, corpo: body });
      expect(replay.stato).toBe(201);
      expect(replay.corpo).toEqual(created.corpo);
      expect(
        (
          await chiama(app, 'GET', `/cash-sessions/checkout-intents/${body.creationIntentId}`, {
            token,
          })
        ).corpo,
      ).toMatchObject({ status: 'recorded', documentId: id });
      expect(await fotografaCassa(prisma)).toBe(before);
      expect(await prisma.creationIntent.findMany({ orderBy: { id: 'asc' } })).toEqual(
        intentsBefore,
      );
      const returned = {
        locationId: IDS.locA1,
        sessionId,
        creationIntentId: randomUUID(),
        originalDocumentId: id,
        reason: 'Reso storico TEST',
        lines: [{ originalLineId: doc.lines[0]!.id, quantity: small ? 1 : 3 }],
        refunds: [{ originalPaymentId: doc.storeSalePayments[0]!.id, amountMinor: gross }],
      };
      const preview = await chiama(app, 'POST', '/cash-sessions/returns/preview', {
        token,
        corpo: { locationId: IDS.locA1, originalDocumentId: id, lines: returned.lines },
      });
      expect(preview.stato).toBe(201);
      expect(preview.corpo).toMatchObject({ totalMinor: gross });
      const result = await chiama(app, 'POST', '/cash-sessions/returns', {
        token,
        corpo: returned,
      });
      expect(result.stato, JSON.stringify(result.corpo)).toBe(201);
      const refund = await prisma.document.findUniqueOrThrow({
        where: { id: (result.corpo as { documentId: string }).documentId },
        include: { lines: true, storeSalePayments: true },
      });
      expect(refund).toMatchObject({
        sourceDocumentId: id,
        totalMinor: gross,
        subtotalMinor: doc.subtotalMinor,
        taxMinor: doc.taxMinor,
      });
      expect(refund.lines[0]!.vatSnapshot).toEqual(snapshot);
      expect(refund.lines[0]!.variantLabel).toBe(doc.lines[0]!.variantLabel);
      expect(refund.lines[0]!.unitPriceMinor.toString()).toBe(
        doc.lines[0]!.unitPriceMinor.toString(),
      );
      expect(refund.lines[0]!.returnedFromLineId).toBe(doc.lines[0]!.id);
      expect(refund.storeSalePayments[0]!.refundedFromPaymentId).toBe(doc.storeSalePayments[0]!.id);
      const afterReturn = await fotografaCassa(prisma);
      expect(
        (await chiama(app, 'POST', '/cash-sessions/returns', { token, corpo: returned })).corpo,
      ).toEqual(result.corpo);
      expect(await fotografaCassa(prisma)).toBe(afterReturn);
    },
  );

  it('IVA dell’articolo: rifiuta il codice solo acquisti senza sostituirlo con un fallback', async () => {
    const variant = await prisma.productVariant.findUniqueOrThrow({
      where: { id: fixture.variantId },
    });
    const code = await prisma.vatCode.create({
      data: {
        tenantId: IDS.tenantA,
        code: randomUUID(),
        description: 'Solo acquisti',
        natureId: (await prisma.vatNature.findUniqueOrThrow({ where: { key: 'TAXABLE' } })).id,
        calculationMode: 'standard',
        ratePercent: 22,
        usageScope: 'purchase',
      },
    });
    await prisma.product.update({
      where: { id: variant.productId },
      data: { defaultVatCodeId: code.id },
    });
    try {
      const before = await fotografaCassa(prisma);
      const response = await chiama(app, 'POST', '/cash-sessions/checkout', {
        token,
        corpo: {
          locationId: IDS.locA1,
          sessionId,
          creationIntentId: randomUUID(),
          lines: [{ variantId: fixture.variantId, quantity: 1, unitPriceMinor: 100 }],
          payments: [{ paymentOptionId: fixture.cashId, amountMinor: 122 }],
        },
      });
      expect(response.stato).toBe(422);
      expect(JSON.stringify(response.corpo)).toContain('solo agli acquisti');
      expect(await fotografaCassa(prisma)).toBe(before);
      // La normale Vendita al banco mantiene il comportamento precedente.
      const bank = await chiama(app, 'POST', '/store-sales', {
        token,
        corpo: {
          locationId: IDS.locA1,
          creationIntentId: randomUUID(),
          lines: [{ variantId: fixture.variantId, quantity: 1, unitPriceMinor: 100 }],
        },
      });
      expect(bank.stato, JSON.stringify(bank.corpo)).toBe(201);
    } finally {
      await prisma.product.update({
        where: { id: variant.productId },
        data: { defaultVatCodeId: null },
      });
    }
  });
});
