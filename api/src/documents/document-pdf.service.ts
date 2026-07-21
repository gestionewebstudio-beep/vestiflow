import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { DocumentType } from '@prisma/client';
import type { PdfDocumentInstance } from '../common/pdf/pdf-document.types';

import { formatMinorAmount } from '../common/pdf/money-format.util';
import { renderPdfToBuffer, sanitizePdfFilename } from '../common/pdf/pdf-buffer.util';
import {
  drawPdfMetaLine,
  drawPdfSectionTitle,
  drawPdfTable,
  drawPdfTotals,
  formatRomeDate,
  type PdfTableColumn,
} from '../common/pdf/pdf-layout.util';
import { PrismaService } from '../prisma/prisma.service';
import { vatSnapshotRatePercent } from '../vat/vat-snapshot.util';
import { PROFORMA_FISCAL_DISCLAIMER, isSalesInvoiceDocumentType } from './document-type.util';
import { DEFAULT_PRINT_TITLE } from './document-defaults';
import {
  documentPrintKind,
  documentReferenceLabel,
  isPrintableDocumentType,
} from './document-print.util';
import type { DocumentDetail } from './documents.service';

interface TenantPdfHeader {
  readonly legalName: string;
  readonly addressLine: string | null;
  readonly vatNumber: string | null;
}

/** Ora inizio trasporto in fuso Europa/Roma (stampa DDT). */
const ROME_TIME_FORMAT = new Intl.DateTimeFormat('it-IT', {
  timeZone: 'Europe/Rome',
  hour: '2-digit',
  minute: '2-digit',
});

@Injectable()
export class DocumentPdfService {
  constructor(private readonly prisma: PrismaService) {}

  async exportPdf(
    tenantId: string,
    document: DocumentDetail,
  ): Promise<{ buffer: Buffer; filename: string }> {
    if (!isPrintableDocumentType(document.type)) {
      throw new UnprocessableEntityException(
        'Export PDF non disponibile per questo tipo di documento.',
      );
    }

    const [tenant, locations] = await Promise.all([
      this.loadTenantHeader(tenantId),
      this.loadLocationNames(tenantId, document),
    ]);

    const reference = documentReferenceLabel(document.reference, document.series);
    const title = document.printTitle ?? DEFAULT_PRINT_TITLE[document.type];
    const currency = document.currency ?? 'EUR';

    const buffer = await renderPdfToBuffer((doc) => {
      this.renderDocument(doc, {
        tenant,
        document,
        locations,
        title,
        reference,
        currency,
      });
    });

    const stamp = formatRomeDate(document.documentDate).replace(/\//g, '-');
    const filename = sanitizePdfFilename(`documento-${reference}-${stamp}`);

    return { buffer, filename: `${filename}.pdf` };
  }

  private async loadTenantHeader(tenantId: string): Promise<TenantPdfHeader> {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: {
        name: true,
        legalName: true,
        vatNumber: true,
        addressLine1: true,
        addressLine2: true,
        postalCode: true,
        city: true,
        province: true,
      },
    });

    const addressParts = [
      tenant.addressLine1,
      tenant.addressLine2,
      [tenant.postalCode, tenant.city, tenant.province].filter(Boolean).join(' '),
    ].filter((part) => part && part.trim().length > 0);

