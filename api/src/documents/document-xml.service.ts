import { Injectable, UnprocessableEntityException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import {
  buildFatturaPaXml,
  fatturaPaFileName,
  type FatturaPaLine,
  type FatturaPaParty,
  type FatturaPaVatSummary,
} from './fatturapa-xml.util';
import { isSalesInvoiceDocumentType } from './document-type.util';
import type { DocumentDetail } from './documents.service';

/** Snapshot IVA salvato sulla riga (shape parziale: leggiamo solo ciò che serve). */
interface LineVatSnapshot {
  readonly ratePercent?: number;
  readonly natura?: string | null;
}

@Injectable()
export class DocumentXmlService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Esporta la fattura in XML FatturaPA.
   *
   * I dati mancanti restano vuoti: la mappatura non completa mai un campo per
   * far "passare" il file. Vedi fatturapa-xml.util per il razionale.
   */
  async exportXml(
    tenantId: string,
    document: DocumentDetail,
  ): Promise<{ xml: string; filename: string }> {
    if (!isSalesInvoiceDocumentType(document.type)) {
      throw new UnprocessableEntityException(
        "L'export XML FatturaPA è disponibile solo per le fatture.",
      );
    }

    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });

    const cedente: FatturaPaParty = {
      legalName: tenant.legalName ?? tenant.name,
      vatNumber: tenant.vatNumber,
      fiscalCode: tenant.fiscalCode,
      address: tenant.addressLine1,
      zip: tenant.postalCode,
      city: tenant.city,
      province: tenant.province,
      countryCode: tenant.countryCode,
    };

    const customer = document.customerId
      ? await this.prisma.customer.findFirst({
          where: { id: document.customerId, tenantId },
          include: { party: true },
        })
      : null;
    const party = customer?.party;

    const cessionario: FatturaPaParty = {
      legalName: party?.companyName ?? document.customerName,
      firstName: party?.firstName,
      lastName: party?.lastName,
      vatNumber: party?.vatNumber,
      fiscalCode: party?.taxCode,
      address: party?.addressLine1,
      zip: party?.postalCode,
      city: party?.city,
      province: party?.province,
      countryCode: party?.countryCode,
    };

    const lines: FatturaPaLine[] = document.lines.map((line) => {
      const snapshot = (line.vatSnapshot ?? null) as LineVatSnapshot | null;
      return {
        lineNumber: line.lineNumber,
        description: line.description,
        quantity: line.quantity,
        unitPriceMinor: line.unitPriceMinor,
        discountPercent: line.discountPercent,
        lineTotalMinor: line.lineTotalMinor,
        vatRatePercent: snapshot?.ratePercent ?? 0,
        natura: snapshot?.natura ?? undefined,
      };
    });

    // I DDT agganciati senza riferimento (bozze non numerate) non entrano:
    // un NumeroDDT vuoto non è un riferimento utile.
    const linkedDdts = document.linkedSalesDdts
      .filter((ddt) => Boolean(ddt.reference))
      .map((ddt) => ({ reference: ddt.reference as string, date: ddt.documentDate }));

    return {
      xml: buildFatturaPaXml({
        // VestiFlow non gestisce ancora le note di credito di vendita:
        // ogni fattura esportata è TD01.
        documentTypeCode: 'TD01',
        number: document.reference ?? String(document.number ?? ''),
        documentDate: document.documentDate,
        currency: document.currency,
        totalMinor: document.totalMinor,
        cedente,
        cessionario,
        sdiCode: party?.sdiCode,
        pec: party?.pec,
        lines,
        vatSummaries: summarizeVat(lines),
        paymentTerms: document.paymentTerms,
        paymentDueDate: document.paymentDueDate,
        iban: document.iban,
        linkedDdts,
        notes: document.notes,
      }),
      filename: fatturaPaFileName(
        tenant.vatNumber,
        document.reference ?? String(document.number ?? 'fattura'),
      ),
    };
  }
}

/** Raggruppa le righe per aliquota: un DatiRiepilogo per aliquota distinta. */
export function summarizeVat(lines: readonly FatturaPaLine[]): FatturaPaVatSummary[] {
  const byRate = new Map<number, FatturaPaVatSummary>();
  for (const line of lines) {
    const current = byRate.get(line.vatRatePercent) ?? {
      ratePercent: line.vatRatePercent,
      taxableMinor: 0,
      vatMinor: 0,
      natura: line.natura,
    };
    const taxableMinor = current.taxableMinor + line.lineTotalMinor;
    byRate.set(line.vatRatePercent, {
      ratePercent: line.vatRatePercent,
      taxableMinor,
      // L'imposta si calcola sul totale dell'aliquota, non sommando gli
      // arrotondamenti di riga: è così che la somma torna col totale documento.
      vatMinor: Math.round((taxableMinor * line.vatRatePercent) / 100),
      natura: current.natura ?? line.natura,
    });
  }
  return [...byRate.values()].sort((a, b) => a.ratePercent - b.ratePercent);
}
