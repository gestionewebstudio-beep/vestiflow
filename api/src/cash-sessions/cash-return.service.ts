import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DocumentType, MovementOrigin, Prisma, StockMovementType } from '@prisma/client';
import type { PaymentTenderKind } from '@prisma/client';

import type { UserProfileDto } from '../auth/dto/user-profile.dto';
import { ChannelSyncFacade } from '../channels/channel-sync.facade';
import { CreationIntentService } from '../common/idempotency/creation-intent.util';
import { syncGoodsReceiptLineMovements } from '../documents/document-goods-receipt-sync.util';
import { lockDocumentCounter, resolveDocumentNumber } from '../documents/document-numbering.util';
import { DocumentSettingsService } from '../documents/document-settings.service';
import { PrismaService } from '../prisma/prisma.service';
import { resolveRetailVariants } from '../retail/retail-line.util';

import { assertCashContext, type CashContextUser } from './cash-context.validator';

/**
 * Il reso di cassa, collegato allo scontrino (tranche C4R).
 *
 * ⛔ **Non è una vendita negativa libera.** Parte sempre dal richiamo del
 * documento originale, e ogni riga dichiara **quale riga** di quella vendita
 * rettifica (`DocumentLine.returnedFromLineId`, C4R).
 *
 * ⭐ **Gli importi vengono dalla riga ORIGINALE**, mai dall'anagrafica corrente:
 * prezzo, sconto, IVA, descrizione e snapshot sono quelli di allora. Rendere
 * oggi un articolo comprato a marzo restituisce il prezzo di marzo.
 *
 * ⭐ **Il cumulativo si ricostruisce dalle righe di reso**, non da un contatore:
 * un contatore modificabile è un terzo valore che può contraddire le righe da
 * cui deriva — la stessa disciplina della differenza di cassa.
 */
@Injectable()
export class CashReturnService {
  private readonly logger = new Logger(CashReturnService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: DocumentSettingsService,
    private readonly intents: CreationIntentService,
    private readonly channelSync: ChannelSyncFacade,
  ) {}

  /**
   * Il richiamo dello scontrino: la vendita originale, con quanto è già stato
   * reso riga per riga.
   */
  async lookup(
    tenantId: string,
    user: UserProfileDto,
    locationId: string,
    originalDocumentId: string,
  ): Promise<ReturnLookupResult> {
    return this.prisma.$transaction(async (tx) => {
      await assertCashContext(tx, tenantId, user as CashContextUser, { locationId });

      const originale = await tx.document.findFirst({
        where: { id: originalDocumentId, tenantId, type: DocumentType.store_sale },
        include: {
          lines: { orderBy: { lineNumber: 'asc' } },
          storeSalePayments: { orderBy: { position: 'asc' } },
        },
      });
      if (!originale) {
        throw new NotFoundException('Vendita non trovata.');
      }
      if (originale.status === 'cancelled') {
        throw new UnprocessableEntityException(
          'La vendita è stata annullata: non ci sono articoli da rendere.',
        );
      }

      const gia = await this.quantitaGiaRese(
        tx,
        originale.lines.map((l) => l.id),
      );

      return {
        documentId: originale.id,
        reference: originale.reference ?? '',
        documentDate: originale.documentDate,
        totalMinor: originale.totalMinor,
        // ⚠️ Una vendita senza sessione è una Vendita al banco, non una vendita
        //    Cassa: si può rendere lo stesso, ed è dichiarato invece che dedotto.
        cashSessionId: originale.cashSessionId,
        lines: originale.lines.map((l) => ({
          lineId: l.id,
          variantId: l.variantId,
          description: l.description,
          quantitySold: l.quantity,
          quantityReturned: gia.get(l.id) ?? 0,
          quantityReturnable: Math.max(0, l.quantity - (gia.get(l.id) ?? 0)),
          unitPriceMinor: Number(l.unitPriceMinor),
          lineTotalMinor: l.lineTotalMinor,
          lineGrossTotalMinor: l.lineGrossTotalMinor,
        })),
        payments: originale.storeSalePayments.map((p) => ({
          paymentOptionId: p.paymentOptionId,
          optionName: p.optionNameSnapshot,
          tenderKind: p.tenderKindSnapshot,
          amountMinor: p.amountMinor,
        })),
      };
    });
  }

