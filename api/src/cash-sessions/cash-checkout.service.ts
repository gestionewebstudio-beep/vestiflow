import {
  ConflictException,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DocumentType, MovementOrigin, Prisma } from '@prisma/client';
import type { PaymentTenderKind } from '@prisma/client';

import type { UserProfileDto } from '../auth/dto/user-profile.dto';
import { ChannelSyncFacade } from '../channels/channel-sync.facade';
import { CreationIntentService } from '../common/idempotency/creation-intent.util';
import { variantLabel } from '../common/variant-label.util';
import { syncUnloadLineMovements } from '../documents/document-stock-unload-sync.util';
import { lockDocumentCounter, resolveDocumentNumber } from '../documents/document-numbering.util';
import { DocumentSettingsService } from '../documents/document-settings.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  resolveRetailLineVatCode,
  resolveRetailVariants,
  resolveRetailVatContext,
  retailLineDescription,
} from '../retail/retail-line.util';
import { computeVatLineAmounts } from '../vat/vat-line-calculation.util';

import { assertCashContext, type CashContextUser } from './cash-context.validator';

/**
 * Il checkout della Cassa (tranche C4A).
 *
 * ⛔ **Non richiama `StoreSalesService.createSale`**, e non è una scelta di
 * stile: quel caso d'uso trascina la modifica documentale e il pagamento
 * legacy `cash | card | other`. Riusa invece le **primitive** — le stesse, non
 * copie: `resolveRetailVariants`, l'IVA di riga, `resolveDocumentNumber`,
 * `syncUnloadLineMovements`, `CreationIntentService`.
 *
 * ⭐ **Il backend è autoritativo**: prezzi, sconti, IVA e totale si
 * **ricalcolano** qui. Il client manda variante, quantità ed eventuale sconto;
 * il totale che propone non entra da nessuna parte.
 *
 * ⛔ **Una vendita Cassa completata è IMMUTABILE**: nasce `confirmed` con una
 * sessione, e non esiste un percorso che la riapra. La modifica documentale
 * della Vendita al banco non la raggiunge, perché passa da un altro servizio e
 * da un'altra rotta.
 */
@Injectable()
export class CashCheckoutService {
  private readonly logger = new Logger(CashCheckoutService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: DocumentSettingsService,
    private readonly intents: CreationIntentService,
    private readonly channelSync: ChannelSyncFacade,
  ) {}

