import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { DocumentType } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

import {
  buildFatturaPaXml,
  fatturaPaFileName,
  type FatturaPaLine,
  type FatturaPaParty,
  type FatturaPaVatSummary,
} from './fatturapa-xml.util';
import { isSalesInvoiceDocumentType } from './document-type.util';
import { sdiPaymentMethodCode } from './sdi-payment.util';
import type { DocumentDetail } from './documents.service';

/**
 * Snapshot IVA salvato sulla riga (shape parziale: leggiamo solo ciò che
 * serve). La Natura FatturaPA vive in `officialCode` — è la chiave scritta da
 * `buildVatCodeSnapshot` (vat-snapshot.util) — ma il catalogo contiene anche
 * pseudo-codici interni (TAXABLE, SPLIT_PAYMENT…): nell'XML passano solo i
 * codici N* dello standard.
 */
interface LineVatSnapshot {
  readonly ratePercent?: number;
  readonly officialCode?: string | null;
}

/** Codici Natura ammessi dallo standard: N1–N7, con sottocodice opzionale. */
const NATURA_PATTERN = /^N[1-7](\.\d)?$/;

function naturaFromSnapshot(snapshot: LineVatSnapshot | null): string | undefined {
  const code = snapshot?.officialCode?.trim();
  return code && NATURA_PATTERN.test(code) ? code : undefined;
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
      taxRegime: tenant.taxRegime,
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

    const baseLines: FatturaPaLine[] = document.lines.map((line) => {
      const snapshot = (line.vatSnapshot ?? null) as LineVatSnapshot | null;
      return {
        lineNumber: line.lineNumber,
        description: line.description,
        quantity: line.quantity,
        // La coda decimale del netto canonico (§sei decimali) resta intera:
        // PrezzoUnitario ammette fino a 8 decimali, e troncare al centesimo
        // farebbe fallire il ricalcolo SDI prezzo × quantità (00423).
        unitPriceMinor: Number(line.unitPriceMinor),
        discountPercent: Number(line.discountPercent),
        lineTotalMinor: line.lineTotalMinor,
        vatRatePercent: snapshot?.ratePercent ?? 0,
        natura: naturaFromSnapshot(snapshot),
      };
    });
    const lines = applyDocumentDiscount(baseLines, Number(document.documentDiscountPercent ?? 0));

    // I DDT agganciati senza riferimento (bozze non numerate) non entrano:
    // un NumeroDDT vuoto non è un riferimento utile.
    const linkedDdts = document.linkedSalesDdts
      .filter((ddt) => Boolean(ddt.reference))
      .map((ddt) => ({ reference: ddt.reference as string, date: ddt.documentDate }));

    // Nota di credito: riferimento alla fattura rettificata (documento
    // d'origine della conversione). La data non è nel ConvertedDocumentRef:
    // si legge dal documento stesso, sempre tenant-scoped.
    const isCreditNote = document.type === DocumentType.credit_note;
    const sourceRef = document.sourceDocument;
    const linkedInvoices =
      isCreditNote && sourceRef && isSalesInvoiceDocumentType(sourceRef.type) && sourceRef.reference
        ? await this.prisma.document
            .findFirst({
              where: { id: sourceRef.id, tenantId },
              select: { documentDate: true },
            })
            .then((source) =>
              source ? [{ reference: sourceRef.reference as string, date: source.documentDate }] : [],
            )
        : [];

    // ImportoTotaleDocumento ricostruibile dal file stesso: somma dei
    // riepiloghi (imponibile + imposta). Può differire di qualche centesimo
    // dal totale persistito (imposta per riga vs per gruppo di aliquota): la
    // fattura deve quadrare con sé stessa prima che con il gestionale.
    const vatSummaries = summarizeVat(lines);
    const totalMinor = vatSummaries.reduce(
      (sum, summary) => sum + summary.taxableMinor + summary.vatMinor,
      0,
    );

    return {
      xml: buildFatturaPaXml({
        documentTypeCode: isCreditNote ? 'TD04' : 'TD01',
        number: document.reference ?? String(document.number ?? ''),
        documentDate: document.documentDate,
        currency: document.currency,
        totalMinor,
        cedente,
        cessionario,
        sdiCode: party?.sdiCode,
        pec: party?.pec,
        lines,
        vatSummaries,
        paymentTerms: document.paymentTerms,
        paymentDueDate: document.paymentDueDate,
        iban: document.iban,
        paymentMethodCode: sdiPaymentMethodCode(document.paymentMethod),
        installments: document.paymentInstallments.map((installment) => ({
          dueDate: installment.dueDate,
          amountMinor: installment.amountMinor,
        })),
        linkedDdts,
        linkedInvoices,
        notes: document.notes,
      }),
      filename: fatturaPaFileName(
        tenant.vatNumber,
        document.reference ?? String(document.number ?? 'fattura'),
      ),
    };
  }
}