  async createReturn(
    tenantId: string,
    user: UserProfileDto,
    input: ReturnInput,
  ): Promise<ReturnResult> {
    if (!input.creationIntentId) {
      throw new UnprocessableEntityException(
        'Identità dell’operazione mancante: ricarica la pagina e ripeti.',
      );
    }
    if (input.lines.length === 0) {
      throw new UnprocessableEntityException('Nessuna riga da rendere.');
    }
    const reason = (input.reason ?? '').replace(/\s+/g, ' ').trim();
    if (!reason) {
      throw new UnprocessableEntityException('Il motivo del reso è obbligatorio.');
    }

    const fingerprint = impronta(input);

    let creato;
    try {
      creato = await this.prisma.$transaction(async (tx) => {
        // ── 1. L'intento, prima di tutto ─────────────────────────────────
        await this.intents.claimTx(tx, {
          tenantId,
          intentId: input.creationIntentId,
          scope: DocumentType.store_return,
          fingerprint,
        });

        // ── 2. Contesto: sede corrente, sessione APERTA ──────────────────
        const ctx = await assertCashContext(tx, tenantId, user as CashContextUser, {
          locationId: input.locationId,
          sessionId: input.sessionId,
        });
        const sessione = ctx.session!;

        // ── 3. IL LOCK, in ordine DETERMINISTICO ─────────────────────────
        //
        // ⛔ L'ordine non è pignoleria: due resi che bloccassero le stesse
        //    righe in ordine diverso si aspetterebbero a vicenda — un
        //    deadlock. Ordinati per id, il secondo aspetta e basta.
        //
        // ⚠️ `FOR UPDATE` sulle righe ORIGINALI, non su quelle di reso: è la
        //    quantità venduta che si sta impegnando, e va tenuta ferma finché
        //    questa transazione non ha finito di contare.
        const idOriginali = [...new Set(input.lines.map((l) => l.originalLineId))].sort();
        await tx.$queryRawUnsafe(
          `SELECT "id" FROM "document_lines"
            WHERE "id" = ANY($1::uuid[]) AND "tenant_id" = $2::uuid
            ORDER BY "id"
            FOR UPDATE`,
          idOriginali,
          tenantId,
        );

        // ── 4. La vendita originale, e le sue righe ──────────────────────
        const originale = await tx.document.findFirst({
          where: {
            id: input.originalDocumentId,
            tenantId,
            type: DocumentType.store_sale,
          },
          include: {
            lines: true,
            storeSalePayments: true,
          },
        });
        if (!originale) {
          throw new NotFoundException('Vendita non trovata.');
        }
        if (originale.status === 'cancelled') {
          throw new UnprocessableEntityException('La vendita è stata annullata.');
        }

        const righeOriginali = new Map(originale.lines.map((l) => [l.id, l]));
        for (const id of idOriginali) {
          if (!righeOriginali.has(id)) {
            // ⛔ Una riga che non appartiene al documento indicato: il legame
            //    dev'essere coerente, o il cumulativo conterebbe su un altro
            //    scontrino.
            throw new UnprocessableEntityException(
              'Una delle righe da rendere non appartiene alla vendita indicata.',
            );
          }
        }

        // ── 5. IL CUMULATIVO, ricostruito dalle righe ────────────────────
        const gia = await this.quantitaGiaRese(tx, idOriginali);
        for (const l of input.lines) {
          if (!Number.isInteger(l.quantity) || l.quantity <= 0) {
            throw new UnprocessableEntityException('La quantità da rendere deve essere positiva.');
          }
          const originaleRiga = righeOriginali.get(l.originalLineId)!;
          const resa = gia.get(l.originalLineId) ?? 0;
          if (resa + l.quantity > originaleRiga.quantity) {
            const residuo = originaleRiga.quantity - resa;
            throw new UnprocessableEntityException(
              residuo <= 0
                ? `«${originaleRiga.description}» è già stato reso per intero.`
                : `Di «${originaleRiga.description}» si possono rendere ancora ${residuo} pezzi.`,
            );
          }
        }

        // ── 6. Gli importi, DALLA RIGA ORIGINALE ─────────────────────────
        //
        // ⛔ Mai dal prezzo corrente dell'articolo: si restituisce quello che
        //    il cliente ha pagato, non quello che pagherebbe oggi.
        const righeReso = input.lines.map((l, index) => {
          const o = righeOriginali.get(l.originalLineId)!;
          // Proporzione esatta sulla quantità resa, arrotondata una volta sola.
          const quota = l.quantity / o.quantity;
          return {
            index,
            originale: o,
            quantity: l.quantity,
            lineTotalMinor: Math.round(o.lineTotalMinor * quota),
            lineVatTotalMinor: Math.round(o.lineVatTotalMinor * quota),
            lineGrossTotalMinor: Math.round(o.lineGrossTotalMinor * quota),
          };
        });

        const totaleMinor = righeReso.reduce((s, r) => s + r.lineGrossTotalMinor, 0);
        const imponibileMinor = righeReso.reduce((s, r) => s + r.lineTotalMinor, 0);
        const ivaMinor = righeReso.reduce((s, r) => s + r.lineVatTotalMinor, 0);

        // ── 7. Il rimborso: SOLO le modalità dell'incasso originale ───────
        const rimborsi = await this.risolviRimborsi(
          tx,
          tenantId,
          input.refunds,
          totaleMinor,
          originale.id,
          originale.storeSalePayments,
        );

        // ── 8. Il documento di reso ──────────────────────────────────────
        const setting = await this.settings.getResolved(tenantId, DocumentType.store_return);
        const series = setting.defaultSeries;
        await lockDocumentCounter(tx, { tenantId, type: DocumentType.store_return, series });
        const documentDate = new Date();
        const assigned = await resolveDocumentNumber({
          tx,
          tenantId,
          type: DocumentType.store_return,
          series,
          source: 'document',
          prefix: setting.numberPrefix,
          documentDate,
        });

        const documento = await tx.document.create({
          data: {
            tenantId,
            type: DocumentType.store_return,
            status: 'confirmed',
            series,
            number: assigned.number,
            reference: assigned.reference,
            year: documentDate.getFullYear(),
            documentDate,
            // ⭐ La sede CORRENTE, non quella della vendita: la merce rientra
            //    dove viene fisicamente riportata (`docs/25` §12).
            locationId: input.locationId,
            cashSessionId: sessione.id,
            // ⭐ Il collegamento permanente alla vendita originale.
            sourceDocumentId: originale.id,
            internalComment: reason,
            createdById: user.id,
            createdByName: user.displayName,
            subtotalMinor: imponibileMinor,
            taxMinor: ivaMinor,
            totalMinor: totaleMinor,
          },
        });

        // ── 9. Le righe, con il legame riga → riga ───────────────────────
        await tx.documentLine.createMany({
          data: righeReso.map((r) => ({
            tenantId,
            documentId: documento.id,
            lineNumber: r.index + 1,
            // ⭐ IL LEGAME: questa riga rettifica QUELLA riga di vendita.
            returnedFromLineId: r.originale.id,
            variantId: r.originale.variantId,
            sku: r.originale.sku,
            // ⛔ Descrizione, etichetta e IVA sono quelle della riga ORIGINALE:
            //    è la fotografia di allora, non l'anagrafica di oggi.
            description: r.originale.description,
            variantLabel: r.originale.variantLabel,
            articleCode: r.originale.articleCode,
            productName: r.originale.productName,
            barcode: r.originale.barcode,
            quantity: r.quantity,
            unitPriceMinor: r.originale.unitPriceMinor,
            discountPercent: r.originale.discountPercent,
            vatCodeId: r.originale.vatCodeId,
            vatSnapshot: r.originale.vatSnapshot ?? Prisma.JsonNull,
            lineTotalMinor: r.lineTotalMinor,
            lineVatTotalMinor: r.lineVatTotalMinor,
            lineGrossTotalMinor: r.lineGrossTotalMinor,
            unitOfMeasure: r.originale.unitOfMeasure,
            loadsStock: true,
          })),
        });
        const righeCreate = await tx.documentLine.findMany({
          where: { documentId: documento.id },
          orderBy: { lineNumber: 'asc' },
        });

        // ── 10. Le quote di rimborso ─────────────────────────────────────
        await tx.storeSalePayment.createMany({
          data: rimborsi.map((r, i) => ({
            tenantId,
            documentId: documento.id,
            position: i + 1,
            method: null,
            paymentOptionId: r.optionId,
            optionNameSnapshot: r.nome,
            tenderKindSnapshot: r.classe,
            // ⭐ POSITIVO: la direzione la dà il tipo documento `store_return`.
            amountMinor: r.amountMinor,
          })),
        });

        // ── 11. Il rientro della merce, nella sede CORRENTE ──────────────
        const variantIds = righeCreate
          .map((l) => l.variantId)
          .filter((v): v is string => v !== null);
        const variants = await resolveRetailVariants(tx, tenantId, variantIds);
        await syncGoodsReceiptLineMovements(tx, {
          tenantId,
          documentId: documento.id,
          documentType: DocumentType.store_return,
          locationId: input.locationId,
          reason: `Reso Cassa ${assigned.reference}: ${reason}`,
          movementDate: documentDate,
          movementType: StockMovementType.return,
          origin: MovementOrigin.vestiflow_pos,
          // ⛔ Il costo NON si deriva dalla riga: lì c'è il prezzo di VENDITA, e
          //    derivarlo scriverebbe il ricavo al posto del costo d'acquisto.
          unitCostForNewLine: (line) => variants.get(line.variantId ?? '')?.purchasePriceMinor ?? 0,
          lines: righeCreate,
          actor: { createdById: user.id, createdByName: user.displayName },
        });

        await this.intents.recordResultTx(tx, {
          tenantId,
          intentId: input.creationIntentId,
          resultRef: documento.id,
        });

        return {
          documentId: documento.id,
          reference: assigned.reference,
          totaleMinor,
          variantIds,
        };
      });
    } catch (error) {
      const gia = await this.replayIfAlreadyDone(
        error,
        tenantId,
        input.creationIntentId,
        fingerprint,
      );
      if (gia) {
        return gia;
      }
      throw error;
    }

    this.pushInventoryAsync(tenantId, creato.variantIds, input.locationId);

    return {
      documentId: creato.documentId,
      reference: creato.reference,
      totaleMinor: creato.totaleMinor,
    };
  }