  async checkout(
    tenantId: string,
    user: UserProfileDto,
    input: CheckoutInput,
  ): Promise<CheckoutResult> {
    if (!input.creationIntentId) {
      // ⛔ Seconda rete dopo il DTO: un chiamante interno che aggirasse la
      //    validazione creerebbe una vendita non deduplicabile.
      throw new UnprocessableEntityException(
        'Identità dell’operazione mancante: ricarica la pagina e ripeti.',
      );
    }
    if (input.lines.length === 0) {
      throw new UnprocessableEntityException('Il carrello è vuoto.');
    }
    if (input.payments.length === 0) {
      throw new UnprocessableEntityException('Manca la composizione dell’incasso.');
    }

    const fingerprint = impronta(input);

    let creato;
    try {
      creato = await this.prisma.$transaction(async (tx) => {
        // ── 1. L'IDENTITÀ D'INTENTO, PRIMA DI TUTTO ─────────────────────────
        // ⛔ L'ordine è il meccanismo: una seconda richiesta con lo stesso
        //    intento si ferma sul vincolo unico PRIMA di toccare numerazione,
        //    righe, quote e movimenti. Messa dopo, gli effetti sarebbero già
        //    stati applicati.
        await this.intents.claimTx(tx, {
          tenantId,
          intentId: input.creationIntentId,
          scope: DocumentType.store_sale,
          fingerprint,
        });

        // ── 2. Tenant, sede, sessione APERTA, dispositivo ───────────────────
        const ctx = await assertCashContext(tx, tenantId, user as CashContextUser, {
          locationId: input.locationId,
          sessionId: input.sessionId,
        });
        const sessione = ctx.session!;

        // ── 3. Le varianti, e l'IVA ─────────────────────────────────────────
        const variants = await resolveRetailVariants(
          tx,
          tenantId,
          input.lines.map((l) => l.variantId),
        );
        const vatContext = await resolveRetailVatContext(tx, tenantId, input.lines, variants);

        // ── 4. IL RICALCOLO, che è di questo lato ───────────────────────────
        const righe = input.lines.map((line, index) => {
          const variant = variants.get(line.variantId)!;
          const vat = resolveRetailLineVatCode(line.vatCodeId, variant, vatContext);
          // ⚠️ Il calcolo vuole un numero; la COLONNA vuole un Decimal. Due
          //    confini diversi dello stesso valore, e vanno tenuti distinti.
          const discountPercent = line.discountPercent ?? 0;
          const amounts = computeVatLineAmounts({
            enteredUnitCostMinor: line.unitPriceMinor,
            // Il valore memorizzato è netto: nessuno scorporo da fare.
            costEntryMode: 'vat_excluded',
            quantity: line.quantity,
            discountPercent,
            vat: vat.vat,
          });
          return { line, index, variant, vat, discountPercent, amounts };
        });

        const totaleMinor = righe.reduce((s, r) => s + r.amounts.lineGrossMinor, 0);
        const imponibileMinor = righe.reduce((s, r) => s + r.amounts.lineNetMinor, 0);
        const ivaMinor = righe.reduce((s, r) => s + r.amounts.lineVatMinor, 0);

        // ── 5. I Tipi pagamento, e la composizione dell'incasso ─────────────
        const quote = await this.risolviQuote(tx, tenantId, input.payments, totaleMinor);

        // ── 6. Numerazione e documento ──────────────────────────────────────
        const setting = await this.settings.getResolved(tenantId, DocumentType.store_sale);
        // ⚠️ `defaultSeries` e` una stringa, non nullable: la serie vuota si
        //    rappresenta con la stringa vuota, non con `null`.
        const series = setting.defaultSeries;
        await lockDocumentCounter(tx, { tenantId, type: DocumentType.store_sale, series });
        const documentDate = new Date();
        const assigned = await resolveDocumentNumber({
          tx,
          tenantId,
          type: DocumentType.store_sale,
          series,
          source: 'document',
          prefix: setting.numberPrefix,
          documentDate,
        });

        const documento = await tx.document.create({
          data: {
            tenantId,
            type: DocumentType.store_sale,
            // ⛔ Nasce CONFERMATA: una vendita di cassa non ha una bozza, e non
            //    esiste un percorso che la riapra.
            status: 'confirmed',
            series,
            number: assigned.number,
            reference: assigned.reference,
            year: documentDate.getFullYear(),
            documentDate,
            locationId: input.locationId,
            // ⭐ È QUESTO a distinguere una vendita Cassa da una Vendita al banco
            //    (`docs/25` §4): non la rotta, non un flag.
            cashSessionId: sessione.id,
            createdById: user.id,
            createdByName: user.displayName,
            subtotalMinor: imponibileMinor,
            taxMinor: ivaMinor,
            totalMinor: totaleMinor,
            // ⛔ `paymentMethod` NON si scrive: è il campo legacy della Vendita al
            //    banco, e «misto» si calcola dalle quote (`docs/25` §6).
          },
        });

        // ── 7. Le righe ─────────────────────────────────────────────────────
        await tx.documentLine.createMany({
          data: righe.map((r) => ({
            tenantId,
            documentId: documento.id,
            lineNumber: r.index + 1,
            variantId: r.variant.id,
            sku: r.variant.sku,
            description: r.line.description ?? retailLineDescription(r.variant),
            variantLabel: variantLabel(r.variant.optionSummary as never) || r.variant.optionSummary,
            quantity: r.line.quantity,
            unitPriceMinor: new Prisma.Decimal(r.line.unitPriceMinor),
            discountPercent: new Prisma.Decimal(r.discountPercent),
            vatCodeId: r.vat.vatCodeId,
            vatSnapshot: r.vat.vatSnapshot ?? Prisma.JsonNull,
            // ⚠️ I nomi delle colonne, non quelli del calcolo: `lineTotalMinor`
            //    e' l'imponibile, e l'aliquota vive dentro `vatSnapshot`.
            lineTotalMinor: r.amounts.lineNetMinor,
            lineVatTotalMinor: r.amounts.lineVatMinor,
            lineGrossTotalMinor: r.amounts.lineGrossMinor,
            supplierPayableLineMinor: r.amounts.supplierPayableMinor,
            unitCostNet: new Prisma.Decimal(r.amounts.unitNetMinor),
            unitCostGross: new Prisma.Decimal(r.amounts.unitGrossMinor),
            unitVatAmount: new Prisma.Decimal(r.amounts.unitVatMinor),
          })),
        });
        const righeCreate = await tx.documentLine.findMany({
          where: { documentId: documento.id },
          orderBy: { lineNumber: 'asc' },
        });

        // ── 8. Le quote, con la loro FOTOGRAFIA ─────────────────────────────
        await tx.storeSalePayment.createMany({
          data: quote.map((q, i) => ({
            tenantId,
            documentId: documento.id,
            position: i + 1,
            // ⛔ `method` resta NULL: è il vocabolario legacy, e la Cassa non lo
            //    scrive mai.
            method: null,
            paymentOptionId: q.optionId,
            optionNameSnapshot: q.nome,
            tenderKindSnapshot: q.classe,
            amountMinor: q.amountMinor,
            // ⭐ Solo per il contante: su una quota elettronica non significa
            //    niente, e il resto è `tendered − amount`, non si memorizza.
            tenderedMinor: q.classe === 'cash' ? (q.tenderedMinor ?? null) : null,
          })),
        });

        // ── 9. I movimenti, DENTRO la transazione ───────────────────────────
        const movimenti = await syncUnloadLineMovements(tx, {
          tenantId,
          documentId: documento.id,
          documentType: DocumentType.store_sale,
          locationId: input.locationId,
          reason: `Vendita Cassa ${assigned.reference}`,
          movementDate: documentDate,
          origin: MovementOrigin.vestiflow_pos,
          // ⚠️ Le righe COMPLETE come le ha appena scritte il database: la
          //    primitiva legge piu` campi di quanti se ne passerebbero a mano,
          //    e ricostruirne un sottoinsieme sarebbe una copia che diverge.
          lines: righeCreate,
          actor: { createdById: user.id, createdByName: user.displayName },
        });

        // ── 10. L'esito, per il retry ───────────────────────────────────────
        await this.intents.recordResultTx(tx, {
          tenantId,
          intentId: input.creationIntentId!,
          resultRef: documento.id,
        });

        return {
          documentId: documento.id,
          reference: assigned.reference,
          totaleMinor,
          restoMinor: quote.reduce(
            (s, q) =>
              s + (q.classe === 'cash' ? Math.max(0, (q.tenderedMinor ?? 0) - q.amountMinor) : 0),
            0,
          ),
          variantIds: righeCreate.map((l) => l.variantId).filter((v): v is string => v !== null),
          syncTargets: movimenti.syncTargets,
        };
      });
    } catch (error) {
      // ⭐ Il conflitto sull_intento NON è un errore da propagare: e` la
      //    seconda faccia dell_idempotenza. Tre esiti, e vanno distinti —
      //
      //      stesso intento, stessa impronta   → si RESTITUISCE la vendita
      //      stesso intento, impronta diversa  → 409, e nomina il documento
      //      la riga e` sparita (rollback)     → 409: l_intento e` di nuovo libero
      //
      //    ⛔ Rispondere sempre con un errore chiuderebbe l_intento lato
      //       client, e il clic successivo diventerebbe una SECONDA vendita.
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

    // ⭐ FUORI dalla transazione, e deliberatamente: è una chiamata di rete a
    //    un servizio esterno, e dentro terrebbe aperta la transazione per
    //    secondi. Non esegue movimenti — quelli sono al passo 9.
    this.pushInventoryAsync(tenantId, creato.variantIds, input.locationId);

    return {
      documentId: creato.documentId,
      reference: creato.reference,
      totaleMinor: creato.totaleMinor,
      restoMinor: creato.restoMinor,
    };
  }

  /**
   * Il reinvio di una vendita gia` conclusa.
   *
   * ⭐ Restituisce il documento gia` creato quando intento e impronta
   * coincidono. Se l_impronta differisce, `resolveConflict` lancia un 409 che
   * NOMINA il documento gia` prodotto: senza, il client non distinguerebbe
   * quel conflitto da uno in cui non e` stato creato niente.
   */
  private async replayIfAlreadyDone(
    error: unknown,
    tenantId: string,
    intentId: string,
    fingerprint: string,
  ): Promise<CheckoutResult | null> {
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
      select: { id: true, reference: true, totalMinor: true, storeSalePayments: true },
    });
    if (!doc) {
      // Il registro nomina un documento che non esiste piu`. Non e` un replay
      // riproducibile, e dirlo e` meglio che restituire una risposta vuota
      // travestita da successo.
      throw new ConflictException({
        code: 'creation_intent_result_missing',
        message: 'La vendita risulta gia` registrata, ma il documento non e` piu` disponibile.',
      });
    }
    return {
      documentId: doc.id,
      reference: doc.reference ?? '',
      totaleMinor: doc.totalMinor,
      // ⚠️ Il resto si RICALCOLA dalle quote salvate: non e` una colonna, e
      //    ricordarlo altrove sarebbe un terzo valore che puo` divergere.
      restoMinor: doc.storeSalePayments.reduce(
        (s, q) => s + Math.max(0, (q.tenderedMinor ?? 0) - q.amountMinor),
        0,
      ),
    };
  }

  /**
   * Valida i Tipi pagamento e la composizione dell'incasso.
   *
   * ⛔ Ogni rifiuto qui è un `422` con un messaggio di dominio: un checkout che
   * fallisce deve dire *quale* quota non va, o l'operatore non sa cosa
   * correggere col cliente davanti.
   */
  private async risolviQuote(
    tx: Prisma.TransactionClient,
    tenantId: string,
    payments: readonly CheckoutPaymentInput[],
    totaleMinor: number,
  ): Promise<QuotaRisolta[]> {
    // ⛔ La stessa opzione non si ripete: due quote sullo stesso Tipo sono una
    //    quota sola, e tenerle separate rende ambiguo il rimborso.
    const visti = new Set<string>();
    for (const p of payments) {
      if (visti.has(p.paymentOptionId)) {
        throw new UnprocessableEntityException(
          'Lo stesso tipo di pagamento compare due volte: unisci le due quote.',
        );
      }
      visti.add(p.paymentOptionId);
    }

    const opzioni = await tx.paymentOption.findMany({
      where: { tenantId, id: { in: [...visti] } },
    });
    const perId = new Map(opzioni.map((o) => [o.id, o]));

    const quote: QuotaRisolta[] = [];
    for (const p of payments) {
      const opzione = perId.get(p.paymentOptionId);
      if (!opzione) {
        // ⚠️ «di un altro tenant» e «inesistente» rispondono uguale.
        throw new UnprocessableEntityException('Tipo di pagamento non disponibile.');
      }
      if (!opzione.isActive) {
        throw new UnprocessableEntityException(
          `«${opzione.name}» è disattivato e non si può usare in cassa.`,
        );
      }
      if (opzione.kind !== 'method') {
        throw new UnprocessableEntityException(
          'Le condizioni di pagamento non si incassano alla Cassa.',
        );
      }
      if (opzione.tenderKind === null) {
        throw new UnprocessableEntityException(
          `«${opzione.name}» non è classificato per la Cassa: impostalo in Impostazioni.`,
        );
      }
      if (opzione.tenderKind === 'voucher') {
        // ⚠️ Modellato in C2B, non abilitato: un buono porta un conteggio oltre
        //    all'importo e regole di resto proprie.
        throw new UnprocessableEntityException('I buoni non sono ancora utilizzabili in cassa.');
      }
      if (!Number.isInteger(p.amountMinor) || p.amountMinor <= 0) {
        throw new UnprocessableEntityException('Ogni quota deve essere maggiore di zero.');
      }
      if (
        opzione.tenderKind === 'cash' &&
        p.tenderedMinor !== undefined &&
        p.tenderedMinor !== null
      ) {
        if (!Number.isInteger(p.tenderedMinor) || p.tenderedMinor < p.amountMinor) {
          throw new UnprocessableEntityException(
            'Il contante ricevuto non può essere inferiore alla quota che paga.',
          );
        }
      }
      if (opzione.tenderKind === 'electronic' && p.confirmed !== true) {
        // ⛔ VestiFlow non parla col terminale di pagamento e non finge di
        //    averlo fatto: la conferma è dell'operatore.
        throw new UnprocessableEntityException(
          `Conferma l’esito del pagamento «${opzione.name}» sul terminale prima di concludere.`,
        );
      }
      quote.push({
        optionId: opzione.id,
        nome: opzione.name,
        classe: opzione.tenderKind,
        amountMinor: p.amountMinor,
        tenderedMinor: p.tenderedMinor ?? null,
      });
    }

    // ⛔ Somma ESATTA, senza tolleranza: sono interi in unità minori, e una
    //    tolleranza qui sarebbe denaro che non torna.
    const sommaQuote = quote.reduce((s, q) => s + q.amountMinor, 0);
    if (sommaQuote !== totaleMinor) {
      throw new UnprocessableEntityException(
        `L’incasso non copre il totale: ${(sommaQuote / 100).toFixed(2)} € contro ${(totaleMinor / 100).toFixed(2)} €.`,
      );
    }

    return quote;
  }

  /**
   * Push verso i canali esterni.
   *
   * ⚠️ NON esegue movimenti di magazzino — quelli li fa
   * `syncUnloadLineMovements` dentro la transazione. Qui si notifica Shopify e
   * TikTok, ed è una chiamata di rete: dentro la transazione la terrebbe aperta
   * per secondi. Un fallimento non deve far fallire una vendita già registrata.
   */
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
        this.logger.warn(`Push inventario post-checkout Cassa (${tenantId}): ${message}`);
      });
    }
  }
}

