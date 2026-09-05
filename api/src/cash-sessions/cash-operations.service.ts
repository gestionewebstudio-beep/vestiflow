import { Injectable, NotFoundException } from '@nestjs/common';
import { DocumentStatus, DocumentType, Prisma } from '@prisma/client';
import type { PaymentTenderKind } from '@prisma/client';

import type { UserProfileDto } from '../auth/dto/user-profile.dto';
import {
  resolveReadableListLocationScope,
  scopedLocationFilter,
} from '../inventory/licensed-location-scope.util';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Il **registro operativo** della Cassa: vendite e resi, riga per riga.
 *
 * ⛔ **Non è il Registro corrispettivi**, e i due non si sovrappongono. Quello è
 * **contabile** e aggrega valori economici di tutte le origini; questo serve a
 * vedere **le operazioni** — chi, quando, con quali quote, con quale resto, in
 * quale sessione. Le operazioni di Cassa alimentano il primo per il solo fatto
 * di essere `store_sale`/`store_return` (provato in
 * `corrispettivi-cassa.integration-spec.ts`): qui non si contabilizza niente.
 *
 * ⭐ **«Operazione di Cassa» significa `cashSessionId` valorizzato.** È l'unica
 * cosa che distingue una vendita di Cassa da una Vendita al banco: stesso tipo
 * documento, stessa contabilità, sessione in più. Un filtro diverso — un tipo
 * proprio, un flag — separerebbe anche la contabilità, che è ciò che non si
 * vuole.
 *
 * ⛔ **Gli importi restano POSITIVI**: il verso lo dà il tipo documento. È la
 * stessa regola del Registro e della Nota di credito.
 *
 * ⛔ **Nessun campo di stato fiscale**, e non è una dimenticanza. La prima
 * stesura ne portava uno che valeva sempre «non disponibile»: un campo con un
 * valore solo non informa, e `fiscalStatus` è **vocabolario ritirato** — la
 * guardia `check:registro-legacy` lo rifiuta, perché il Registro classifica
 * per ORIGINE, che è un fatto, non per uno stato fiscale sulla vendita.
 *
 * ⚠️ Quando C5 arriverà, gli stati saranno quelli veri — emissione sul
 * registratore, chiusura RT, trasmissione, esito dell'Agenzia — e vivranno
 * dove vive il dato fiscale, non come etichetta su una riga di registro. Fino
 * ad allora la schermata dice a parole che la fiscalizzazione non c'è.
 */