  /**
   * Quanto è già stato reso, per ogni riga originale.
   *
   * ⛔ **Ricostruito dalle righe di reso**, non da un contatore: un contatore
   * modificabile sarebbe un terzo valore capace di contraddire le righe da cui
   * deriva. E i documenti **annullati** non contano.
   */
  private async quantitaGiaRese(
    tx: Prisma.TransactionClient,
    lineIds: readonly string[],
  ): Promise<Map<string, number>> {
    if (lineIds.length === 0) {
      return new Map();
    }
    const righe = await tx.documentLine.findMany({
      where: {
        returnedFromLineId: { in: [...lineIds] },
        document: { status: { not: 'cancelled' } },
      },
      select: { returnedFromLineId: true, quantity: true },
    });
    const mappa = new Map<string, number>();
    for (const r of righe) {
      if (!r.returnedFromLineId) continue;
      mappa.set(r.returnedFromLineId, (mappa.get(r.returnedFromLineId) ?? 0) + r.quantity);
    }
    return mappa;
  }

  /**
   * Il rimborso: **solo** con i Tipi pagamento dell'incasso originale, e per
   * ognuno mai più di quanto era stato incassato con quello.
   */
  private async risolviRimborsi(
    tx: Prisma.TransactionClient,
    tenantId: string,
    refunds: readonly ReturnRefundInput[],
    totaleMinor: number,
    originalDocumentId: string,
    quoteOriginali: readonly {
      paymentOptionId: string | null;
      optionNameSnapshot: string | null;
      tenderKindSnapshot: PaymentTenderKind | null;
      amountMinor: number;
    }[],
  ): Promise<RimborsoRisolto[]> {
    if (refunds.length === 0) {
      throw new UnprocessableEntityException('Manca la composizione del rimborso.');
    }

    // Quanto era stato incassato con ciascun Tipo.
    const incassato = new Map<string, { nome: string; classe: PaymentTenderKind; minor: number }>();
    for (const q of quoteOriginali) {
      if (!q.paymentOptionId || !q.tenderKindSnapshot) continue;
      const corrente = incassato.get(q.paymentOptionId);
      incassato.set(q.paymentOptionId, {
        nome: q.optionNameSnapshot ?? '',
        classe: q.tenderKindSnapshot,
        minor: (corrente?.minor ?? 0) + q.amountMinor,
      });
    }

    // Quanto è già stato rimborsato con ciascun Tipo, sui resi precedenti.
    const resiPrecedenti = await tx.storeSalePayment.findMany({
      where: {
        tenantId,
        document: {
          sourceDocumentId: originalDocumentId,
          type: DocumentType.store_return,
          status: { not: 'cancelled' },
        },
      },
      select: { paymentOptionId: true, amountMinor: true },
    });
    const giaRimborsato = new Map<string, number>();
    for (const r of resiPrecedenti) {
      if (!r.paymentOptionId) continue;
      giaRimborsato.set(
        r.paymentOptionId,
        (giaRimborsato.get(r.paymentOptionId) ?? 0) + r.amountMinor,
      );
    }

    const visti = new Set<string>();
    const risolti: RimborsoRisolto[] = [];
    for (const r of refunds) {
      if (visti.has(r.paymentOptionId)) {
        throw new UnprocessableEntityException(
          'Lo stesso tipo di pagamento compare due volte nel rimborso.',
        );
      }
      visti.add(r.paymentOptionId);

      const origine = incassato.get(r.paymentOptionId);
      if (!origine) {
        // ⛔ Nessuna modalità NUOVA: si restituisce come si è incassato, e un
        //    buono al posto del contante è una decisione che non è stata presa.
        throw new UnprocessableEntityException(
          'Si può rimborsare solo con i tipi di pagamento usati nella vendita originale.',
        );
      }
      if (!Number.isInteger(r.amountMinor) || r.amountMinor <= 0) {
        throw new UnprocessableEntityException('Ogni rimborso deve essere maggiore di zero.');
      }
      const cumulativo = (giaRimborsato.get(r.paymentOptionId) ?? 0) + r.amountMinor;
      if (cumulativo > origine.minor) {
        const residuo = origine.minor - (giaRimborsato.get(r.paymentOptionId) ?? 0);
        throw new UnprocessableEntityException(
          `Con «${origine.nome}» si possono rimborsare ancora ${(residuo / 100).toFixed(2)} €.`,
        );
      }
      if (origine.classe === 'electronic' && r.confirmed !== true) {
        throw new UnprocessableEntityException(
          `Conferma il rimborso «${origine.nome}» sul terminale prima di concludere.`,
        );
      }

      risolti.push({
        optionId: r.paymentOptionId,
        nome: origine.nome,
        classe: origine.classe,
        amountMinor: r.amountMinor,
      });
    }

    const somma = risolti.reduce((s, r) => s + r.amountMinor, 0);
    if (somma !== totaleMinor) {
      throw new UnprocessableEntityException(
        `Il rimborso non copre il reso: ${(somma / 100).toFixed(2)} € contro ${(totaleMinor / 100).toFixed(2)} €.`,
      );
    }
    return risolti;
  }