    return {
      legalName: tenant.legalName?.trim() || tenant.name,
      addressLine: addressParts.length > 0 ? addressParts.join(', ') : null,
      vatNumber: tenant.vatNumber,
    };
  }

  private async loadLocationNames(
    tenantId: string,
    document: DocumentDetail,
  ): Promise<Map<string, string>> {
    const ids = [document.locationId, document.targetLocationId].filter(
      (id): id is string => id != null,
    );
    if (ids.length === 0) {
      return new Map();
    }

    const rows = await this.prisma.location.findMany({
      where: { tenantId, id: { in: ids } },
      select: { id: true, name: true },
    });

    return new Map(rows.map((row) => [row.id, row.name]));
  }

  private renderDocument(
    doc: PdfDocumentInstance,
    params: {
      readonly tenant: TenantPdfHeader;
      readonly document: DocumentDetail;
      readonly locations: Map<string, string>;
      readonly title: string;
      readonly reference: string;
      readonly currency: string;
    },
  ): void {
    const { tenant, document, locations, title, reference, currency } = params;
    const left = doc.page.margins.left;
    const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    let y = doc.page.margins.top;

    doc.font('Helvetica-Bold').fontSize(11).text(tenant.legalName, left, y);
    y += 14;
    if (tenant.addressLine) {
      doc.font('Helvetica').fontSize(9).fillColor('#444444').text(tenant.addressLine, left, y);
      y += 12;
    }
    if (tenant.vatNumber) {
      doc.text(`P. IVA: ${tenant.vatNumber}`, left, y);
      y += 12;
    }
    doc.fillColor('#000000');
    y += 8;

    if (document.type === DocumentType.proforma) {
      doc
        .font('Helvetica-Bold')
        .fontSize(9)
        .fillColor('#663c00')
        .text(PROFORMA_FISCAL_DISCLAIMER, left, y, { width: contentWidth });
      doc.fillColor('#000000');
      y += 24;
    }

    doc.font('Helvetica-Bold').fontSize(16).text(title, left, y);
    y += 22;
    doc.font('Helvetica').fontSize(11).text(reference, left, y);
    y += 16;
    y = drawPdfMetaLine(doc, 'Data', formatRomeDate(document.documentDate), y);

    if (isSalesInvoiceDocumentType(document.type)) {
      y = this.renderInvoiceHeader(doc, document, y, left, contentWidth);
    }

    y = this.renderContextMeta(doc, document, locations, y);
    y += 8;

    if (document.lines.length > 0) {
      y = drawPdfSectionTitle(doc, 'Righe documento', y);
      y = this.renderLinesTable(doc, document, currency, y, contentWidth);
      const totalRows: Array<{ label: string; value: string; bold?: boolean }> = [
        { label: 'Imponibile', value: formatMinorAmount(document.subtotalMinor, currency) },
      ];
      // Dettaglio per aliquota: aggiunge informazione solo se le righe usano
      // aliquote diverse fra loro.
      const vatRows = invoiceVatBreakdown(document);
      if (isSalesInvoiceDocumentType(document.type) && vatRows.length > 1) {
        for (const row of vatRows) {
          totalRows.push({
            label: `IVA ${row.ratePercent}% su ${formatMinorAmount(row.taxableMinor, currency)}`,
            value: formatMinorAmount(row.vatMinor, currency),
          });
        }
      }
      totalRows.push(
        { label: 'IVA', value: formatMinorAmount(document.taxMinor, currency) },
        {
          label: isSalesInvoiceDocumentType(document.type) ? 'Totale documento' : 'Totale',
          value: formatMinorAmount(document.totalMinor, currency),
          bold: true,
        },
      );
      y = drawPdfTotals(doc, totalRows, y);
    }

    // Trasporto e destinazione: DDT vendita e Fattura accompagnatoria
    // condividono gli stessi blocchi (è la stessa merce che viaggia).
    if (
      document.type === DocumentType.sales_ddt ||
      document.type === DocumentType.invoice_accompanying
    ) {
      y = this.renderSalesDdtSections(doc, document, y, left, contentWidth);
    }

    if (isSalesInvoiceDocumentType(document.type)) {
      y = this.renderPaymentSection(doc, document, y, left, contentWidth);
    }

    if (document.notes?.trim()) {
      y += 12;
      y = drawPdfSectionTitle(doc, 'Note', y);
      doc.font('Helvetica').fontSize(10).text(document.notes.trim(), left, y, {
        width: contentWidth,
      });
    }
  }

  /**
   * Testata fattura: dati del cessionario e riferimento ai DDT agganciati.
   * Come per il DDT, si stampa solo ciò che è compilato.
   */
  private renderInvoiceHeader(
    doc: PdfDocumentInstance,
    document: DocumentDetail,
    y: number,
    left: number,
    contentWidth: number,
  ): number {
    let next = y;
    const recipient = formatPdfAddress(document.recipientAddress);
    const customerName = document.customerName?.trim();

    if (customerName || recipient) {
      next += 12;
      next = drawPdfSectionTitle(doc, 'Cliente', next);
      if (customerName) {
        doc.font('Helvetica-Bold').fontSize(10).text(customerName, left, next);
        next += 14;
      }
      if (recipient) {
        doc.font('Helvetica').fontSize(9).fillColor('#444444').text(recipient, left, next, {
          width: contentWidth,
        });
        doc.fillColor('#000000');
        next += 24;
      }
    }

    const ddtRefs = document.linkedSalesDdts
      .map((ddt) => ddt.reference)
      .filter((reference): reference is string => Boolean(reference));
    if (ddtRefs.length > 0) {
      next = drawPdfMetaLine(doc, 'Riferimento DDT', ddtRefs.join(', '), next);
    }
    if (document.billingCause?.trim()) {
      next = drawPdfMetaLine(doc, 'Causale', document.billingCause.trim(), next);
    }
    return next;
  }

  /** Dati pagamento in fattura: condizioni, scadenza e IBAN, se presenti. */
  private renderPaymentSection(
    doc: PdfDocumentInstance,
    document: DocumentDetail,
    y: number,
    left: number,
    contentWidth: number,
  ): number {
    const rows: Array<readonly [string, string]> = [];
    if (document.paymentTerms?.trim()) {
      rows.push(['Condizioni di pagamento', document.paymentTerms.trim()]);
    }
    if (document.paymentDueDate) {
      rows.push(['Scadenza', formatRomeDate(document.paymentDueDate)]);
    }
    if (document.iban?.trim()) {
      rows.push(['IBAN', document.iban.trim()]);
    }
    if (rows.length === 0) {
      return y;
    }

    let next = y + 12;
    next = drawPdfSectionTitle(doc, 'Dati pagamento', next);
    for (const [label, value] of rows) {
      next = drawPdfMetaLine(doc, label, value, next);
    }
    return next;
  }

  /**
   * DDT vendita (prompt DDT §TRASPORTO/§INDIRIZZI): dati di trasporto sotto i
   * totali e blocchi Intestatario/Destinazione. Si stampano solo i campi
   * compilati — un DDT senza dati trasporto non mostra la sezione vuota.
   */
  private renderSalesDdtSections(
    doc: PdfDocumentInstance,
    document: DocumentDetail,
    y: number,
    left: number,
    contentWidth: number,
  ): number {
    const transportRows: Array<readonly [string, string]> = [];
    if (document.transportCausal?.trim()) {
      transportRows.push(['Causale trasporto', document.transportCausal.trim()]);
    }
    if (document.transportStartAt) {
      const time = ROME_TIME_FORMAT.format(document.transportStartAt);
      transportRows.push([
        'Inizio trasporto',
        `${formatRomeDate(document.transportStartAt)}${time !== '00:00' ? ` ${time}` : ''}`,
      ]);
    }
    if (document.transportPort) {
      transportRows.push(['Porto', document.transportPort === 'franco' ? 'Franco' : 'Assegnato']);
    }
    if (document.transportCarrier?.trim()) {
      transportRows.push(['Incaricato trasporto', document.transportCarrier.trim()]);
    }
    if (document.transportPackagesCount != null) {
      transportRows.push(['Numero colli', String(document.transportPackagesCount)]);
    }
    if (document.transportWeight?.trim()) {
      transportRows.push(['Peso', document.transportWeight.trim()]);
    }
    if (document.transportGoodsAspect?.trim()) {
      transportRows.push(['Aspetto beni', document.transportGoodsAspect.trim()]);
    }
    if (document.transportShippingCode?.trim()) {
      transportRows.push(['Codice spedizione', document.transportShippingCode.trim()]);
    }
    if (document.transportTrackingCode?.trim()) {
      transportRows.push(['Tracking', document.transportTrackingCode.trim()]);
    }
    if (document.paymentMethod?.trim()) {
      transportRows.push(['Pagamento', document.paymentMethod.trim()]);
    }
    if (document.followedBySalesDoc) {
      transportRows.push(['Seguirà doc. di vendita', 'Sì']);
    }

    if (transportRows.length > 0) {
      y += 12;
      y = drawPdfSectionTitle(doc, 'Trasporto', y);
      for (const [label, value] of transportRows) {
        y = drawPdfMetaLine(doc, label, value, y);
      }
    }

    const recipient = formatPdfAddress(document.recipientAddress);
    const destination = formatPdfAddress(document.destinationAddress);
    if (recipient || destination) {
      y += 12;
      y = drawPdfSectionTitle(doc, 'Indirizzi', y);
      if (recipient) {
        doc.font('Helvetica-Bold').fontSize(9).text('Intestatario', left, y);
        y += 12;
        doc.font('Helvetica').fontSize(9).text(recipient, left, y, { width: contentWidth });
        y = doc.y + 6;
      }
      if (destination && destination !== recipient) {
        doc.font('Helvetica-Bold').fontSize(9).text('Destinazione', left, y);
        y += 12;
        doc.font('Helvetica').fontSize(9).text(destination, left, y, { width: contentWidth });
        y = doc.y + 6;
      }
      doc.fillColor('#000000');
    }

    return y;
  }

  private renderContextMeta(
    doc: PdfDocumentInstance,
    document: DocumentDetail,
    locations: Map<string, string>,
    y: number,
  ): number {
    const kind = documentPrintKind(document.type);

    switch (kind) {
      case 'transfer': {
        if (document.locationId) {
          y = drawPdfMetaLine(doc, 'Origine', locations.get(document.locationId) ?? '—', y);
        }
        if (document.targetLocationId) {
          y = drawPdfMetaLine(
            doc,
            'Destinazione',
            locations.get(document.targetLocationId) ?? '—',
            y,
          );
        }
        break;
      }
      case 'goods_receipt': {
        if (document.supplierName) {
          y = drawPdfMetaLine(doc, 'Fornitore', document.supplierName, y);
        }
        if (document.locationId) {
          y = drawPdfMetaLine(doc, 'Location', locations.get(document.locationId) ?? '—', y);
        }
        break;
      }
      case 'sales': {
        if (document.customerName) {
          y = drawPdfMetaLine(doc, 'Cliente', document.customerName, y);
        }
        if (document.billingCause) {
          y = drawPdfMetaLine(doc, 'Causale', document.billingCause, y);
        }
        // Scarico manuale: la location di scarico è il contesto operativo.
        if (document.type === DocumentType.manual_unload && document.locationId) {
          y = drawPdfMetaLine(doc, 'Location', locations.get(document.locationId) ?? '—', y);
        }
        break;
      }
      default: {
        if (document.customerName) {
          y = drawPdfMetaLine(doc, 'Cliente', document.customerName, y);
        }
        if (document.supplierName) {
          y = drawPdfMetaLine(doc, 'Fornitore', document.supplierName, y);
        }
        break;
      }
    }

    return y;
  }

  private renderLinesTable(
    doc: PdfDocumentInstance,
    document: DocumentDetail,
    currency: string,
    y: number,
    contentWidth: number,
  ): number {
    const columns: PdfTableColumn[] = [
      { header: '#', width: contentWidth * 0.05, align: 'right' },
      { header: 'Articolo', width: contentWidth * 0.34 },
      { header: 'Q.tà', width: contentWidth * 0.08, align: 'right' },
      { header: 'Prezzo', width: contentWidth * 0.13, align: 'right' },
      { header: 'Sconto', width: contentWidth * 0.08, align: 'right' },
      { header: 'IVA', width: contentWidth * 0.08, align: 'right' },
      { header: 'Totale', width: contentWidth * 0.24, align: 'right' },
    ];

    const rows = document.lines.map((line) => {
      const articleParts = [line.description];
      if (line.sku) {
        articleParts.push(`SKU: ${line.sku}`);
      }
      const serials = parseSerialNumbers(line.serialNumbers);
      if (serials.length > 0) {
        articleParts.push(`Seriali: ${serials.join(', ')}`);
      }
      const vatRatePercent = vatSnapshotRatePercent(line.vatSnapshot);

      return [
        String(line.lineNumber),
        articleParts.join('\n'),
        String(line.quantity),
        formatMinorAmount(line.unitPriceMinor, currency),
        line.discountPercent > 0 ? `${line.discountPercent}%` : '—',
        vatRatePercent != null ? `${vatRatePercent}%` : '—',
        formatMinorAmount(line.lineTotalMinor, currency),
      ];
    });

    return drawPdfTable({
      doc,
      x: doc.page.margins.left,
      y,
      pageWidth: contentWidth,
      columns,
      rows,
    });
  }
}

