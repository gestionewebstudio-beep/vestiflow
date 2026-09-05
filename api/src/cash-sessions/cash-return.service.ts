import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DocumentType, MovementOrigin, Prisma, StockMovementType } from '@prisma/client';
import type { DocumentLine, PaymentTenderKind } from '@prisma/client';

import type { UserProfileDto } from '../auth/dto/user-profile.dto';
import { ChannelSyncFacade } from '../channels/channel-sync.facade';
import { CreationIntentService } from '../common/idempotency/creation-intent.util';
import { syncGoodsReceiptLineMovements } from '../documents/document-goods-receipt-sync.util';
import { lockDocumentCounter, resolveDocumentNumber } from '../documents/document-numbering.util';
import { DocumentSettingsService } from '../documents/document-settings.service';
import { PrismaService } from '../prisma/prisma.service';
import { resolveRetailVariants } from '../retail/retail-line.util';
import {
  allocateRetailReturn,
  NO_RETURNED_AMOUNTS,
  type ReturnedLineAmounts,
} from '../retail/retail-return-allocation.util';

import {
  assertCashContext,
  assertCashReplayContext,
  type CashContextUser,
} from './cash-context.validator';

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

      const gia = await this.importiGiaResi(
        tx,
        tenantId,
        originale.lines.map((l) => l.id),
      );
      const rimborsi = await this.rimborsiGiaEseguiti(
        tx,
        tenantId,
        originale.storeSalePayments.map((p) => p.id),
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
          quantityReturned: gia.get(l.id)?.quantity ?? 0,
          quantityReturnable: Math.max(0, l.quantity - (gia.get(l.id)?.quantity ?? 0)),
          unitPriceMinor: Number(l.unitPriceMinor),
          lineTotalMinor: l.lineTotalMinor,
          lineGrossTotalMinor: l.lineGrossTotalMinor,
        })),
        payments: originale.storeSalePayments.map((p) => ({
          // ⭐ È QUESTO che il rimborso indica, non il Tipo pagamento.
          paymentId: p.id,
          paymentOptionId: p.paymentOptionId,
          optionName: p.optionNameSnapshot,
          tenderKind: p.tenderKindSnapshot,
          amountMinor: p.amountMinor,
          refundedMinor: rimborsi.get(p.id) ?? 0,
          remainingMinor: p.amountMinor - (rimborsi.get(p.id) ?? 0),
        })),
      };
    });
  }

  /** Anteprima sullo storico: riusa la stessa ripartizione del salvataggio. Nessun intento o effetto. */
  async preview(
    tenantId: string,
    user: UserProfileDto,
    input: ReturnPreviewInput,
  ): Promise<ReturnPreviewResult> {
    return this.prisma.$transaction(async (tx) => {
      await assertCashContext(tx, tenantId, user, { locationId: input.locationId });
      await this.lockOriginalLines(tx, tenantId, input.lines);
      const original = await tx.document.findFirst({
        where: { id: input.originalDocumentId, tenantId, type: DocumentType.store_sale },
        include: { lines: true, storeSalePayments: { orderBy: { position: 'asc' } } },
      });
      if (!original) throw new NotFoundException('Vendita non trovata.');
      if (original.status === 'cancelled')
        throw new UnprocessableEntityException('La vendita è stata annullata.');
      const lines = await this.prepareReturnLines(tx, tenantId, original.lines, input.lines);
      const refunded = await this.rimborsiGiaEseguiti(
        tx,
        tenantId,
        original.storeSalePayments.map((p) => p.id),
      );
      return {
        totalMinor: lines.reduce((total, line) => total + line.lineGrossTotalMinor, 0),
        netMinor: lines.reduce((total, line) => total + line.lineTotalMinor, 0),
        vatMinor: lines.reduce((total, line) => total + line.lineVatTotalMinor, 0),
        lines: lines.map((line) => ({
          originalLineId: line.originale.id,
          quantity: line.quantity,
          netMinor: line.lineTotalMinor,
          vatMinor: line.lineVatTotalMinor,
          grossMinor: line.lineGrossTotalMinor,
        })),
        payments: original.storeSalePayments.map((payment) => ({
          originalPaymentId: payment.id,
          remainingMinor: payment.amountMinor - (refunded.get(payment.id) ?? 0),
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
        await this.lockOriginalLines(tx, tenantId, input.lines);

        // ── 3-bis. E le QUOTE originali, sempre in ordine ────────────────
        //
        // ⛔ Due resi su righe prodotto DIVERSE non competono su nessuna riga,
        //    ma attingono alla STESSA quota di incasso. Senza questo lock
        //    leggerebbero entrambi lo stesso residuo, e la stessa somma
        //    verrebbe restituita due volte.
        const idQuote = [...new Set(input.refunds.map((q) => q.originalPaymentId))].sort();
        await tx.$queryRawUnsafe(
          `SELECT "id" FROM "store_sale_payments"
            WHERE "id" = ANY($1::uuid[]) AND "tenant_id" = $2::uuid
            ORDER BY "id"
            FOR UPDATE`,
          idQuote,
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

        const righeReso = await this.prepareReturnLines(tx, tenantId, originale.lines, input.lines);

        const totaleMinor = righeReso.reduce((s, r) => s + r.lineGrossTotalMinor, 0);
        const imponibileMinor = righeReso.reduce((s, r) => s + r.lineTotalMinor, 0);
        const ivaMinor = righeReso.reduce((s, r) => s + r.lineVatTotalMinor, 0);

        // ── 7. Il rimborso: SOLO le quote dell'incasso originale ─────────
        const rimborsi = await this.risolviRimborsi(
          tx,
          tenantId,
          input.refunds,
          totaleMinor,
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
            unitCostNet: r.originale.unitCostNet,
            unitCostGross: r.originale.unitCostGross,
            unitVatAmount: r.originale.unitVatAmount,
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
            // ⭐ IL LEGAME: questa quota restituisce QUELLA quota di incasso.
            refundedFromPaymentId: r.originalPaymentId,
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
      const gia = await this.replayIfAlreadyDone(error, tenantId, user, input, fingerprint);
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

  private async lockOriginalLines(
    tx: Prisma.TransactionClient,
    tenantId: string,
    lines: readonly ReturnLineInput[],
  ): Promise<void> {
    const ids = [...new Set(lines.map((line) => line.originalLineId))].sort();
    if (ids.length !== lines.length)
      throw new UnprocessableEntityException(
        'La stessa riga compare due volte nel reso: unisci le quantità.',
      );
    if (ids.length === 0) throw new UnprocessableEntityException('Nessuna riga da rendere.');
    await tx.$queryRawUnsafe(
      `SELECT "id" FROM "document_lines" WHERE "id" = ANY($1::uuid[]) AND "tenant_id" = $2::uuid ORDER BY "id" FOR UPDATE`,
      ids,
      tenantId,
    );
  }

  private async prepareReturnLines(
    tx: Prisma.TransactionClient,
    tenantId: string,
    originals: readonly DocumentLine[],
    lines: readonly ReturnLineInput[],
  ) {
    const originalById = new Map(originals.map((line) => [line.id, line]));
    const previous = await this.importiGiaResi(
      tx,
      tenantId,
      lines.map((line) => line.originalLineId),
    );
    return lines.map((line, index) => {
      const original = originalById.get(line.originalLineId);
      if (!original)
        throw new UnprocessableEntityException(
          'Una delle righe da rendere non appartiene alla vendita indicata.',
        );
      const returned = previous.get(original.id) ?? NO_RETURNED_AMOUNTS;
      if (returned.quantity + line.quantity > original.quantity) {
        const remaining = original.quantity - returned.quantity;
        throw new UnprocessableEntityException(
          remaining <= 0
            ? `«${original.description}» è già stato reso per intero.`
            : `Di «${original.description}» si possono rendere ancora ${remaining} pezzi.`,
        );
      }
      return {
        index,
        originale: original,
        quantity: line.quantity,
        ...allocateRetailReturn(original, returned, line.quantity),
      };
    });
  }

  private async rimborsiGiaEseguiti(
    tx: Prisma.TransactionClient,
    tenantId: string,
    paymentIds: readonly string[],
  ): Promise<Map<string, number>> {
    const rows = await tx.storeSalePayment.findMany({
      where: {
        tenantId,
        refundedFromPaymentId: { in: [...paymentIds] },
        document: { tenantId, status: { not: 'cancelled' } },
      },
      select: { refundedFromPaymentId: true, amountMinor: true },
    });
    const result = new Map<string, number>();
    for (const row of rows) {
      if (row.refundedFromPaymentId)
        result.set(
          row.refundedFromPaymentId,
          (result.get(row.refundedFromPaymentId) ?? 0) + row.amountMinor,
        );
    }
    return result;
  }

  /**
   * Quantità e importi già resi, per ogni riga originale.
   *
   * ⛔ **Ricostruito dalle righe di reso**, non da un contatore: un contatore
   * modificabile sarebbe un terzo valore capace di contraddire le righe da cui
   * deriva. E i documenti **annullati** non contano.
   */
  private async importiGiaResi(
    tx: Prisma.TransactionClient,
    tenantId: string,
    lineIds: readonly string[],
  ): Promise<Map<string, ReturnedLineAmounts>> {
    if (lineIds.length === 0) {
      return new Map();
    }
    const righe = await tx.documentLine.findMany({
      where: {
        tenantId,
        returnedFromLineId: { in: [...lineIds] },
        document: { tenantId, status: { not: 'cancelled' } },
      },
      select: {
        returnedFromLineId: true,
        quantity: true,
        lineTotalMinor: true,
        lineVatTotalMinor: true,
        lineGrossTotalMinor: true,
      },
    });
    const mappa = new Map<string, ReturnedLineAmounts>();
    for (const r of righe) {
      if (!r.returnedFromLineId) continue;
      const previous = mappa.get(r.returnedFromLineId) ?? NO_RETURNED_AMOUNTS;
      mappa.set(r.returnedFromLineId, {
        quantity: previous.quantity + r.quantity,
        lineTotalMinor: previous.lineTotalMinor + r.lineTotalMinor,
        lineVatTotalMinor: previous.lineVatTotalMinor + r.lineVatTotalMinor,
        lineGrossTotalMinor: previous.lineGrossTotalMinor + r.lineGrossTotalMinor,
      });
    }
    return mappa;
  }

  /**
   * Il rimborso: **quota per quota**, non Tipo per Tipo.
   *
   * ⭐ **L'identità di un incasso è la QUOTA**, non il Tipo con cui è stato
   * preso. Contare per `paymentOptionId` lasciava scoperti tre casi, e il
   * secondo è il più grave:
   *
   * 1. **Tipo eliminato** (C4A lo permette, con `SET NULL`): quella quota
   *    spariva dalla mappa e il denaro non era più rimborsabile.
   * 2. E un rimborso **già fatto** su quella quota non entrava nel
   *    cumulativo: lo stesso incasso si poteva restituire due volte.
   * 3. Due quote **della stessa classe** — due carte diverse — si
   *    confondevano in una sola.
   *
   * ⚠️ Gli snapshot si copiano dalla quota originale, e `paymentOptionId`
   * solo se il Tipo esiste ancora: eliminarlo non deve impedire di rendere.
   */
  private async risolviRimborsi(
    tx: Prisma.TransactionClient,
    tenantId: string,
    refunds: readonly ReturnRefundInput[],
    totaleMinor: number,
    quoteOriginali: readonly {
      id: string;
      paymentOptionId: string | null;
      optionNameSnapshot: string | null;
      tenderKindSnapshot: PaymentTenderKind | null;
      amountMinor: number;
    }[],
  ): Promise<RimborsoRisolto[]> {
    if (refunds.length === 0) {
      throw new UnprocessableEntityException('Manca la composizione del rimborso.');
    }

    // ⭐ Nessuna quota viene saltata: una quota il cui Tipo è stato
    //    eliminato resta rimborsabile dai propri snapshot.
    const perQuota = new Map(quoteOriginali.map((q) => [q.id, q]));

    // Quanto è già stato reso di CIASCUNA quota, sui resi precedenti.
    //
    // ⛔ Il legame è `refundedFromPaymentId`, non il documento di origine:
    //    è quello che rende il conto esatto anche quando due quote hanno lo
    //    stesso Tipo, o non ne hanno più nessuno.
    const giaReso = await this.rimborsiGiaEseguiti(tx, tenantId, [...perQuota.keys()]);

    const visti = new Set<string>();
    const risolti: RimborsoRisolto[] = [];
    for (const rimborso of refunds) {
      if (visti.has(rimborso.originalPaymentId)) {
        // ⛔ La stessa quota due volte nello stesso reso: il vincolo unico
        //    del database la rifiuterebbe comunque, ma con un errore che
        //    all'operatore non direbbe niente.
        throw new UnprocessableEntityException(
          'La stessa quota dell’incasso compare due volte nel rimborso.',
        );
      }
      visti.add(rimborso.originalPaymentId);

      const origine = perQuota.get(rimborso.originalPaymentId);
      if (!origine) {
        // ⛔ Nessuna modalità NUOVA: si restituisce come si è incassato, e un
        //    buono al posto del contante è una decisione che non è stata presa.
        throw new UnprocessableEntityException(
          'Si può rimborsare solo sulle quote incassate con la vendita originale.',
        );
      }
      if (!origine.tenderKindSnapshot) {
        // ⚠️ Una quota storica senza classificazione (C2B): non si sa come
        //    restituirla, e indovinarlo sarebbe peggio che fermarsi.
        throw new UnprocessableEntityException(
          'Questa quota dell’incasso non è classificata: non si può rimborsare dalla Cassa.',
        );
      }
      if (!Number.isInteger(rimborso.amountMinor) || rimborso.amountMinor <= 0) {
        throw new UnprocessableEntityException('Ogni rimborso deve essere maggiore di zero.');
      }

      const gia = giaReso.get(origine.id) ?? 0;
      if (gia + rimborso.amountMinor > origine.amountMinor) {
        const residuo = origine.amountMinor - gia;
        const nome = origine.optionNameSnapshot ?? 'questa quota';
        throw new UnprocessableEntityException(
          residuo <= 0
            ? `Su «${nome}» è già stato rimborsato tutto.`
            : `Su «${nome}» si possono rimborsare ancora ${(residuo / 100).toFixed(2)} €.`,
        );
      }
      if (origine.tenderKindSnapshot === 'electronic' && rimborso.confirmed !== true) {
        throw new UnprocessableEntityException(
          `Conferma il rimborso «${origine.optionNameSnapshot ?? ''}» sul terminale prima di concludere.`,
        );
      }

      risolti.push({
        originalPaymentId: origine.id,
        optionId: origine.paymentOptionId,
        nome: origine.optionNameSnapshot ?? '',
        classe: origine.tenderKindSnapshot,
        amountMinor: rimborso.amountMinor,
      });
    }

    const somma = risolti.reduce((tot, q) => tot + q.amountMinor, 0);
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
    user: UserProfileDto,
    input: ReturnInput,
    fingerprint: string,
  ): Promise<ReturnResult | null> {
    const esito = await this.intents.resolveConflict({
      error,
      tenantId,
      intentId: input.creationIntentId,
      fingerprint,
      authorizeResult: (documentId) =>
        this.prisma.$transaction((tx) =>
          assertCashReplayContext(
            tx,
            tenantId,
            user,
            input.locationId,
            documentId,
            DocumentType.store_return,
          ),
        ),
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
  /** La QUOTA dell'incasso originale che si sta restituendo. */
  readonly originalPaymentId: string;
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
    /** ⭐ La quota su cui si aggancia il rimborso. */
    readonly paymentId: string;
    readonly paymentOptionId: string | null;
    readonly optionName: string | null;
    readonly tenderKind: PaymentTenderKind | null;
    readonly amountMinor: number;
    readonly refundedMinor: number;
    readonly remainingMinor: number;
  }[];
}

export interface ReturnPreviewInput {
  readonly locationId: string;
  readonly originalDocumentId: string;
  readonly lines: readonly ReturnLineInput[];
}

export interface ReturnPreviewResult {
  readonly totalMinor: number;
  readonly netMinor: number;
  readonly vatMinor: number;
  readonly lines: readonly {
    readonly originalLineId: string;
    readonly quantity: number;
    readonly netMinor: number;
    readonly vatMinor: number;
    readonly grossMinor: number;
  }[];
  readonly payments: readonly {
    readonly originalPaymentId: string;
    readonly remainingMinor: number;
  }[];
}

interface RimborsoRisolto {
  readonly originalPaymentId: string;
  /** ⚠️ `null` se il Tipo pagamento è stato eliminato: bastano gli snapshot. */
  readonly optionId: string | null;
  readonly nome: string;
  readonly classe: PaymentTenderKind;
  readonly amountMinor: number;
}

function impronta(input: ReturnInput): string {
  return CreationIntentService.fingerprintOf({
    operation: 'cash_return',
    locationId: input.locationId,
    sessionId: input.sessionId,
    originalDocumentId: input.originalDocumentId,
    reason: input.reason.replace(/\s+/g, ' ').trim(),
    lines: input.lines,
    refunds: input.refunds.map((refund) => ({ ...refund, confirmed: refund.confirmed ?? false })),
  });
}
