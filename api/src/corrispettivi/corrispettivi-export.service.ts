import { Injectable } from '@nestjs/common';
import type { SalesOrderRefundKind } from '@prisma/client';

import type { PdfDocumentInstance } from '../common/pdf/pdf-document.types';

import {
  ISSUER_TENANT_SELECT,
  resolveDocumentIssuer,
} from '../common/company/document-issuer.util';
import { serializeItalianExcelCsv } from '../common/csv.util';
import { serializeExcel2003Xml } from '../common/spreadsheet.util';
import { formatMinorAmount } from '../common/pdf/money-format.util';
import { renderPdfToBuffer, sanitizePdfFilename } from '../common/pdf/pdf-buffer.util';
import {
  drawPdfMetaLine,
  drawPdfSectionTitle,
  drawPdfTable,
  type PdfTableColumn,
} from '../common/pdf/pdf-layout.util';
import { PrismaService } from '../prisma/prisma.service';
import { financialStatusDisplayLabel } from '../sales-orders/sales-order.enum-mapper';
import { originDisplayLabel } from './corrispettivi-classification.util';
import { compareCorrispettiviRowsAsc } from './corrispettivi-sort.util';
import { giornoEconomico } from './corrispettivi-totals.util';
import {
  CorrispettiviService,
  type CorrispettivoVatBreakdownRow,
  type CorrispettiviRegisterRow,
  type CorrispettiviRowKind,
} from './corrispettivi.service';
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
  // «Canale» fino al 17/08/2026, quando le origini erano tre e venivano tutte
  // da un ordine. Con la quarta — il Corrispettivo manuale, che ordine non è —
  // «canale» diventa falso: nessun canale l'ha raccolto, l'ha digitata un
  // operatore. La colonna dice **Origine**, che era già ciò che conteneva.
  'Origine',
  'Cliente',
  'Email cliente',
  'Imponibile',
  'IVA',
  'Totale',
  'Stato pagamento',
  'Nota',
  'Valuta',
  // ── Le due in coda: additive, nessuna delle dodici sopra si sposta ────────
  //
  // **Sede**: il Registro da oggi la mostra e ci si filtra sopra. Un file che
  // non la nomina, prodotto con quel filtro attivo, non direbbe di quale sede
  // sia — e «ciò che il Registro mostra è ciò che esce» (`10` §12).
  'Sede',
  // **Dettaglio IVA**: la registrazione manuale conserva le sue righe per
  // aliquota, e questo è il modo di farle uscire senza rifare l'export. Le
  // altre tre sorgenti la lasciano vuota: il dato esiste nel database ma il
  // Registro non lo legge, e riempirla per corrispondenza inversa direbbe una
  // cosa non verificata su un file che va fuori dall'azienda.
  'Dettaglio IVA',
] as const;

/**
 * La chiave della colonna «Tipo»: il gesto della rettifica quando c'è,
 * altrimenti la natura della riga.
 */
type CorrispettivoRowTypeKey = SalesOrderRefundKind | CorrispettiviRowKind;

/**
 * Come si chiama una riga nel file: le stesse parole della schermata.
 *
 * ⚠️ **Il `Record` è esaustivo di proposito, e non ha più un fallback che
 * decida al posto nostro.** Fino al 17/08/2026 era un `Record<string, string>`
 * con un `?? 'Rettifica'` in coda: una riga di tipo non previsto usciva verso
 * il commercialista come **Rettifica**, cioè come una riga a segno negativo che
 * abbatte il corrispettivo del periodo. È un significato economico falso su un
 * file che esce dall'azienda, e nessuno se ne sarebbe accorto — il file si apre
 * in Excel, non passa da un test.
 *
 * Oggi la chiave è tipizzata: un `SalesOrderRefundKind` o un
 * `CorrispettiviRowKind` nuovo **non compila** finché qualcuno non dichiara come
 * si chiama nel file. È la stessa guardia di `REGISTRO_BY_SOURCE` e di
 * `sourceDisplayLabel` — il compilatore al posto della memoria di chi modifica.
 */
export const ROW_TYPE_LABELS: Readonly<Record<CorrispettivoRowTypeKey, string>> = {
  sale: 'Vendita',
  // Una rettifica di cui non conosciamo il gesto: dice ciò che la riga è
  // (importi negativi), non un gesto che non sappiamo essere avvenuto.
  refund: 'Rettifica',
  return_with_restock: 'Reso',
  refund_only: 'Rimborso',
  cancellation: 'Annullamento',
};