// ── Tipi ───────────────────────────────────────────────────────────────────

export interface CheckoutLineInput {
  readonly variantId: string;
  readonly quantity: number;
  /** Prezzo unitario NETTO in unità minori. */
  readonly unitPriceMinor: number;
  readonly discountPercent?: number;
  readonly vatCodeId?: string | null;
  readonly description?: string;
}

export interface CheckoutPaymentInput {
  readonly paymentOptionId: string;
  readonly amountMinor: number;
  /** Solo contanti: il denaro consegnato. Il resto è derivato. */
  readonly tenderedMinor?: number | null;
  /** Solo elettronico: l'operatore conferma l'esito letto sul terminale. */
  readonly confirmed?: boolean;
}

export interface CheckoutInput {
  readonly locationId: string;
  readonly sessionId: string;
  readonly creationIntentId: string;
  readonly lines: readonly CheckoutLineInput[];
  readonly payments: readonly CheckoutPaymentInput[];
}

export interface CheckoutResult {
  readonly documentId: string;
  readonly reference: string;
  readonly totaleMinor: number;
  readonly restoMinor: number;
}

interface QuotaRisolta {
  readonly optionId: string;
  readonly nome: string;
  readonly classe: PaymentTenderKind;
  readonly amountMinor: number;
  readonly tenderedMinor: number | null;
}

/**
 * L'impronta della richiesta, per l'idempotenza.
 *
 * ⭐ Stesso intento + stessa impronta = reinvio, e si restituisce il risultato
 * già prodotto. Stesso intento + impronta diversa = due comandi che rivendicano
 * la stessa identità, e si rifiuta senza creare niente.
 */
function impronta(input: CheckoutInput): string {
  return JSON.stringify({
    l: input.locationId,
    s: input.sessionId,
    r: input.lines.map((x) => [x.variantId, x.quantity, x.unitPriceMinor, x.discountPercent ?? 0]),
    p: input.payments.map((x) => [x.paymentOptionId, x.amountMinor, x.tenderedMinor ?? null]),
  });
}
