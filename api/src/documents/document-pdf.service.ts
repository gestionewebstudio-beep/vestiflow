import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { DocumentType } from '@prisma/client';
import type { PdfDocumentInstance } from '../common/pdf/pdf-document.types';

import {
  ISSUER_TENANT_SELECT,
  readIssuerSnapshot,
  resolveDocumentIssuer,
  type DocumentIssuer,
} from '../common/company/document-issuer.util';
import { formatMinorAmount, formatPercent } from '../common/pdf/money-format.util';
import {
  drawIssuerFooter,
  drawIssuerHeader,
  issuerFooterLine,
  issuerHeaderLines,
} from '../common/pdf/issuer-header.util';
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
import { storeSalePaymentMethodLabelWithNote } from '../store-sales/store-sale-payment-label.util';
import { vatSnapshotRatePercent } from '../vat/vat-snapshot.util';
import { isSalesInvoiceDocumentType } from './document-type.util';
import { DEFAULT_PRINT_TITLE } from './document-defaults';
import {
  documentPrintDisclaimer,
  documentPrintKind,
  documentPrintShowsValues,
  documentReferenceLabel,
  isPrintableDocumentType,
} from './document-print.util';
import { printArticleCellLines } from './document-print-article-cell.util';
import type { DocumentDetail } from './documents.service';

/** Ora inizio trasporto in fuso Europa/Roma (stampa DDT). */
const ROME_TIME_FORMAT = new Intl.DateTimeFormat('it-IT', {
  timeZone: 'Europe/Rome',
  hour: '2-digit',
  minute: '2-digit',
});

/**
 * Documenti di vendita in cui la sede va stampata: lo scarico manuale (dove la
 * location è il contesto dell'operazione) e la vendita al banco, dove il cliente
 * può non esserci affatto e la sede resta l'unico riferimento.
 */