@Injectable()
export class CashOperationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** L'elenco paginato, con i totali aggregati **dello stesso filtro**. */
  async list(
    tenantId: string,
    user: UserProfileDto,
    query: OperationsQuery,
  ): Promise<OperationsPage> {
    const where = await this.buildWhere(tenantId, user, query);
    if (!where) {
      // Nessuna sede in ambito: elenco vuoto, non errore.
      return { items: [], total: 0, page: query.page, pageSize: query.pageSize, summary: VUOTO };
    }

    const skip = (query.page - 1) * query.pageSize;
    const [righe, total, summary] = await Promise.all([
      this.prisma.document.findMany({
        where,
        orderBy: [{ documentDate: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: query.pageSize,
        select: SELECT_RIGA,
      }),
      this.prisma.document.count({ where }),
      this.summary(where),
    ]);

    const nonQuadrati = await this.idNonQuadrati(
      tenantId,
      righe.map((r) => r.id),
    );

    return {
      items: righe.map((r) => this.toRiga(r, nonQuadrati)),
      total,
      page: query.page,
      pageSize: query.pageSize,
      summary,
    };
  }

  /** Il dettaglio: righe, quote, resto, movimenti, sessione, collegamenti. */
  async detail(tenantId: string, user: UserProfileDto, id: string): Promise<OperationDetail> {
    const scope = await resolveReadableListLocationScope(this.prisma, tenantId, user);
    const documento = await this.prisma.document.findFirst({
      where: {
        id,
        tenantId,
        cashSessionId: { not: null },
        type: { in: [DocumentType.store_sale, DocumentType.store_return] },
        ...(scope === 'unrestricted' ? {} : { locationId: { in: [...(scope ?? [])] } }),
      },
      select: SELECT_DETTAGLIO,
    });
    if (!documento) {
      // ⚠️ «di un altro tenant», «fuori ambito» e «inesistente» rispondono
      //    uguale: distinguerle direbbe cosa esiste altrove.
      throw new NotFoundException('Operazione non trovata.');
    }

    const movimenti = await this.prisma.stockMovement.findMany({
      where: { tenantId, sourceDocumentId: documento.id },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        type: true,
        quantity: true,
        sku: true,
        locationId: true,
        createdAt: true,
        createdByName: true,
      },
    });

    const nonQuadrati = await this.idNonQuadrati(tenantId, [documento.id]);

    return {
      ...this.toRiga(documento, nonQuadrati),
      taxableMinor: documento.subtotalMinor,
      taxMinor: documento.taxMinor,
      notes: documento.internalComment,
      lines: documento.lines.map((l) => ({
        ...l,
        unitPriceMinor: Number(l.unitPriceMinor),
        discountPercent: l.discountPercent === null ? null : Number(l.discountPercent),
      })),
      session: documento.cashSession,
      relatedReturns: documento.derivedDocuments,
      stockMovements: movimenti,
    };
  }

  /**
   * La ricerca dello scontrino **senza UUID** (`docs/25` §12-quater).
   *
   * ⛔ L'operatore non conosce un identificativo: cerca per numero, data,
   * importo, articolo o cliente. Il `documentId` resta il modo con cui il reso
   * si aggancia, ma non è più il modo con cui si TROVA.
   *
   * ⚠️ Non cerca nel registratore né all'Agenzia, e non lo dice: C5 non esiste.
   */
  async searchReceipts(
    tenantId: string,
    user: UserProfileDto,
    query: ReceiptSearchQuery,
  ): Promise<readonly ReceiptSearchResult[]> {
    const scope = await resolveReadableListLocationScope(this.prisma, tenantId, user);
    if (scope !== 'unrestricted' && (!scope || scope.length === 0)) {
      return [];
    }

    const testo = (query.text ?? '').trim();
    const importo = query.totalMinor;
    const clausole: Prisma.DocumentWhereInput[] = [];
    if (testo) {
      clausole.push(
        { reference: { contains: testo, mode: 'insensitive' } },
        { customerName: { contains: testo, mode: 'insensitive' } },
        // ⭐ Anche per ARTICOLO: «la maglia rossa di stamattina» è il modo in
        //    cui un cliente descrive lo scontrino che non ha più.
        {
          lines: {
            some: {
              OR: [
                { description: { contains: testo, mode: 'insensitive' } },
                { sku: { contains: testo, mode: 'insensitive' } },
                { barcode: { contains: testo, mode: 'insensitive' } },
                { articleCode: { contains: testo, mode: 'insensitive' } },
              ],
            },
          },
        },
      );
      const numero = Number.parseInt(testo, 10);
      if (Number.isInteger(numero) && String(numero) === testo) {
        clausole.push({ number: numero });
      }
    }

    // ⛔ **La sede chiesta RESTRINGE il perimetro**: fuori, non si cerca.
    const sede = scopedLocationFilter(scope, query.locationId);
    if (!sede) {
      return [];
    }

    const righe = await this.prisma.document.findMany({
      where: {
        tenantId,
        type: DocumentType.store_sale,
        cashSessionId: { not: null },
        status: { not: DocumentStatus.cancelled },
        ...sede,
        ...this.periodo(query.from, query.to),
        ...(importo !== undefined ? { totalMinor: importo } : {}),
        ...(clausole.length > 0 ? { OR: clausole } : {}),
      },
      orderBy: [{ documentDate: 'desc' }, { createdAt: 'desc' }],
      take: Math.min(query.limit ?? 20, 50),
      select: {
        id: true,
        reference: true,
        number: true,
        documentDate: true,
        createdAt: true,
        totalMinor: true,
        customerName: true,
        createdByName: true,
        location: { select: { id: true, name: true } },
        lines: { select: { quantity: true, description: true }, orderBy: { lineNumber: 'asc' } },
      },
    });

    return righe.map((r) => ({
      documentId: r.id,
      reference: r.reference ?? (r.number != null ? String(r.number) : ''),
      documentDate: r.documentDate,
      createdAt: r.createdAt,
      totalMinor: r.totalMinor,
      customerName: r.customerName,
      operatorName: r.createdByName,
      locationId: r.location?.id ?? null,
      locationName: r.location?.name ?? null,
      lineCount: r.lines.length,
      // ⭐ Una descrizione breve per riconoscere lo scontrino a colpo d'occhio.
      itemsPreview: r.lines
        .slice(0, 3)
        .map((l) => `${l.quantity}× ${l.description}`)
        .join(' · '),
    }));
  }

  // ── Il filtro ─────────────────────────────────────────────────────────────

  private async buildWhere(
    tenantId: string,
    user: UserProfileDto,
    query: OperationsQuery,
  ): Promise<Prisma.DocumentWhereInput | null> {
    const scope = await resolveReadableListLocationScope(this.prisma, tenantId, user);
    if (scope !== 'unrestricted' && (!scope || scope.length === 0)) {
      return null;
    }

    // ⛔ **La sede chiesta RESTRINGE il perimetro, non lo sostituisce.**
    //    Fuori perimetro si risponde vuoto, come quando il perimetro e` vuoto.
    const sede = scopedLocationFilter(scope, query.locationId);
    if (!sede) {
      return null;
    }

    const tipi =
      query.kind === 'sale'
        ? [DocumentType.store_sale]
        : query.kind === 'return'
          ? [DocumentType.store_return]
          : [DocumentType.store_sale, DocumentType.store_return];

    const quote: Prisma.StoreSalePaymentWhereInput = {};
    if (query.paymentOptionId) {
      quote.paymentOptionId = query.paymentOptionId;
    }
    if (query.tenderKind) {
      quote.tenderKindSnapshot = query.tenderKind;
    }

    /*
      ⛔ **DUE `OR` SULLA STESSA PROPRIETA` NE LASCIANO UNO.**

      `number` scriveva `OR` e `anomaliesOnly` ne scriveva un altro: con
      entrambi attivi la ricerca per numero **spariva**, e l_elenco
      rispondeva «tutte le anomalie» a chi ne aveva chiesta una sola.

      ⭐ I gruppi alternativi vanno in `AND`, che e` gia` la forma usata dal
      registro documenti (`documents.service`, `andClauses`): ogni gruppo
      resta un `OR` suo, e valgono tutti insieme.

      ⚠️ **Non falliva**: rispondeva di piu`, il che e` il modo in cui un
      filtro perso non si nota.
    */
    const gruppi: Prisma.DocumentWhereInput[] = [];
    if (query.number) {
      gruppi.push({
        OR: [
          { reference: { contains: query.number, mode: 'insensitive' as const } },
          ...(Number.isInteger(Number(query.number)) ? [{ number: Number(query.number) }] : []),
        ],
      });
    }
    if (query.anomaliesOnly) {
      gruppi.push({ OR: [...ANOMALIE_ESPRIMIBILI] });
    }

    return {
      tenantId,
      // ⭐ È QUESTO che significa «di Cassa».
      cashSessionId: query.sessionId ?? { not: null },
      type: { in: tipi },
      ...sede,
      ...(query.operatorId ? { createdById: query.operatorId } : {}),
      ...this.periodo(query.from, query.to),
      ...(Object.keys(quote).length > 0 ? { storeSalePayments: { some: quote } } : {}),
      ...(gruppi.length > 0 ? { AND: gruppi } : {}),
    };
  }

  private periodo(from?: string, to?: string): Prisma.DocumentWhereInput {
    if (!from && !to) {
      return {};
    }
    return {
      documentDate: {
        ...(from ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}),
        ...(to ? { lte: new Date(`${to}T23:59:59.999Z`) } : {}),
      },
    };
  }

  // ── I totali ──────────────────────────────────────────────────────────────

  /**
   * I totali dello stesso filtro, calcolati **sul server**.
   *
   * ⛔ **Gli annullati escono dai totali** ma restano nell'elenco: un registro
   * che li nasconde non è verificabile, uno che li somma mente.
   *
   * ⭐ **Somma valori già determinati** (`regole-gestionale`, «il riepilogo
   * SOMMA, non ricalcola»): i totali di testata e gli importi delle quote,
   * mai una formula rifatta qui.
   */
  private async summary(where: Prisma.DocumentWhereInput): Promise<OperationsSummary> {
    const vivi: Prisma.DocumentWhereInput = {
      ...where,
      status: { not: DocumentStatus.cancelled },
    };
    // ⛔ **`AND`, non uno spread.** Uno spread `{ ...vivi, type: … }`
    //    SOVRASCRIVE il tipo che il filtro aveva già scelto: chiedendo «solo
    //    vendite», il totale dei resi tornava quello di TUTTI i resi. Il
    //    riepilogo deve seguire il filtro — è la stessa proprietà che il
    //    Registro corrispettivi si è già dovuto imporre (`docs/10` §16).
    const solo = (type: DocumentType): Prisma.DocumentWhereInput => ({
      AND: [vivi, { type }],
    });
    const [vendite, resi, quoteVendite, quoteResi] = await Promise.all([
      this.prisma.document.aggregate({
        where: solo(DocumentType.store_sale),
        _sum: { totalMinor: true },
        _count: { _all: true },
      }),
      this.prisma.document.aggregate({
        where: solo(DocumentType.store_return),
        _sum: { totalMinor: true },
        _count: { _all: true },
      }),
      this.prisma.storeSalePayment.groupBy({
        by: ['tenderKindSnapshot'],
        where: { document: solo(DocumentType.store_sale) },
        _sum: { amountMinor: true },
      }),
      this.prisma.storeSalePayment.groupBy({
        by: ['tenderKindSnapshot'],
        where: { document: solo(DocumentType.store_return) },
        _sum: { amountMinor: true },
      }),
    ]);

    const perClasse = (
      gruppi: readonly { tenderKindSnapshot: PaymentTenderKind | null; _sum: { amountMinor: number | null } }[],
      classe: PaymentTenderKind,
    ): number => gruppi.find((g) => g.tenderKindSnapshot === classe)?._sum.amountMinor ?? 0;

    const lorde = vendite._sum.totalMinor ?? 0;
    const rese = resi._sum.totalMinor ?? 0;
    const operazioni = vendite._count._all + resi._count._all;

    return {
      grossSalesMinor: lorde,
      returnsMinor: rese,
      netSalesMinor: lorde - rese,
      cashMinor: perClasse(quoteVendite, 'cash') - perClasse(quoteResi, 'cash'),
      electronicMinor: perClasse(quoteVendite, 'electronic') - perClasse(quoteResi, 'electronic'),
      saleCount: vendite._count._all,
      returnCount: resi._count._all,
      operationCount: operazioni,
      // ⚠️ Il medio è sul NETTO diviso le operazioni, ed è dichiarato perché
      //    «valore medio» da solo ammette tre letture diverse.
      averageMinor: operazioni === 0 ? 0 : Math.round((lorde - rese) / operazioni),
    };
  }

  /**
   * Le operazioni le cui quote **non sommano al totale**.
   *
   * ⛔ Non è esprimibile in Prisma — confronta un aggregato con una colonna — e
   * senza questa query l'anomalia più grave sarebbe l'unica non rilevabile.
   */
  private async idNonQuadrati(
    tenantId: string,
    ids: readonly string[],
  ): Promise<ReadonlySet<string>> {
    if (ids.length === 0) {
      return new Set();
    }
    const righe = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT d."id"
        FROM "documents" d
        LEFT JOIN "store_sale_payments" p ON p."document_id" = d."id"
       WHERE d."tenant_id" = ${tenantId}::uuid
         AND d."id" = ANY(${[...ids]}::uuid[])
         AND d."status" <> 'cancelled'::"DocumentStatus"
       GROUP BY d."id", d."total_minor"
      HAVING COALESCE(SUM(p."amount_minor"), 0) <> d."total_minor"`;
    return new Set(righe.map((r) => r.id));
  }

  // ── La proiezione ─────────────────────────────────────────────────────────

  private toRiga(d: RigaGrezza, nonQuadrati: ReadonlySet<string>): OperationRow {
    const quote = d.storeSalePayments;
    const contante = quote.filter((q) => q.tenderKindSnapshot === 'cash');
    const resto = contante.reduce(
      (tot, q) => tot + Math.max(0, (q.tenderedMinor ?? q.amountMinor) - q.amountMinor),
      0,
    );

    const anomalie: string[] = [];
    if (d.status === DocumentStatus.cancelled) {
      anomalie.push('annullato');
    }
    if (quote.some((q) => q.tenderKindSnapshot === null)) {
      anomalie.push('quota_non_classificata');
    }
    if (d.type === DocumentType.store_return && !d.sourceDocumentId) {
      anomalie.push('reso_senza_origine');
    }
    if (
      d.type === DocumentType.store_return &&
      quote.some((q) => q.refundedFromPaymentId === null)
    ) {
      anomalie.push('rimborso_non_agganciato');
    }
    if (nonQuadrati.has(d.id)) {
      anomalie.push('quote_non_quadrate');
    }

    return {
      id: d.id,
      kind: d.type === DocumentType.store_sale ? 'sale' : 'return',
      reference: d.reference ?? (d.number != null ? String(d.number) : ''),
      documentDate: d.documentDate,
      createdAt: d.createdAt,
      status: d.status,
      locationId: d.location?.id ?? null,
      locationName: d.location?.name ?? null,
      operatorId: d.createdById,
      operatorName: d.createdByName,
      sessionId: d.cashSessionId,
      customerName: d.customerName,
      totalMinor: d.totalMinor,
      payments: quote.map((q) => ({
        paymentOptionId: q.paymentOptionId,
        optionName: q.optionNameSnapshot,
        tenderKind: q.tenderKindSnapshot,
        amountMinor: q.amountMinor,
        tenderedMinor: q.tenderedMinor,
        refundedFromPaymentId: q.refundedFromPaymentId,
      })),
      // ⭐ «Misto» è CALCOLATO a lettura, mai persistito (`docs/25` §6).
      mixed: quote.length > 1,
      changeMinor: resto,
      sourceDocumentId: d.sourceDocumentId,
      sourceReference: d.sourceDocument?.reference ?? null,
      anomalies: anomalie,
    };
  }
}

// ── Il filtro delle anomalie, per la parte esprimibile in Prisma ────────────

const ANOMALIE_ESPRIMIBILI: Prisma.DocumentWhereInput[] = [
  { status: DocumentStatus.cancelled },
  { storeSalePayments: { some: { tenderKindSnapshot: null } } },
  { type: DocumentType.store_return, sourceDocumentId: null },
  { type: DocumentType.store_return, storeSalePayments: { some: { refundedFromPaymentId: null } } },
];

const SELECT_RIGA = Prisma.validator<Prisma.DocumentSelect>()({
  id: true,
  type: true,
  status: true,
  reference: true,
  number: true,
  documentDate: true,
  createdAt: true,
  totalMinor: true,
  customerName: true,
  createdById: true,
  createdByName: true,
  cashSessionId: true,
  sourceDocumentId: true,
  location: { select: { id: true, name: true } },
  sourceDocument: { select: { id: true, reference: true, documentDate: true } },
  storeSalePayments: {
    orderBy: { position: 'asc' },
    select: {
      paymentOptionId: true,
      optionNameSnapshot: true,
      tenderKindSnapshot: true,
      amountMinor: true,
      tenderedMinor: true,
      refundedFromPaymentId: true,
    },
  },
});

type RigaGrezza = Prisma.DocumentGetPayload<{ select: typeof SELECT_RIGA }>;

/**
 * Il dettaglio: la riga piu` cio` che si guarda solo aprendo l_operazione.
 *
 * ⭐ Un select PROPRIO e non uno spread dentro la query: `DocumentGetPayload`
 * ha bisogno di un oggetto con tipi letterali, e uno spread inline li perde —
 * il risultato torna tipizzato come il Document intero, e ogni campo scelto
 * qui smette di essere verificato.
 */
const SELECT_DETTAGLIO = Prisma.validator<Prisma.DocumentSelect>()({
  ...SELECT_RIGA,
  subtotalMinor: true,
  taxMinor: true,
  internalComment: true,
  lines: {
    orderBy: { lineNumber: 'asc' },
    select: {
      id: true,
      lineNumber: true,
      variantId: true,
      sku: true,
      description: true,
      variantLabel: true,
      articleCode: true,
      productName: true,
      barcode: true,
      quantity: true,
      unitPriceMinor: true,
      discountPercent: true,
      vatCodeId: true,
      vatSnapshot: true,
      lineTotalMinor: true,
      lineVatTotalMinor: true,
      lineGrossTotalMinor: true,
      unitOfMeasure: true,
      returnedFromLineId: true,
      loadsStock: true,
    },
  },
  cashSession: {
    select: {
      id: true,
      status: true,
      openedAt: true,
      closedAt: true,
      openedByName: true,
      fiscalDeviceId: true,
    },
  },
  // ⭐ I resi collegati: una `findMany` sola, non una per riga.
  derivedDocuments: {
    where: { type: DocumentType.store_return },
    orderBy: { documentDate: 'asc' },
    select: {
      id: true,
      reference: true,
      documentDate: true,
      status: true,
      totalMinor: true,
    },
  },
});

const VUOTO: OperationsSummary = {
  grossSalesMinor: 0,
  returnsMinor: 0,
  netSalesMinor: 0,
  cashMinor: 0,
  electronicMinor: 0,
  saleCount: 0,
  returnCount: 0,
  operationCount: 0,
  averageMinor: 0,
};

// ── Tipi ───────────────────────────────────────────────────────────────────

export interface OperationsQuery {
  readonly page: number;
  readonly pageSize: number;
  readonly from?: string;
  readonly to?: string;
  readonly locationId?: string;
  readonly operatorId?: string;
  readonly sessionId?: string;
  readonly kind?: 'sale' | 'return';
  readonly paymentOptionId?: string;
  readonly tenderKind?: PaymentTenderKind;
  readonly number?: string;
  readonly anomaliesOnly?: boolean;
}

export interface OperationsSummary {
  readonly grossSalesMinor: number;
  readonly returnsMinor: number;
  readonly netSalesMinor: number;
  readonly cashMinor: number;
  readonly electronicMinor: number;
  readonly saleCount: number;
  readonly returnCount: number;
  readonly operationCount: number;
  /** Netto diviso le operazioni. */
  readonly averageMinor: number;
}

export interface OperationRow {
  readonly id: string;
  readonly kind: 'sale' | 'return';
  readonly reference: string;
  readonly documentDate: Date;
  readonly createdAt: Date;
  readonly status: DocumentStatus;
  readonly locationId: string | null;
  readonly locationName: string | null;
  readonly operatorId: string | null;
  readonly operatorName: string;
  readonly sessionId: string | null;
  readonly customerName: string | null;
  readonly totalMinor: number;
  readonly payments: readonly {
    readonly paymentOptionId: string | null;
    readonly optionName: string | null;
    readonly tenderKind: PaymentTenderKind | null;
    readonly amountMinor: number;
    readonly tenderedMinor: number | null;
    readonly refundedFromPaymentId: string | null;
  }[];
  readonly mixed: boolean;
  readonly changeMinor: number;
  readonly sourceDocumentId: string | null;
  readonly sourceReference: string | null;
  readonly anomalies: readonly string[];
}

export interface OperationsPage {
  readonly items: readonly OperationRow[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly summary: OperationsSummary;
}

export interface OperationDetail extends OperationRow {
  readonly taxableMinor: number;
  readonly taxMinor: number;
  readonly notes: string | null;
  readonly lines: readonly unknown[];
  readonly session: unknown;
  readonly relatedReturns: readonly unknown[];
  readonly stockMovements: readonly unknown[];
}

export interface ReceiptSearchQuery {
  readonly text?: string;
  readonly from?: string;
  readonly to?: string;
  readonly locationId?: string;
  readonly totalMinor?: number;
  readonly limit?: number;
}

export interface ReceiptSearchResult {
  readonly documentId: string;
  readonly reference: string;
  readonly documentDate: Date;
  readonly createdAt: Date;
  readonly totalMinor: number;
  readonly customerName: string | null;
  readonly operatorName: string;
  readonly locationId: string | null;
  readonly locationName: string | null;
  readonly lineCount: number;
  readonly itemsPreview: string;
}