/** Snapshot indirizzo (JSON) → riga stampabile: campi compilati in ordine. */
/**
 * Quote IVA per aliquota, dallo snapshot salvato sulle righe. Legge lo
 * snapshot e non i Codici IVA correnti: la stampa di una fattura vecchia deve
 * restare quella di allora anche se l'aliquota è cambiata nel frattempo.
 */
function invoiceVatBreakdown(
  document: DocumentDetail,
): Array<{ ratePercent: number; taxableMinor: number; vatMinor: number }> {
  const byRate = new Map<number, { taxableMinor: number; vatMinor: number }>();
  for (const line of document.lines) {
    const snapshot = (line.vatSnapshot ?? null) as { ratePercent?: number } | null;
    const ratePercent = snapshot?.ratePercent ?? 0;
    const entry = byRate.get(ratePercent) ?? { taxableMinor: 0, vatMinor: 0 };
    entry.taxableMinor += line.lineTotalMinor;
    byRate.set(ratePercent, entry);
  }
  return [...byRate.entries()]
    .map(([ratePercent, entry]) => ({
      ratePercent,
      taxableMinor: entry.taxableMinor,
      vatMinor: Math.round((entry.taxableMinor * ratePercent) / 100),
    }))
    .sort((a, b) => a.ratePercent - b.ratePercent);
}

function formatPdfAddress(value: unknown): string | null {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const address = value as Record<string, unknown>;
  const read = (key: string): string =>
    typeof address[key] === 'string' ? (address[key] as string).trim() : '';
  const cityLine = [read('zip'), read('city'), read('province')].filter(Boolean).join(' ');
  const fiscalLine = [
    read('fiscalCode') ? `CF: ${read('fiscalCode')}` : '',
    read('vatNumber') ? `P.IVA: ${read('vatNumber')}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
  const parts = [read('name'), read('address'), cityLine, read('country'), fiscalLine].filter(
    Boolean,
  );
  return parts.length > 0 ? parts.join('\n') : null;
}

function parseSerialNumbers(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
}
