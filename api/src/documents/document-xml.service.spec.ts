import { UnprocessableEntityException } from '@nestjs/common';
import { DocumentType } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../prisma/prisma.service';
import { DocumentXmlService, applyDocumentDiscount, summarizeVat } from './document-xml.service';
import type { FatturaPaLine } from './fatturapa-xml.util';
import type { DocumentDetail } from './documents.service';

const tenantId = 'tenant-1';

function createPrismaMock() {
  return {
    tenant: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({
        id: tenantId,
        name: 'Negozio Demo',
        legalName: 'Negozio Demo SRL',
        vatNumber: '01234567890',
        fiscalCode: '01234567890',
        addressLine1: 'Via Roma 1',
        postalCode: '20100',
        city: 'Milano',
        province: 'MI',
        countryCode: 'IT',
        taxRegime: 'RF01',
      }),
    },
    customer: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
    document: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
  };
}

type PrismaMock = ReturnType<typeof createPrismaMock>;

function createService(prisma: PrismaMock) {
  return new DocumentXmlService(prisma as unknown as PrismaService);
}

/** Riga di dettaglio minima: solo i campi letti dal mapper XML. */
function detailLine(
  overrides: Partial<{
    lineNumber: number;
    description: string;
    quantity: number;
    unitPriceMinor: number;
    discountPercent: number;
    lineTotalMinor: number;
    vatSnapshot: unknown;
  }> = {},
) {
  return {
    lineNumber: 1,
    description: 'T-shirt Basic',
    quantity: 1,
    unitPriceMinor: 10000,
    discountPercent: 0,
    lineTotalMinor: 10000,
    vatSnapshot: { ratePercent: 22, officialCode: 'TAXABLE' },
    ...overrides,
  };
}

function detailDocument(overrides: Partial<Record<string, unknown>> = {}): DocumentDetail {
  return {
    type: DocumentType.invoice_draft,
    reference: 'FT-2026-0001',
    number: 1,
    documentDate: new Date('2026-07-21T00:00:00.000Z'),
    currency: 'EUR',
    totalMinor: 12200,
    documentDiscountPercent: 0,
    customerId: null,
    customerName: 'Cliente Demo',
    notes: null,
    paymentTerms: null,
    paymentDueDate: null,
    iban: null,
    paymentMethod: null,
    paymentInstallments: [],
    linkedSalesDdts: [],
    sourceDocument: null,
    lines: [detailLine()],
    ...overrides,
  } as unknown as DocumentDetail;
}

describe('DocumentXmlService.exportXml', () => {
  let prisma: PrismaMock;
  let service: DocumentXmlService;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = createService(prisma);
  });

  it('rifiuta i tipi documento che non sono fatture', async () => {
    await expect(
      service.exportXml(tenantId, detailDocument({ type: DocumentType.sales_ddt })),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('porta la Natura dallo snapshot IVA (chiave officialCode) fino all\'XML', async () => {
    // Regressione: il mapper leggeva `snapshot.natura`, ma lo snapshot scritto
    // da buildVatCodeSnapshot usa `officialCode` — la Natura non usciva mai e
    // ogni riga esente sarebbe stata scartata dallo SDI (00400).
    const { xml } = await service.exportXml(
      tenantId,
      detailDocument({
        lines: [
          detailLine({ vatSnapshot: { ratePercent: 0, officialCode: 'N4' } }),
        ],
      }),
    );

    expect(xml).toContain('<Natura>N4</Natura>');
  });

  it('non emette come Natura gli pseudo-codici interni del catalogo IVA', async () => {
    const { xml } = await service.exportXml(
      tenantId,
      detailDocument({
        lines: [
          detailLine({ vatSnapshot: { ratePercent: 0, officialCode: 'OTHER' } }),
        ],
      }),
    );

    expect(xml).not.toContain('<Natura>');
  });

  it('ripartisce lo sconto testata sulle righe e sui riepiloghi', async () => {
    // 100,00 € netti − 10% testata = 90,00 € imponibile: il PrezzoTotale esce
    // già scontato e il riepilogo quadra con le righe (controllo 00422).
    const { xml } = await service.exportXml(
      tenantId,
      detailDocument({
        documentDiscountPercent: 10,
        totalMinor: 10980,
        lines: [detailLine()],
      }),
    );

    expect(xml).toContain('<PrezzoTotale>90.00</PrezzoTotale>');
    expect(xml).toContain('<Percentuale>10.00</Percentuale>');
    expect(xml).toContain('<ImponibileImporto>90.00</ImponibileImporto>');
    expect(xml).toContain('<Imposta>19.80</Imposta>');
    // Il totale è ricostruibile dal file stesso: somma dei riepiloghi.
    expect(xml).toContain('<ImportoTotaleDocumento>109.80</ImportoTotaleDocumento>');
  });

  it('usa TD04 e DatiFattureCollegate per la nota di credito', async () => {
    prisma.document.findFirst.mockResolvedValue({
      documentDate: new Date('2026-07-21T00:00:00.000Z'),
    });

    const { xml } = await service.exportXml(
      tenantId,
      detailDocument({
        type: DocumentType.credit_note,
        reference: 'FT-2026-0009',
        sourceDocument: {
          id: 'doc-1',
          type: DocumentType.invoice_draft,
          reference: 'FT-2026-0001',
          series: null,
          number: 1,
          status: 'confirmed',
        },
      }),
    );

    expect(xml).toContain('<TipoDocumento>TD04</TipoDocumento>');
    expect(xml).toContain(
      '<DatiFattureCollegate><IdDocumento>FT-2026-0001</IdDocumento><Data>2026-07-21</Data></DatiFattureCollegate>',
    );
    expect(prisma.document.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'doc-1', tenantId } }),
    );
  });

  it('emette DatiPagamento a rate dalla modalità normativa e dalle scadenze', async () => {
    const { xml } = await service.exportXml(
      tenantId,
      detailDocument({
        paymentMethod: 'Bonifico (MP05)',
        iban: 'IT60X0542811101000000123456',
        paymentInstallments: [
          { id: 'r1', position: 1, dueDate: new Date('2026-08-31T00:00:00.000Z'), amountMinor: 6100 },
          { id: 'r2', position: 2, dueDate: new Date('2026-09-30T00:00:00.000Z'), amountMinor: 6100 },
        ],
      }),
    );

    expect(xml).toContain('<CondizioniPagamento>TP01</CondizioniPagamento>');
    expect(xml.match(/<ModalitaPagamento>MP05<\/ModalitaPagamento>/g)).toHaveLength(2);
    expect(xml.match(/<ImportoPagamento>61\.00<\/ImportoPagamento>/g)).toHaveLength(2);
  });

  it('scrive il regime fiscale del tenant nel blocco cedente', async () => {
    prisma.tenant.findUniqueOrThrow.mockResolvedValue({
      id: tenantId,
      name: 'Forfettario',
      legalName: 'Forfettario di Mario Rossi',
      vatNumber: '01234567890',
      taxRegime: 'RF19',
    });

    const { xml } = await service.exportXml(tenantId, detailDocument());

    expect(xml).toContain('<RegimeFiscale>RF19</RegimeFiscale>');
  });
});

