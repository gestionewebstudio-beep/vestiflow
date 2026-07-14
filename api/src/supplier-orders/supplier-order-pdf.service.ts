import { Injectable } from '@nestjs/common';
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
import type { SupplierOrderWithLines } from './supplier-orders.service';

interface TenantPdfHeader {
  readonly legalName: string;
  readonly addressLine: string | null;
  readonly vatNumber: string | null;
}

/**
 * Export PDF dell'ordine fornitore: stesso stack (pdfkit) e stesso layout dei
 * documenti (`DocumentPdfService`): intestazione azienda, meta, tabella righe,
 * totali. L'ordine è un documento solo commerciale: si stampano esclusivamente
 * i dati reali del modello (riferimento, fornitore, destinazione, righe).
 */
@Injectable()
export class SupplierOrderPdfService {
  constructor(private readonly prisma: PrismaService) {}

  async exportPdf(
    tenantId: string,
    order: SupplierOrderWithLines,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const [tenant, destinationName] = await Promise.all([
      this.loadTenantHeader(tenantId),
      this.loadDestinationName(tenantId, order.destinationLocationId),
    ]);

    const buffer = await renderPdfToBuffer((doc) => {
      this.renderOrder(doc, { tenant, order, destinationName });
    });

    const filename = sanitizePdfFilename(`ordine-fornitore-${order.reference}`);
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

  private async loadDestinationName(tenantId: string, locationId: string): Promise<string | null> {
    const location = await this.prisma.location.findFirst({
      where: { tenantId, id: locationId },
      select: { name: true },
    });
    return location?.name ?? null;
  }

  private renderOrder(
    doc: PdfDocumentInstance,
    params: {
      readonly tenant: TenantPdfHeader;
      readonly order: SupplierOrderWithLines;
      readonly destinationName: string | null;
    },
  ): void {
    const { tenant, order, destinationName } = params;
    const left = doc.page.margins.left;
    const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const currency = order.currency || 'EUR';
    let y = doc.page.margins.top;

    doc.font('Helvetica-Bold').fontSize(11).text(tenant.legalName, left, y);
    y += 14;
    if (tenant.addressLine) {
      doc.font('Helvetica').fontSize(9).fillColor('#444444').text(tenant.addressLine, left, y);
      y += 12;
    }
    if (tenant.vatNumber) {
      doc.font('Helvetica').fontSize(9).fillColor('#444444').text(`P. IVA: ${tenant.vatNumber}`, left, y);
      y += 12;
    }
    doc.fillColor('#000000');
    y += 8;

    doc
      .font('Helvetica-Bold')
      .fontSize(16)
      .text(`Ordine fornitore ${order.reference}`, left, y, { width: contentWidth });
    y += 26;

    y = drawPdfMetaLine(doc, 'Data ordine', formatRomeDate(order.createdAt), y);
    if (order.expectedAt) {
      y = drawPdfMetaLine(doc, 'Consegna attesa', formatRomeDate(order.expectedAt), y);
    }
    y = drawPdfMetaLine(doc, 'Fornitore', order.supplierName, y);
    y = drawPdfMetaLine(doc, 'Destinazione merce', destinationName ?? '—', y);
    y = drawPdfMetaLine(doc, 'Valuta', currency, y);
    y += 8;

    if (order.lines.length > 0) {
      y = drawPdfSectionTitle(doc, 'Righe ordine', y);
      y = this.renderLinesTable(doc, order, currency, y, contentWidth);
    }

    drawPdfTotals(
      doc,
      [
        {
          label: 'Totale ordine',
          value: formatMinorAmount(order.totalMinor, currency),
          bold: true,
        },
      ],
      y,
    );
  }

  private renderLinesTable(
    doc: PdfDocumentInstance,
    order: SupplierOrderWithLines,
    currency: string,
    y: number,
    contentWidth: number,
  ): number {
    const columns: PdfTableColumn[] = [
      { header: '#', width: contentWidth * 0.06, align: 'right' },
      { header: 'SKU', width: contentWidth * 0.4 },
      { header: 'Q.tà ordinata', width: contentWidth * 0.14, align: 'right' },
      { header: 'Costo unitario', width: contentWidth * 0.2, align: 'right' },
      { header: 'Totale riga', width: contentWidth * 0.2, align: 'right' },
    ];

    const rows = order.lines.map((line, index) => [
      String(index + 1),
      line.sku,
      String(line.orderedQuantity),
      formatMinorAmount(line.unitCostMinor, currency),
      formatMinorAmount(line.orderedQuantity * line.unitCostMinor, currency),
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
}