/**
 * L'etichetta di una riga che il catalogo non conosce.
 *
 * Non è un doppione del vincolo del compilatore: il database è **condiviso fra
 * rami**, e un valore di enum aggiunto altrove arriva nei dati prima del codice
 * che lo sa nominare. In quel caso il commercialista legge «Non classificato» e
 * chiede — non legge «Rettifica» e sottrae.
 */
const UNKNOWN_ROW_TYPE_LABEL = 'Non classificato';

/**
 * L'etichetta della colonna «Tipo» per una riga del registro.
 *
 * Esportata perché è la regola che il test presidia: nessun tipo sconosciuto
 * deve poter uscire con l'etichetta di un tipo che esiste.
 */
export function corrispettivoRowTypeLabel(
  row: Pick<CorrispettiviRegisterRow, 'kind' | 'refundKind'>,
): string {
  const key: CorrispettivoRowTypeKey = row.refundKind ?? row.kind;
  return ROW_TYPE_LABELS[key] ?? UNKNOWN_ROW_TYPE_LABEL;
}

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

type AccountantHeader = (typeof CORRISPETTIVI_ACCOUNTANT_HEADERS)[number];
type AccountantRow = Record<(typeof CORRISPETTIVI_ACCOUNTANT_HEADERS)[number], string>;

/**
 * La stessa riga, con il giorno economico ISO a fianco.
 *
 * ⚠️ **Non è un dato in più che esce nel file**: nessuna intestazione lo
 * nomina. Serve SOLO a `buildViewRows` per sapere dove finisce una giornata e
 * comincia la successiva — è la stessa definizione di `corrispettivi-sort.util`
 * e di `giornoEconomico`, non una terza lettura di «giorno».
 */
type AccountantRowConGiorno = AccountantRow & { readonly __giorno: string };


/**
 * Le colonne della **vista** tradotte nelle intestazioni dell'export
 * (`docs/10` §17).
 *
 * ⚠️ **Una tabella esplicita e non un secondo elenco di colonne.** Il Registro
 * nomina le sue colonne con id propri (`occurredAt`, `taxable`), l'export con
 * le intestazioni che finiscono nel file: sono due vocabolari, e questa è la
 * sola traduzione fra i due. Costruire per PDF ed Excel un elenco parallelo
 * significherebbe che il giorno in cui si aggiunge una colonna al Registro ne
 * mancherebbe una nel file, senza che niente lo segnali.
 */
const COLONNA_VISTA_A_INTESTAZIONE: Readonly<Record<string, AccountantHeader>> = {
  occurredAt: 'Data',
  kind: 'Tipo',
  orderNumber: 'Numero ordine',
  source: 'Origine',
  customerName: 'Cliente',
  customerEmail: 'Email cliente',
  location: 'Sede',
  financialStatus: 'Stato pagamento',
  taxable: 'Imponibile',
  tax: 'IVA',
  total: 'Totale',
};

/**
 * Le intestazioni da usare per una vista, **nell'ordine dell'export**.
 *
 * Elenco assente o vuoto = tutte, che è la stessa convenzione dei filtri:
 * niente restrizione significa niente restrizione, non «nessuna colonna».
 */
