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
    accepted: true,
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
    accepted: true,
  },
  {
    label: 'reverse charge acquisto 22% su un centesimo',
    natureKey: 'PURCHASE_REVERSE_CHARGE',
    calculationMode: 'reverse_charge',
    usageScope: 'purchase',
    ratePercent: 22,
    vatAffectsSupplierTotal: false,
    tax: 0,
    accepted: true,
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
    accepted: true,
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
});
