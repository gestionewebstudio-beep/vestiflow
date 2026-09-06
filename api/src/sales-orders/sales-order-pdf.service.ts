import { Injectable } from '@nestjs/common';

import {
  ISSUER_TENANT_SELECT,
  resolveDocumentIssuer,
  type DocumentIssuer,
} from '../common/company/document-issuer.util';
import { drawIssuerFooter, drawIssuerHeader } from '../common/pdf/issuer-header.util';
import { formatMinorAmount } from '../common/pdf/money-format.util';
import { renderPdfToBuffer, sanitizePdfFilename } from '../common/pdf/pdf-buffer.util';
import type { PdfDocumentInstance } from '../common/pdf/pdf-document.types';
import {
  drawPdfMetaLine,
  drawPdfSectionTitle,
  drawPdfTable,
  drawPdfTotals,
  formatRomeDate,
  type PdfTableColumn,
} from '../common/pdf/pdf-layout.util';
import { PrismaService } from '../prisma/prisma.service';
import type { SalesOrderDetailRow } from './sales-orders.service';

/**
 * Export PDF dell'Ordine cliente: stesso stack (pdfkit) e layout dei documenti
 * e dell'ordine fornitore (`common/pdf`). Vale per ogni origine (manuale o
 * Shopify): si stampano solo i dati reali del modello — testata azienda,
 * cliente, righe con prezzo/sconto/IVA e totali.
 */
@Injectable()
export class SalesOrderPdfService {
  constructor(private readonly prisma: PrismaService) {}

  async exportPdf(
    tenantId: string,
    order: SalesOrderDetailRow,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const issuer = await this.loadIssuer(tenantId);

    const buffer = await renderPdfToBuffer((doc) => {
      this.renderOrder(doc, { issuer, order });
    });

    const filename = sanitizePdfFilename(`ordine-cliente-${order.orderNumber}`);
    return { buffer, filename: `${filename}.pdf` };
  }

  /** L'azienda gestita, non il cliente VestiFlow (vedi `document-issuer.util`). */
  private async loadIssuer(tenantId: string): Promise<DocumentIssuer> {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: ISSUER_TENANT_SELECT,
    });
    return resolveDocumentIssuer(tenant);
  }

  private renderOrder(
    doc: PdfDocumentInstance,
    params: { readonly issuer: DocumentIssuer; readonly order: SalesOrderDetailRow },
  ): void {
    const { issuer, order } = params;
    const left = doc.page.margins.left;
    const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const currency = order.currency || 'EUR';
    let y = drawIssuerHeader(doc, issuer, doc.page.margins.top);

    doc
      .font('Helvetica-Bold')
      .fontSize(16)
      .text(`Ordine cliente ${order.orderNumber}`, left, y, { width: contentWidth });
    y += 26;

    y = drawPdfMetaLine(doc, 'Data', formatRomeDate(order.placedAt), y);
    y = drawPdfMetaLine(doc, 'Cliente', order.customerName, y);
    if (order.locationName) {
      y = drawPdfMetaLine(doc, 'Magazzino di origine', order.locationName, y);
    }
    if (order.externalRef) {
      y = drawPdfMetaLine(doc, 'Rif. ordine cliente', order.externalRef, y);
    }
    if (order.expectedDeliveryDate) {
      y = drawPdfMetaLine(doc, 'Consegna prevista', formatRomeDate(order.expectedDeliveryDate), y);
    }
    y = drawPdfMetaLine(doc, 'Valuta', currency, y);
    y += 8;

    if (order.lines.length > 0) {
      y = drawPdfSectionTitle(doc, 'Righe ordine', y);
      y = this.renderLinesTable(doc, order, currency, y, contentWidth);
    }

    y = drawPdfTotals(
      doc,
      [
        { label: 'Imponibile', value: formatMinorAmount(order.subtotalMinor, currency) },
        { label: 'IVA', value: formatMinorAmount(order.taxMinor, currency) },
        {
          label: 'Totale documento',
          value: formatMinorAmount(order.totalMinor, currency),
          bold: true,
        },
      ],
      y,
    );

    drawIssuerFooter(doc, issuer, y + 18);
  }

  private renderLinesTable(
    doc: PdfDocumentInstance,
    order: SalesOrderDetailRow,
    currency: string,
    y: number,
    contentWidth: number,
  ): number {
    const columns: PdfTableColumn[] = [
      { header: '#', width: contentWidth * 0.05, align: 'right' },
      { header: 'SKU', width: contentWidth * 0.16 },
      { header: 'Descrizione', width: contentWidth * 0.29 },
      { header: 'Q.tà', width: contentWidth * 0.08, align: 'right' },
      { header: 'Prezzo', width: contentWidth * 0.13, align: 'right' },
      { header: 'Sconto', width: contentWidth * 0.08, align: 'right' },
      { header: 'IVA', width: contentWidth * 0.07, align: 'right' },
      { header: 'Totale', width: contentWidth * 0.14, align: 'right' },
    ];

    const rows = order.lines.map((line, index) => [
      String(index + 1),
      line.sku,
      line.title || line.sku,
      String(line.quantity),
      // La stampa mostra il NETTO, come quella dei documenti
      // (`document-pdf.service.ts`): due decimali, l'arrotondamento è l'uscita.
      formatMinorAmount(Number(line.unitPriceMinor), currency),
      line.discount?.trim() ? line.discount : '—',
      this.vatLabel(line.vatSnapshot),
      formatMinorAmount(line.totalMinor, currency),
    ]);

    return drawPdfTable({
      doc,
      x: doc.page.margins.left,
      y,
      pageWidth: contentWidth,
      columns,
      rows,
    });
  }

  /** Etichetta IVA dal vatSnapshot riga (codice, altrimenti aliquota). */
  private vatLabel(vatSnapshot: unknown): string {
    if (vatSnapshot && typeof vatSnapshot === 'object') {
      const snapshot = vatSnapshot as { code?: unknown; ratePercent?: unknown };
      if (typeof snapshot.code === 'string' && snapshot.code.trim()) {
        return snapshot.code;
      }
      if (typeof snapshot.ratePercent === 'number') {
        return `${snapshot.ratePercent}%`;
      }
    }
    return '—';
  }
}