  /** Gli stessi tre esiti del checkout: replay, conflitto, intento sparito. */
  private async replayIfAlreadyDone(
    error: unknown,
    tenantId: string,
    intentId: string,
    fingerprint: string,
  ): Promise<ReturnResult | null> {
    const esito = await this.intents.resolveConflict({
      error,
      tenantId,
      intentId,
      fingerprint,
    });
    if (!esito) {
      return null;
    }
    const doc = await this.prisma.document.findFirst({
      where: { id: esito.replay, tenantId },
      select: { id: true, reference: true, totalMinor: true },
    });
    if (!doc) {
      throw new ConflictException({
        code: 'creation_intent_result_missing',
        message: 'Il reso risulta già registrato, ma il documento non è più disponibile.',
      });
    }
    return {
      documentId: doc.id,
      reference: doc.reference ?? '',
      totaleMinor: doc.totalMinor,
    };
  }

  /** ⚠️ Non esegue movimenti: è la notifica ai canali, fuori dalla transazione. */
  private pushInventoryAsync(
    tenantId: string,
    variantIds: readonly string[],
    locationId: string,
  ): void {
    for (const variantId of new Set(variantIds)) {
      void Promise.resolve(
        this.channelSync.pushInventoryLevels(tenantId, variantId, [locationId]),
      ).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'Push inventario canali fallito';
        this.logger.warn(`Push inventario post-reso Cassa (${tenantId}): ${message}`);
      });
    }
  }
}

