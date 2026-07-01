import { Injectable } from '@nestjs/common';
import type { PdfDocumentInstance } from '../common/pdf/pdf-document.types';

import { serializeItalianExcelCsv } from '../common/csv.util';
import { formatMinorAmount } from '../common/pdf/money-format.util';
import { renderPdfToBuffer, sanitizePdfFilename } from '../common/pdf/pdf-buffer.util';
import {
  drawPdfMetaLine,
  drawPdfSectionTitle,
  drawPdfTable,
  type PdfTableColumn,
} from '../common/pdf/pdf-layout.util';
import { PrismaService } from '../prisma/prisma.service';
import {
  financialStatusDisplayLabel,
  fulfillmentStatusDisplayLabel,
  sourceDisplayLabel,
} from '../sales-orders/sales-order.enum-mapper';
import { CorrispettiviService } from './corrispettivi.service';
import { fiscalStatusDisplayLabel } from './corrispettivi-fiscal.enum-mapper';
import { buildCorrispettiviWhere } from './corrispettivi-query.util';
import type { ListCorrispettiviQueryDto } from './dto/list-corrispettivi.query.dto';

export const CORRISPETTIVI_ACCOUNTANT_HEADERS = [
  'Data vendita',
  'Numero ordine',
  'Canale',
  'Cliente',
  'Email cliente',
  'Imponibile',
  'IVA',
  'Totale',
  'Spedizione',
  'Sconto',
  'Stato pagamento',
  'Stato evasione',
  'Stato fiscale',
  'Data consegna commercialista',
  'Nota fiscale',
  'Valuta',
  'ID Shopify',
] as const;