function intestazioniDellaVista(colonne: readonly string[] | undefined): AccountantHeader[] {
  if (!colonne || colonne.length === 0) {
    return [...CORRISPETTIVI_ACCOUNTANT_HEADERS];
  }
  const volute = new Set(
    colonne.map((id) => COLONNA_VISTA_A_INTESTAZIONE[id]).filter((h): h is AccountantHeader => !!h),
  );
  const scelte = CORRISPETTIVI_ACCOUNTANT_HEADERS.filter((h) => volute.has(h));
  // Una vista senza nessuna colonna riconosciuta non produce un file vuoto:
  // un export che non si spiega è peggio di uno con qualche colonna in più.
  return scelte.length > 0 ? scelte : [...CORRISPETTIVI_ACCOUNTANT_HEADERS];
}
@Injectable()
export class CorrispettiviExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly corrispettivi: CorrispettiviService,
  ) {}

  async exportAccountantCsv(
    tenantId: string,
    query: ListCorrispettiviQueryDto,
  ): Promise<string> {
    const rows = await this.buildAccountantRows(tenantId, query);
    return serializeItalianExcelCsv(CORRISPETTIVI_ACCOUNTANT_HEADERS, rows);
  }

  /** Excel 2003 XML SpreadsheetML (apribile nativamente in Excel). */
  async exportAccountantSpreadsheet(
    tenantId: string,
    query: ListCorrispettiviQueryDto,
  ): Promise<string> {
    // ⚠️ Excel è della famiglia «esporta ciò che sto guardando»: colonne
    // configurate e raggruppamento compresi. Il CSV, subito sopra, no — è
    // l'export DATI, e le sue dodici colonne storiche non si spostano.
    const { headers, righe } = await this.buildViewRows(tenantId, query);
    return serializeExcel2003Xml('Corrispettivi', headers, righe);
  }

  async exportAccountantPdf(
    tenantId: string,
    query: ListCorrispettiviQueryDto,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const [tenant, summary, vista] = await Promise.all([
      this.prisma.tenant.findUniqueOrThrow({
        where: { id: tenantId },
        select: ISSUER_TENANT_SELECT,
      }),
      this.corrispettivi.getSummary(tenantId, query),
      this.buildViewRows(tenantId, query),
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
        headers: vista.headers,
        righe: vista.righe,
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
  ): Promise<AccountantRowConGiorno[]> {
    const rows = await this.corrispettivi.buildRegisterRows(tenantId, query);

    return [...rows]
      // ⚠️ **Lo stesso comparatore dell'elenco**, nel verso crescente: giorno
      // economico, poi istante reale, poi `rowId`. Qui c'era un ordinamento per
      // la sola data — e con due sorgenti che portano un `DATE` (mezzanotte)
      // significava che le loro righe uscivano nell'ordine in cui il database
      // le aveva rese, diverso da quello a schermo e diverso a ogni export.
      .sort(compareCorrispettiviRowsAsc)
      .map((row) => ({
        // «Data» e non «data vendita»: su una rettifica è la data del reso.
        Data: ROME_DATETIME_FORMAT.format(row.occurredAt),
        Tipo: corrispettivoRowTypeLabel(row),
        'Numero ordine': row.orderNumber,
        Origine: originDisplayLabel(row.source),
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
        // Le colonne «Stato fiscale» e «Data consegna commercialista» non ci
        // sono più: il file si produce per periodo, quante volte serve, e non
        // registra nulla.
        Nota: row.note ?? '',
        Valuta: row.currency,
        // «Non determinata» per esteso, non una cella vuota: una cella vuota si
        // legge come un dato dimenticato, questa dice che il dato non c'è — ed
        // è un'anomalia temporanea delle righe Shopify, non uno stato.
        Sede: row.locationName ?? 'Non determinata',
        'Dettaglio IVA': formatVatBreakdown(row.vatBreakdown),
        __giorno: giornoEconomico(row.occurredAt),
      }));
  }


  /**
   * Le righe della **vista corrente**: stesse righe del CSV, ma con le colonne
   * accese e — se il raggruppamento è attivo — l'intestazione di giornata e la
   * riga «Totale giornata» al posto giusto (`docs/10` §17).
   *
   * ⚠️ **Il subtotale NON si ricalcola qui**: arriva da `getSummary`, cioè
   * dall'accumulatore che ha prodotto anche il totale del periodo, di cui è un
   * addendo. Sommare le righe del file sarebbe la seconda matematica — e il
   * piede di una giornata potrebbe non fare più il totale in fondo al foglio.
   *
   * ⚠️ **Il CSV non passa da qui**, ed è voluto: resta l'export dati, una riga
   * per evento, con le dodici colonne storiche al loro posto perché qualcuno ci
   * ha agganciato un foglio.
   */
  private async buildViewRows(
    tenantId: string,
    query: ListCorrispettiviQueryDto,
  ): Promise<{ headers: AccountantHeader[]; righe: Record<string, string>[] }> {
    const headers = intestazioniDellaVista(query.colonne);
    const piatte = await this.buildAccountantRows(tenantId, query);
    const soloColonne = (row: AccountantRow): Record<string, string> =>
      Object.fromEntries(headers.map((h) => [h, row[h]]));

    if (query.raggruppa !== 'day') {
      return { headers, righe: piatte.map(soloColonne) };
    }

    const summary = await this.corrispettivi.getSummary(tenantId, query);
    const totaliPerGiorno = new Map(summary.perGiornata.map((g) => [g.giorno, g.totali]));
    const vuota = (): Record<string, string> =>
      Object.fromEntries(headers.map((h) => [h, '']));

    const righe: Record<string, string>[] = [];
    let giornoCorrente: string | null = null;

    for (const riga of piatte) {
      const giorno = riga.__giorno;
      if (giorno !== giornoCorrente) {
        if (giornoCorrente) righe.push(this.rigaTotaleGiornata(headers, totaliPerGiorno, giornoCorrente, vuota));
        giornoCorrente = giorno;
        righe.push({ ...vuota(), [headers[0]!]: `Data: ${ROME_DATE_FORMAT.format(new Date(`${giorno}T12:00:00.000Z`))}` });
      }
      righe.push(soloColonne(riga));
    }
    if (giornoCorrente) righe.push(this.rigaTotaleGiornata(headers, totaliPerGiorno, giornoCorrente, vuota));

    return { headers, righe };
  }

  /** La riga di chiusura di una giornata, allineata alle colonne economiche. */
  private rigaTotaleGiornata(
    headers: AccountantHeader[],
    totali: Map<string, { netTaxableMinor: number; netTaxMinor: number; netTotalMinor: number }>,
    giorno: string,
    vuota: () => Record<string, string>,
  ): Record<string, string> {
    const t = totali.get(giorno);
    const riga = { ...vuota(), [headers[0]!]: 'Totale giornata' };
    if (!t) return riga;
    if (headers.includes('Imponibile')) riga.Imponibile = this.formatMinor(t.netTaxableMinor);
    if (headers.includes('IVA')) riga.IVA = this.formatMinor(t.netTaxMinor);
    if (headers.includes('Totale')) riga.Totale = this.formatMinor(t.netTotalMinor);
    return riga;
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
      readonly headers: AccountantHeader[];
      readonly righe: Record<string, string>[];
    },
  ): void {
    const { tenantName, vatNumber, periodLabel, summary, headers, righe } = params;
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

    /*
      ⚠️ **Le colonne sono quelle della VISTA, non otto fisse.**

      Erano scritte a mano qui dentro: chi spegneva Cliente dal selettore
      Colonne se lo ritrovava nel PDF, e chi accendeva Sede no. «Esporta ciò che
      sto guardando» vale anche per quali colonne si guardano.

      La larghezza si distribuisce per PESO — le colonne di testo prendono più
      spazio dei numeri — e i pesi si normalizzano sulle colonne effettivamente
      presenti: togliendone una, lo spazio va alle altre invece di lasciare un
      vuoto a destra.
    */
    const pesi: Readonly<Record<string, number>> = {
      Data: 13,
      Tipo: 11,
      'Numero ordine': 13,
      Cliente: 19,
      'Email cliente': 19,
      Origine: 12,
      Sede: 14,
      'Stato pagamento': 12,
      Nota: 16,
      Valuta: 7,
      'Dettaglio IVA': 18,
      Imponibile: 11,
      IVA: 10,
      Totale: 13,
    };
    const numeriche = new Set(['Imponibile', 'IVA', 'Totale']);
    const pesoTotale = headers.reduce((somma, h) => somma + (pesi[h] ?? 12), 0);

    const columns: PdfTableColumn[] = headers.map((h) => ({
      header: h,
      width: (contentWidth * (pesi[h] ?? 12)) / pesoTotale,
      ...(numeriche.has(h) ? { align: 'right' as const } : {}),
    }));

    const tableRows = righe.map((row) => headers.map((h) => row[h] ?? ''));

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

/**
 * Il dettaglio per aliquota di una riga, in una cella sola.
 *
 * Vuoto — non «0%» né «—» — dove la sorgente non lo espone: una cella vuota è
 * l'assenza di un'informazione, un valore è un'affermazione. Su un file che va
 * al commercialista la differenza conta.
 */
function formatVatBreakdown(
  breakdown: readonly CorrispettivoVatBreakdownRow[] | null,
): string {
  if (!breakdown || breakdown.length === 0) {
    return '';
  }
  return breakdown
    .map(
      (row) =>
        `${row.ratePercent}%: imponibile ${EUR_AMOUNT_FORMAT.format(
          row.netMinor / 100,
        )}, IVA ${EUR_AMOUNT_FORMAT.format(row.vatMinor / 100)}`,
    )
    .join(' · ');
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