describe('applyDocumentDiscount', () => {
  const line = (lineTotalMinor: number, lineNumber = 1): FatturaPaLine => ({
    lineNumber,
    description: 'riga',
    quantity: 1,
    unitPriceMinor: lineTotalMinor,
    discountPercent: 0,
    lineTotalMinor,
    vatRatePercent: 22,
  });

  it('senza sconto restituisce le righe intatte', () => {
    const lines = [line(10000)];
    expect(applyDocumentDiscount(lines, 0)).toBe(lines);
  });

  it('ripartisce in proporzione con lo stesso arrotondamento di computeTotals', () => {
    // 100,00 + 50,00 con 10%: montante scontato 135,00 → 90,00 + 45,00.
    const result = applyDocumentDiscount([line(10000, 1), line(5000, 2)], 10);

    expect(result.map((l) => l.lineTotalMinor)).toEqual([9000, 4500]);
    expect(result.every((l) => l.extraDiscountPercent === 10)).toBe(true);
  });

  it('clampa lo sconto fuori scala e ignora i totali a zero', () => {
    expect(applyDocumentDiscount([line(0)], 50)).toEqual([line(0)]);
    expect(applyDocumentDiscount([line(10000)], 120)[0]?.lineTotalMinor).toBe(0);
  });

  it('assorbe il residuo di arrotondamento: la somma coincide con il montante scontato', () => {
    // Caso limite sui confini .5: 1 + 97 centesimi con sconto 50% → montante 49.
    // Senza correzione del residuo le quote arrotondate possono sommare 48 o 50.
    const result = applyDocumentDiscount([line(1, 1), line(97, 2)], 50);

    expect(result.reduce((sum, l) => sum + l.lineTotalMinor, 0)).toBe(49);
  });
});

describe('summarizeVat', () => {
  const line = (
    lineTotalMinor: number,
    vatRatePercent: number,
    natura?: string,
  ): FatturaPaLine => ({
    lineNumber: 1,
    description: 'riga',
    quantity: 1,
    unitPriceMinor: lineTotalMinor,
    discountPercent: 0,
    lineTotalMinor,
    vatRatePercent,
    natura,
  });

  it('raggruppa per aliquota sommando gli imponibili', () => {
    const summaries = summarizeVat([line(10000, 22), line(5000, 22), line(3000, 10)]);

    expect(summaries).toHaveLength(2);
    expect(summaries[0]).toMatchObject({ ratePercent: 10, taxableMinor: 3000, vatMinor: 300 });
    expect(summaries[1]).toMatchObject({ ratePercent: 22, taxableMinor: 15000, vatMinor: 3300 });
  });

  it('separa i riepiloghi a pari aliquota con Natura diversa', () => {
    // Esente N4 e fuori campo N2.2 sono riepiloghi distinti per lo standard,
    // non un'unica "aliquota zero".
    const summaries = summarizeVat([line(10000, 0, 'N4'), line(5000, 0, 'N2.2')]);

    expect(summaries).toHaveLength(2);
    expect(summaries.map((s) => s.natura)).toEqual(['N2.2', 'N4']);
  });
});
