import { Injectable } from '@nestjs/common';
import type { PdfDocumentInstance } from '../common/pdf/pdf-document.types';

import {
  ISSUER_TENANT_SELECT,
  resolveDocumentIssuer,
} from '../common/company/document-issuer.util';
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
  sourceDisplayLabel,
} from '../sales-orders/sales-order.enum-mapper';
import { CorrispettiviService } from './corrispettivi.service';
import { fiscalStatusDisplayLabel } from './corrispettivi-fiscal.enum-mapper';
import type { ListCorrispettiviQueryDto } from './dto/list-corrispettivi.query.dto';

/**
 * Le colonne del file per il commercialista.
 *
 * ⚠️ **«Data» e non «Data vendita»**, e c'è una colonna **Tipo**: dal 14/08/2026
 * il file contiene anche le rettifiche, e su una riga di reso «data vendita»
 * sarebbe un'etichetta falsa — quella è la data in cui la merce è tornata.
 *
 * Prima elencava le sole vendite mentre l'intestazione portava il netto: chi
 * apriva il file non poteva ricostruire quel totale dalle righe. Un registro
 * che non si riconcilia col proprio riepilogo non è consegnabile.
 */
export const CORRISPETTIVI_ACCOUNTANT_HEADERS = [
  'Data',
  'Tipo',
  'Numero ordine',
  'Canale',
  'Cliente',
  'Email cliente',
  'Imponibile',
  'IVA',
  'Totale',
  'Stato pagamento',
  'Stato fiscale',
  'Nota',
  'Valuta',
] as const;

/** Come si chiama una riga nel file: le stesse parole della schermata. */
const ROW_TYPE_LABELS: Record<string, string> = {
  sale: 'Vendita',
  return_with_restock: 'Reso',
  refund_only: 'Rimborso',
  cancellation: 'Annullamento',
};

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
        select: ISSUER_TENANT_SELECT,
      }),
      this.corrispettivi.getSummary(tenantId, query),
      this.buildAccountantRows(tenantId, query),
    ]);

    // Il registro va al commercialista: in testa ci va l'azienda gestita, la
    // stessa che intesta i documenti, non il cliente VestiFlow.
    const issuer = resolveDocumentIssuer(tenant);
    const periodLabel = formatCorrispettiviPeriodLabel(query);
    const buffer = await renderPdfToBuffer((doc) => {
      this.renderCorrispettiviPdf(doc, {
        tenantName: issuer.legalName,
        vatNumber: issuer.vatNumber,
        periodLabel,
        summary,
        rows,
      });
    });

    const stamp = new Date().toISOString().slice(0, 10);
    const filename = sanitizePdfFilename(`corrispettivi-commercialista-${stamp}`);

    return { buffer, filename: `${filename}.pdf` };
  }

  /**
   * Le righe del file, dallo **stesso dataset della schermata**.
   *
   * Non è una query somigliante: è `buildRegisterRows`, la medesima che
   * alimenta la lista. È l'unico modo di garantire che il file e lo schermo
   * non possano divergere — ed erano divergenti fino al 14/08/2026.
   *
   * Ordine cronologico crescente: un registro si legge dal primo giorno.
   */
  private async buildAccountantRows(
    tenantId: string,
    query: ListCorrispettiviQueryDto,
  ): Promise<AccountantRow[]> {
    const rows = await this.corrispettivi.buildRegisterRows(tenantId, query);

    return [...rows]
      .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime())
      .map((row) => ({
        // «Data» e non «data vendita»: su una rettifica è la data del reso.
        Data: ROME_DATETIME_FORMAT.format(row.occurredAt),
        Tipo: ROW_TYPE_LABELS[row.refundKind ?? row.kind] ?? 'Rettifica',
        'Numero ordine': row.orderNumber,
        Canale: sourceDisplayLabel(row.source),
        Cliente: row.customerName,
        'Email cliente': row.customerEmail ?? '',
        // Gli importi arrivano già col segno: le righe sommano al totale
        // dell'intestazione, ed è la proprietà che rende il file verificabile.
        Imponibile: this.formatMinor(row.taxableMinor),
        IVA: this.formatMinor(row.taxMinor),
        Totale: this.formatMinor(row.totalMinor),
        'Stato pagamento': row.financialStatus
          ? financialStatusDisplayLabel(row.financialStatus)
          : '',
        'Stato fiscale': row.fiscalStatus ? fiscalStatusDisplayLabel(row.fiscalStatus) : '',
        // La colonna «Data consegna commercialista» non c'è più: il file si
        // produce per periodo, quante volte serve, e non registra nulla.
        Nota: row.note ?? '',
        Valuta: row.currency,
      }));
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

    doc
      .font('Helvetica-Bold')
      .fontSize(16)
      .text('Corrispettivi commercialista', left, y + 6);
    y += 28;
    y = drawPdfMetaLine(doc, 'Periodo', periodLabel, y);
    // Il riepilogo si legge come una riconciliazione: quanto venduto, quanto
    // reso, quanto resta. Il commercialista deve poter rifare il conto.
    y = drawPdfMetaLine(doc, 'Vendite', String(summary.orderCount), y);
    y = drawPdfMetaLine(doc, 'Totale vendite', formatMinorAmount(summary.totalMinor), y);
    if (summary.refundCount > 0) {
      y = drawPdfMetaLine(doc, 'Rettifiche', String(summary.refundCount), y);
      y = drawPdfMetaLine(
        doc,
        'Totale rettifiche',
        `− ${formatMinorAmount(summary.refundTotalMinor)}`,
        y,
      );
    }
    if (summary.cancellationCount > 0) {
      y = drawPdfMetaLine(
        doc,
        'Annullamenti',
        `${summary.cancellationCount} — nessun effetto: vendite mai avvenute`,
        y,
      );
    }
    y = drawPdfMetaLine(doc, 'Imponibile', formatMinorAmount(summary.netTaxableMinor), y);
    y = drawPdfMetaLine(doc, 'IVA', formatMinorAmount(summary.netTaxMinor), y);
    y = drawPdfMetaLine(doc, 'Totale corrispettivo', formatMinorAmount(summary.netTotalMinor), y);
    if (summary.undatedFulfilmentCount > 0) {
      y = drawPdfMetaLine(
        doc,
        'Non conteggiate',
        `${summary.undatedFulfilmentCount} vendite evase senza data`,
        y,
      );
    }
    y += 8;

    y = drawPdfSectionTitle(doc, 'Elenco vendite', y);

    const columns: PdfTableColumn[] = [
      { header: 'Data', width: contentWidth * 0.13 },
      { header: 'Tipo', width: contentWidth * 0.11 },
      { header: 'Ordine', width: contentWidth * 0.13 },
      { header: 'Cliente', width: contentWidth * 0.19 },
      { header: 'Canale', width: contentWidth * 0.1 },
      { header: 'Imponibile', width: contentWidth * 0.11, align: 'right' },
      { header: 'IVA', width: contentWidth * 0.1, align: 'right' },
      { header: 'Totale', width: contentWidth * 0.13, align: 'right' },
    ];

    const tableRows = rows.map((row) => [
      row.Data,
      row.Tipo,
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
