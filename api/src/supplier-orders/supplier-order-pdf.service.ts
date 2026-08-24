import { Injectable } from '@nestjs/common';
import type { PdfDocumentInstance } from '../common/pdf/pdf-document.types';

import {
  ISSUER_TENANT_SELECT,
  resolveDocumentIssuer,
  type DocumentIssuer,
} from '../common/company/document-issuer.util';
import { drawIssuerFooter, drawIssuerHeader } from '../common/pdf/issuer-header.util';
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
import type { SupplierOrderWithLines } from './supplier-orders.service';
import { printArticleCellLines } from '../documents/document-print-article-cell.util';

/**
 * Export PDF dell'ordine fornitore: stesso stack (pdfkit) e stesso layout dei
 * documenti (`DocumentPdfService`): intestazione azienda, meta, tabella righe,
 * totali. L'ordine è un documento solo commerciale: si stampano esclusivamente
 * i dati reali del modello (riferimento, fornitore, righe con sconto e IVA).
 */
@Injectable()
export class SupplierOrderPdfService {
  constructor(private readonly prisma: PrismaService) {}

  async exportPdf(
    tenantId: string,
    order: SupplierOrderWithLines,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const issuer = await this.loadIssuer(tenantId);

    const buffer = await renderPdfToBuffer((doc) => {
      this.renderOrder(doc, { issuer, order });
    });

    const filename = sanitizePdfFilename(`ordine-fornitore-${order.reference}`);
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
    params: {
      readonly issuer: DocumentIssuer;
      readonly order: SupplierOrderWithLines;
    },
  ): void {
    const { issuer, order } = params;
    const left = doc.page.margins.left;
    const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const currency = order.currency || 'EUR';
    let y = drawIssuerHeader(doc, issuer, doc.page.margins.top);

    doc
      .font('Helvetica-Bold')
      .fontSize(16)
      .text(`Ordine fornitore ${order.reference}`, left, y, { width: contentWidth });
    y += 26;

    y = drawPdfMetaLine(doc, 'Data', formatRomeDate(order.orderDate), y);
    if (order.expectedAt) {
      y = drawPdfMetaLine(doc, 'Consegna prevista', formatRomeDate(order.expectedAt), y);
    }
    y = drawPdfMetaLine(doc, 'Fornitore', order.supplierName, y);
    if (order.supplierReference) {
      y = drawPdfMetaLine(doc, 'Rif. ordine fornitore', order.supplierReference, y);
    }
    y = drawPdfMetaLine(doc, 'Valuta', currency, y);
    // Collegamento all'Arrivo merce visibile nel documento (stato Concluso).
    const linkedReceipts = (order.linkedDocuments ?? [])
      .map((linked) => linked.reference || (linked.number != null ? `n. ${linked.number}` : null))
      .filter((label): label is string => label != null);
    if (linkedReceipts.length > 0) {
      y = drawPdfMetaLine(doc, 'Arrivo merce collegato', linkedReceipts.join(', '), y);
    }
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
          label: 'Totale ordine',
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
    order: SupplierOrderWithLines,
    currency: string,
    y: number,
    contentWidth: number,
  ): number {
    const columns: PdfTableColumn[] = [
      { header: '#', width: contentWidth * 0.05, align: 'right' },
      { header: 'SKU', width: contentWidth * 0.16 },
      { header: 'Descrizione', width: contentWidth * 0.29 },
      { header: 'Q.tà', width: contentWidth * 0.08, align: 'right' },
      { header: 'Costo', width: contentWidth * 0.13, align: 'right' },
      { header: 'Sconto', width: contentWidth * 0.08, align: 'right' },
      { header: 'IVA', width: contentWidth * 0.07, align: 'right' },
      { header: 'Totale', width: contentWidth * 0.14, align: 'right' },
    ];

    const rows = order.lines.map((line, index) => [
      String(index + 1),
      line.sku,
      // La VARIANTE va sotto la descrizione, e va aggiunta esplicitamente: la
      // colonna `description` porta il solo nome da quando la variante ha un
      // campo suo. Senza, un ordine stampato non direbbe quale taglia si sta
      // ordinando — su un ordine al fornitore, il dato piu' importante.
      //
      // Lo SKU NON si passa: qui e' gia' una colonna a se'.
      printArticleCellLines({
        description: line.description || line.sku,
        variantLabel: line.variantLabel,
      }).join('\n'),
      String(line.orderedQuantity),
      // Costo e sconto sono colonne NUMERIC: arrivano come Decimal, e la stampa
      // è un punto di uscita — si convertono qui, dove si arrotondano.
      formatMinorAmount(Number(line.unitCostMinor), currency),
      Number(line.discountPercent) > 0 ? `${Number(line.discountPercent)}%` : '—',
      this.vatLabel(line.vatSnapshot),
      formatMinorAmount(line.lineTotalMinor, currency),
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