const SALES_TYPES_WITH_LOCATION: readonly DocumentType[] = [
  DocumentType.manual_unload,
  DocumentType.store_sale,
  DocumentType.store_return,
] as const;

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

    const [issuer, locations] = await Promise.all([
      this.loadIssuer(tenantId, document),
      this.loadLocationNames(tenantId, document),
    ]);

    const reference = documentReferenceLabel(document.reference, document.series);
    const title = document.printTitle ?? DEFAULT_PRINT_TITLE[document.type];
    const currency = document.currency ?? 'EUR';

    const buffer = await renderPdfToBuffer((doc) => {
      this.renderDocument(doc, {
        issuer,
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

  /**
   * L'intestazione che QUESTO documento stamperà, già composta in righe.
   *
   * La serve l'anteprima a schermo, che prima non mostrava l'emittente affatto:
   * il foglio scaricato portava ragione sociale, indirizzo e partita IVA,
   * l'anteprima no — cioè l'anteprima non anticipava la stampa, che è l'unica
   * cosa per cui esiste.
   *
   * Passa da qui e non da un'anagrafica letta viva nel frontend perché deve
   * valere la stessa regola del PDF: su un documento già emesso vince lo
   * snapshot congelato all'emissione, non l'azienda com'è oggi.
   */
  async issuerHeader(
    tenantId: string,
    document: DocumentDetail,
  ): Promise<{
    legalName: string;
    lines: readonly string[];
    footer: string | null;
  }> {
    const issuer = await this.loadIssuer(tenantId, document);
    return {
      legalName: issuer.legalName,
      lines: issuerHeaderLines(issuer),
      footer: issuerFooterLine(issuer),
    };
  }

  /**
   * L'intestazione congelata all'emissione vince sempre: una fattura già
   * emessa si ristampa identica anche se l'anagrafica nel frattempo è
   * cambiata. Solo i documenti anteriori allo snapshot rileggono l'azienda
   * com'è adesso.
   */
  private async loadIssuer(tenantId: string, document: DocumentDetail): Promise<DocumentIssuer> {
    const snapshot = readIssuerSnapshot(document.issuerSnapshot);
    if (snapshot) {
      return snapshot;
    }

    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: ISSUER_TENANT_SELECT,
    });
    return resolveDocumentIssuer(tenant);
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
      readonly issuer: DocumentIssuer;
      readonly document: DocumentDetail;
      readonly locations: Map<string, string>;
      readonly title: string;
      readonly reference: string;
      readonly currency: string;
    },
  ): void {
    const { issuer, document, locations, title, reference, currency } = params;
    const left = doc.page.margins.left;
    const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    let y = drawIssuerHeader(doc, issuer, doc.page.margins.top);

    const disclaimer = documentPrintDisclaimer(document.type);
    if (disclaimer) {
      doc
        .font('Helvetica-Bold')
        .fontSize(9)
        .fillColor('#663c00')
        .text(disclaimer, left, y, { width: contentWidth });
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
    }

    // Il blocco totali esiste solo dove esistono i valori: su un
    // trasferimento o una rettifica sarebbe una riga «Totale 0,00 €» sotto una
    // colonna di zeri (vedi documentPrintShowsValues).
    if (document.lines.length > 0 && documentPrintShowsValues(document.type)) {
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
      y = this.renderPaymentSection(doc, document, y);
    }

    if (documentPrintKind(document.type) === 'purchase_invoice') {
      y = this.renderPurchaseInvoiceSections(doc, document, currency, y);
    }

    if (document.notes?.trim()) {
      y += 12;
      y = drawPdfSectionTitle(doc, 'Note', y);
      doc.font('Helvetica').fontSize(10).text(document.notes.trim(), left, y, {
        width: contentWidth,
      });
      y += doc.heightOfString(document.notes.trim(), { width: contentWidth });
    }

    // Registro Imprese in coda: obbligatorio per le società, assente per tutti
    // gli altri (drawIssuerFooter non stampa una riga vuota).
    drawIssuerFooter(doc, issuer, y + 18);
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

  /**
   * Registrazione fattura fornitore: quanto resta da pagare e quali arrivi
   * merce la fattura copre. Sono dati già presenti in `DocumentDetail` e mai
   * letti finora dalla stampa — nessuna query nuova, nessuna migration — e
   * senza di loro il foglio non spiega il proprio totale.
   */
  private renderPurchaseInvoiceSections(
    doc: PdfDocumentInstance,
    document: DocumentDetail,
    currency: string,
    y: number,
  ): number {
    let next = y;

    if (document.paymentInstallments.length > 0) {
      next += 12;
      next = drawPdfSectionTitle(doc, 'Scadenze', next);
      for (const installment of document.paymentInstallments) {
        const amount = formatMinorAmount(installment.amountMinor, currency);
        next = drawPdfMetaLine(
          doc,
          formatRomeDate(installment.dueDate),
          installment.settled ? `${amount} · saldata` : amount,
          next,
        );
      }
    }

    if (document.outstandingMinor > 0) {
      next = drawPdfMetaLine(
        doc,
        'Ancora da saldare',
        formatMinorAmount(document.outstandingMinor, currency),
        next,
      );
    }

    // Solo gli arrivi che hanno un riferimento: uno senza numero non aiuta a
    // ritrovare il documento, ed è l'unica cosa che questa riga serve a fare.
    const receipts = document.linkedGoodsReceipts
      .map((receipt) => receipt.reference)
      .filter((reference): reference is string => Boolean(reference?.trim()));
    if (receipts.length > 0) {
      next += 12;
      next = drawPdfSectionTitle(doc, 'Arrivi merce inclusi', next);
      next = drawPdfMetaLine(doc, 'Documenti', receipts.join(', '), next);
    }

    return next;
  }

  /** Dati pagamento in fattura: condizioni, scadenza e IBAN, se presenti. */
  private renderPaymentSection(
    doc: PdfDocumentInstance,
    document: DocumentDetail,
    y: number,
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
        // Causale di carico: sul carico manuale e su quello iniziale il
        // fornitore manca spesso, e senza causale il foglio non direbbe nulla
        // su cosa sia entrato in magazzino.
        if (document.causalText?.trim()) {
          y = drawPdfMetaLine(doc, 'Causale', document.causalText.trim(), y);
        }
        break;
      }
      case 'purchase_invoice': {
        if (document.supplierName) {
          y = drawPdfMetaLine(doc, 'Fornitore', document.supplierName, y);
        }
        // Il documento è del fornitore: la data che conta per noi è quella in
        // cui è stato registrato, e sta accanto alla data del documento.
        if (document.registrationDate) {
          y = drawPdfMetaLine(doc, 'Registrata il', formatRomeDate(document.registrationDate), y);
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
        // Scarico manuale e vendita al banco: la sede è il contesto operativo, e
        // sulla vendita al banco è spesso l'unico (il cliente può mancare).
        if (SALES_TYPES_WITH_LOCATION.includes(document.type) && document.locationId) {
          y = drawPdfMetaLine(doc, 'Location', locations.get(document.locationId) ?? '—', y);
        }
        // Vendita al banco: il metodo è salvato come codice grezzo, non come
        // testo — va tradotto o sul foglio finisce «cash». Gli altri documenti
        // di vendita portano il pagamento nella sezione trasporto.
        if (document.type === DocumentType.store_sale && document.paymentMethod) {
          y = drawPdfMetaLine(
            doc,
            'Pagamento',
            storeSalePaymentMethodLabelWithNote(document.paymentMethod, document.paymentMethodNote),
            y,
          );
        }
        break;
      }
      case 'stock': {
        if (document.locationId) {
          y = drawPdfMetaLine(doc, 'Location', locations.get(document.locationId) ?? '—', y);
        }
        // Senza il verso, la quantità di una rettifica non dice se la giacenza
        // sale o scende: è il dato che rende leggibile il foglio.
        // Stesso testo del dettaglio a schermo (document-detail.component.ts):
        // il foglio e la maschera non devono chiamare le cose in due modi.
        if (document.adjustmentDirection) {
          y = drawPdfMetaLine(
            doc,
            'Direzione',
            document.adjustmentDirection === 'increase' ? 'Aumento giacenza' : 'Diminuzione giacenza',
            y,
          );
        }
        // Il motivo della rettifica NON si stampa, per quanto obbligatorio:
        // vive in `internalComment`, e quel campo è dichiarato all'operatore
        // come «Nota interna, mai in stampa» (purchase-invoice-form). Sullo
        // stesso campo l'inventario scrive un UUID di sessione e la cassa una
        // frase fissa: stamparlo per un tipo solo romperebbe la promessa e
        // farebbe uscire l'UUID al primo tipo aggiunto per distrazione.
        // Ciò che l'operatore vuole sul foglio lo scrive in Note, che il PDF
        // stampa già in coda per ogni tipo.
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

    // Movimenti interni di magazzino: chi li ha eseguiti fa parte del foglio
    // (regole-gestionale §Auditabilità). Sui documenti diretti all'esterno no:
    // lì risponde l'azienda che emette, non l'operatore che ha digitato.
    if ((kind === 'transfer' || kind === 'stock') && document.createdByName) {
      y = drawPdfMetaLine(doc, 'Eseguito da', document.createdByName, y);
    }

    // Documento emesso dall'altra parte: sta con gli altri riferimenti di
    // testata e vale per ogni tipo, non più solo per l'arrivo merce.
    const counterparty = counterpartyDocLabel(document);
    if (counterparty) {
      y = drawPdfMetaLine(doc, 'Documento controparte', counterparty, y);
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
    // Senza valori la riga è «cosa» e «quanto»: le quattro colonne di prezzo
    // non si spengono, non ci sono. Lo spazio che liberano va all'articolo e
    // alla quantità, che su un foglio di magazzino è il dato che si legge.
    const showsValues = documentPrintShowsValues(document.type);

    const columns: PdfTableColumn[] = showsValues
      ? [
          { header: '#', width: contentWidth * 0.05, align: 'right' },
          { header: 'Articolo', width: contentWidth * 0.34 },
          { header: 'Q.tà', width: contentWidth * 0.08, align: 'right' },
          { header: 'Prezzo', width: contentWidth * 0.13, align: 'right' },
          { header: 'Sconto', width: contentWidth * 0.08, align: 'right' },
          { header: 'IVA', width: contentWidth * 0.08, align: 'right' },
          { header: 'Totale', width: contentWidth * 0.24, align: 'right' },
        ]
      : [
          { header: '#', width: contentWidth * 0.06, align: 'right' },
          { header: 'Articolo', width: contentWidth * 0.72 },
          { header: 'Q.tà', width: contentWidth * 0.22, align: 'right' },
        ];

    const rows = document.lines.map((line) => {
      // La composizione della cella sta in `document-print-article-cell.util`,
      // dove può essere PROVATA: qui dentro nessun test la raggiunge, perché
      // pdfkit comprime i flussi e del buffer si può verificare solo che
      // cominci per %PDF. È così che la variante avrebbe potuto sparire dalla
      // stampa senza far arrossare niente.
      const articleParts = printArticleCellLines({
        description: line.description,
        variantLabel: line.variantLabel,
        sku: line.sku,
        serialNumbers: parseSerialNumbers(line.serialNumbers),
      });
      const head = [String(line.lineNumber), articleParts.join('\n'), String(line.quantity)];
      if (!showsValues) {
        return head;
      }

      const vatRatePercent = vatSnapshotRatePercent(line.vatSnapshot);

      return [
        ...head,
        // Punto di uscita: due decimali in stampa (§sei decimali).
        formatMinorAmount(Number(line.unitPriceMinor), currency),
        Number(line.discountPercent) > 0 ? formatPercent(Number(line.discountPercent)) : '—',
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

/**
 * «DDT 145 del 08/05/2026»: il documento della controparte in una riga sola,
 * '' quando nessuno dei tre campi è compilato — così la riga non si stampa
 * affatto. Gemella di `counterpartyDocLabel` del frontend: stesso testo, qui
 * con la data nel fuso Europa/Roma come il resto della stampa.
 */
function counterpartyDocLabel(document: DocumentDetail): string {
  const head = [document.externalDocumentTypeSnapshot, document.externalDocNumber]
    .map((part) => part?.trim() ?? '')
    .filter((part) => part.length > 0)
    .join(' ');
  if (!document.externalDocDate) {
    return head;
  }
  const date = formatRomeDate(document.externalDocDate);
  return head ? `${head} del ${date}` : date;
}

function parseSerialNumbers(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
}