/**
 * Ripartisce lo sconto testata sulle righe, con la STESSA associazione di
 * `computeTotals` (documents.service): prima la quota di riga, poi la
 * moltiplicazione — le due forme IEEE-754 divergono sui confini .5, quindi
 * l'espressione deve essere identica. Il residuo di arrotondamento finisce
 * sulla riga più grande, così la somma dei PrezzoTotale coincide sempre con
 * l'imponibile scontato (controllo 00422 e quadratura interna del file).
 */
export function applyDocumentDiscount(
  lines: readonly FatturaPaLine[],
  documentDiscountPercent: number,
): readonly FatturaPaLine[] {
  const docDiscount = Math.min(100, Math.max(0, documentDiscountPercent));
  if (docDiscount === 0 || lines.length === 0) {
    return lines;
  }
  const lineSum = lines.reduce((sum, line) => sum + line.lineTotalMinor, 0);
  if (lineSum === 0) {
    return lines;
  }
  const discountedLineSum = lineSum - Math.round((lineSum * docDiscount) / 100);
  const discounted = lines.map((line) =>
    Math.round(discountedLineSum * (line.lineTotalMinor / lineSum)),
  );
  const residual = discountedLineSum - discounted.reduce((sum, value) => sum + value, 0);
  if (residual !== 0) {
    let largest = 0;
    for (let i = 1; i < discounted.length; i++) {
      if ((discounted[i] ?? 0) > (discounted[largest] ?? 0)) {
        largest = i;
      }
    }
    discounted[largest] = (discounted[largest] ?? 0) + residual;
  }
  return lines.map((line, index) => ({
    ...line,
    lineTotalMinor: discounted[index] ?? line.lineTotalMinor,
    extraDiscountPercent: docDiscount,
  }));
}

/**
 * Raggruppa le righe per aliquota e Natura: un DatiRiepilogo per coppia
 * distinta. Due righe a 0% con Natura diversa (es. esente N4 e fuori campo
 * N2.2) sono riepiloghi separati per lo standard, non un'aliquota sola.
 */
export function summarizeVat(lines: readonly FatturaPaLine[]): FatturaPaVatSummary[] {
  const byGroup = new Map<string, FatturaPaVatSummary>();
  for (const line of lines) {
    const key = `${line.vatRatePercent}|${line.natura ?? ''}`;
    const current = byGroup.get(key) ?? {
      ratePercent: line.vatRatePercent,
      taxableMinor: 0,
      vatMinor: 0,
      natura: line.natura,
    };
    const taxableMinor = current.taxableMinor + line.lineTotalMinor;
    byGroup.set(key, {
      ratePercent: line.vatRatePercent,
      taxableMinor,
      // L'imposta si calcola sul totale dell'aliquota, non sommando gli
      // arrotondamenti di riga: è così che la somma torna col totale documento.
      vatMinor: Math.round((taxableMinor * line.vatRatePercent) / 100),
      natura: current.natura,
    });
  }
  return [...byGroup.values()].sort(
    (a, b) => a.ratePercent - b.ratePercent || (a.natura ?? '').localeCompare(b.natura ?? ''),
  );
}