const ROME_DATETIME_FORMAT = new Intl.DateTimeFormat('it-IT', {
  timeZone: 'Europe/Rome',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const ROME_DATE_FORMAT = new Intl.DateTimeFormat('it-IT', {
  timeZone: 'Europe/Rome',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const EUR_AMOUNT_FORMAT = new Intl.NumberFormat('it-IT', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

type AccountantRow = Record<(typeof CORRISPETTIVI_ACCOUNTANT_HEADERS)[number], string>;

@Injectable()
export class CorrispettiviExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly corrispettivi: CorrispettiviService,
  ) {}

  async exportAccountantCsv(tenantId: string, query: ListCorrispettiviQueryDto): Promise<string> {
    const rows = await this.buildAccountantRows(tenantId, query);
    return serializeItalianExcelCsv(CORRISPETTIVI_ACCOUNTANT_HEADERS, rows);
  }

  /** Excel 2003 XML SpreadsheetML (apribile nativamente in Excel). */
  async exportAccountantSpreadsheet(
    tenantId: string,
    query: ListCorrispettiviQueryDto,
  ): Promise<string> {
    const rows = await this.buildAccountantRows(tenantId, query);
    return serializeExcel2003Xml(CORRISPETTIVI_ACCOUNTANT_HEADERS, rows);
  }

  async exportAccountantPdf(
    tenantId: string,
    query: ListCorrispettiviQueryDto,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const [tenant, summary, rows] = await Promise.all([
      this.prisma.tenant.findUniqueOrThrow({
        where: { id: tenantId },
        select: { name: true, legalName: true, vatNumber: true },
      }),
      this.corrispettivi.getSummary(tenantId, query),
      this.buildAccountantRows(tenantId, query),
    ]);

    const periodLabel = formatCorrispettiviPeriodLabel(query);
    const buffer = await renderPdfToBuffer((doc) => {
      this.renderCorrispettiviPdf(doc, {
        tenantName: tenant.legalName?.trim() || tenant.name,
        vatNumber: tenant.vatNumber,
        periodLabel,
        summary,
        rows,
      });
    });

    const stamp = new Date().toISOString().slice(0, 10);
    const filename = sanitizePdfFilename(`corrispettivi-commercialista-${stamp}`);

    return { buffer, filename: `${filename}.pdf` };
  }

  private async buildAccountantRows(
    tenantId: string,
    query: ListCorrispettiviQueryDto,
  ): Promise<AccountantRow[]> {
    const orders = await this.prisma.salesOrder.findMany({
      where: buildCorrispettiviWhere(tenantId, query),
      include: { customer: { select: { email: true } } },
      orderBy: { placedAt: 'asc' },
    });

    return orders.map((order) => {
      const taxableMinor = Math.max(0, order.subtotalMinor - order.discountMinor);
      return {
        'Data vendita': ROME_DATETIME_FORMAT.format(order.placedAt),
        'Numero ordine': order.orderNumber,
        Canale: sourceDisplayLabel(order.source),
        Cliente: order.customerName,
        'Email cliente': order.customer?.email ?? '',
        Imponibile: this.formatMinor(taxableMinor),
        IVA: this.formatMinor(order.taxMinor),
        Totale: this.formatMinor(order.totalMinor),
        Spedizione: this.formatMinor(order.shippingMinor),
        Sconto: this.formatMinor(order.discountMinor),
        'Stato pagamento': financialStatusDisplayLabel(order.financialStatus),
        'Stato evasione': fulfillmentStatusDisplayLabel(order.fulfillmentStatus),
        'Stato fiscale': fiscalStatusDisplayLabel(order.fiscalStatus),
        'Data consegna commercialista': order.fiscalDeliveredAt
          ? ROME_DATE_FORMAT.format(order.fiscalDeliveredAt)
          : '',
        'Nota fiscale': order.fiscalNote ?? '',
        Valuta: order.currency,
        'ID Shopify': order.shopifyOrderId ?? '',
      };
    });
  }

  private formatMinor(minor: number): string {
    return EUR_AMOUNT_FORMAT.format(minor / 100);
  }

  private renderCorrispettiviPdf(
    doc: PdfDocumentInstance,
    params: {
      readonly tenantName: string;
      readonly vatNumber: string | null;
      readonly periodLabel: string;
      readonly summary: Awaited<ReturnType<CorrispettiviService['getSummary']>>;
      readonly rows: AccountantRow[];
    },
  ): void {
    const { tenantName, vatNumber, periodLabel, summary, rows } = params;
    const left = doc.page.margins.left;
    const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    let y = doc.page.margins.top;

    doc.font('Helvetica-Bold').fontSize(11).text(tenantName, left, y);
    y += 14;
    if (vatNumber) {
      doc.font('Helvetica').fontSize(9).text(`P. IVA: ${vatNumber}`, left, y);
      y += 14;
    }

    doc.font('Helvetica-Bold').fontSize(16).text('Corrispettivi commercialista', left, y + 6);
    y += 28;
    y = drawPdfMetaLine(doc, 'Periodo', periodLabel, y);
    y = drawPdfMetaLine(doc, 'Ordini', String(summary.orderCount), y);
    y = drawPdfMetaLine(doc, 'Resi', String(summary.refundsCount), y);
    y = drawPdfMetaLine(doc, 'Imponibile', formatMinorAmount(summary.taxableMinor), y);
    y = drawPdfMetaLine(doc, 'IVA', formatMinorAmount(summary.taxMinor), y);
    y = drawPdfMetaLine(doc, 'Totale', formatMinorAmount(summary.totalMinor), y);
    y += 8;

    y = drawPdfSectionTitle(doc, 'Elenco vendite', y);

    const columns: PdfTableColumn[] = [
      { header: 'Data', width: contentWidth * 0.14 },
      { header: 'Ordine', width: contentWidth * 0.14 },
      { header: 'Cliente', width: contentWidth * 0.22 },
      { header: 'Canale', width: contentWidth * 0.12 },
      { header: 'Imponibile', width: contentWidth * 0.12, align: 'right' },
      { header: 'IVA', width: contentWidth * 0.12, align: 'right' },
      { header: 'Totale', width: contentWidth * 0.14, align: 'right' },
    ];

    const tableRows = rows.map((row) => [
      row['Data vendita'],
      row['Numero ordine'],
      row.Cliente,
      row.Canale,
      row.Imponibile,
      row.IVA,
      row.Totale,
    ]);

    drawPdfTable({
      doc,
      x: left,
      y,
      pageWidth: contentWidth,
      columns,
      rows: tableRows,
    });
  }
}

function formatCorrispettiviPeriodLabel(query: ListCorrispettiviQueryDto): string {
  if (query.placedFrom && query.placedTo) {
    const from = ROME_DATE_FORMAT.format(new Date(query.placedFrom));
    const to = ROME_DATE_FORMAT.format(new Date(query.placedTo));
    return `${from} – ${to}`;
  }
  if (query.placedFrom) {
    return `Dal ${ROME_DATE_FORMAT.format(new Date(query.placedFrom))}`;
  }
  if (query.placedTo) {
    return `Al ${ROME_DATE_FORMAT.format(new Date(query.placedTo))}`;
  }
  return 'Tutto il periodo';
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function serializeExcel2003Xml(
  headers: readonly string[],
  rows: readonly Record<string, string>[],
): string {
  const headerCells = headers
    .map((header) => `<Cell><Data ss:Type="String">${escapeXml(header)}</Data></Cell>`)
    .join('');
  const dataRows = rows
    .map((row) => {
      const cells = headers
        .map((header) => {
          const value = row[header] ?? '';
          return `<Cell><Data ss:Type="String">${escapeXml(value)}</Data></Cell>`;
        })
        .join('');
      return `<Row>${cells}</Row>`;
    })
    .join('');

  return (
    '<?xml version="1.0"?>\n' +
    '<?mso-application progid="Excel.Sheet"?>\n' +
    '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"\n' +
    ' xmlns:o="urn:schemas-microsoft-com:office:office"\n' +
    ' xmlns:x="urn:schemas-microsoft-com:office:excel"\n' +
    ' xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">\n' +
    '<Worksheet ss:Name="Corrispettivi">\n' +
    '<Table>\n' +
    `<Row>${headerCells}</Row>\n` +
    `${dataRows}\n` +
    '</Table>\n' +
    '</Worksheet>\n' +
    '</Workbook>'
  );
}