// ── Tipi ───────────────────────────────────────────────────────────────────

export interface ReturnLineInput {
  /** La riga della vendita originale che si sta rettificando. */
  readonly originalLineId: string;
  readonly quantity: number;
}

export interface ReturnRefundInput {
  readonly paymentOptionId: string;
  readonly amountMinor: number;
  readonly confirmed?: boolean;
}

export interface ReturnInput {
  readonly locationId: string;
  readonly sessionId: string;
  readonly originalDocumentId: string;
  readonly creationIntentId: string;
  readonly reason: string;
  readonly lines: readonly ReturnLineInput[];
  readonly refunds: readonly ReturnRefundInput[];
}

export interface ReturnResult {
  readonly documentId: string;
  readonly reference: string;
  readonly totaleMinor: number;
}

export interface ReturnLookupResult {
  readonly documentId: string;
  readonly reference: string;
  readonly documentDate: Date;
  readonly totalMinor: number;
  readonly cashSessionId: string | null;
  readonly lines: readonly {
    readonly lineId: string;
    readonly variantId: string | null;
    readonly description: string;
    readonly quantitySold: number;
    readonly quantityReturned: number;
    readonly quantityReturnable: number;
    readonly unitPriceMinor: number;
    readonly lineTotalMinor: number;
    readonly lineGrossTotalMinor: number;
  }[];
  readonly payments: readonly {
    readonly paymentOptionId: string | null;
    readonly optionName: string | null;
    readonly tenderKind: PaymentTenderKind | null;
    readonly amountMinor: number;
  }[];
}

interface RimborsoRisolto {
  readonly optionId: string;
  readonly nome: string;
  readonly classe: PaymentTenderKind;
  readonly amountMinor: number;
}

function impronta(input: ReturnInput): string {
  return JSON.stringify({
    l: input.locationId,
    s: input.sessionId,
    o: input.originalDocumentId,
    r: input.lines.map((x) => [x.originalLineId, x.quantity]),
    p: input.refunds.map((x) => [x.paymentOptionId, x.amountMinor]),
  });
}
