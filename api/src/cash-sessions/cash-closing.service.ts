import { ConflictException, Injectable, UnprocessableEntityException } from '@nestjs/common';
import { DocumentType, Prisma } from '@prisma/client';
import type { CashSession } from '@prisma/client';

import type { UserProfileDto } from '../auth/dto/user-profile.dto';
import { PrismaService } from '../prisma/prisma.service';

import { assertCashContext, type CashContextUser } from './cash-context.validator';

/**
 * La chiusura della sessione di cassa (tranche C4B, `docs/25` §9).
 *
 * ⭐ **La chiusura è CIECA**, e non è una scelta dell'interfaccia: gli attesi
 * **non esistono** finché la sessione è aperta — le colonne sono `NULL` e
 * nessuna rotta li calcola. Si materializzano dentro questa transazione,
 * **dopo** che l'operatore ha dichiarato quanto ha contato. Un conteggio fatto
 * sapendo il risultato non è un conteggio.
 *
 * ⛔ **La differenza di cassa NON è una colonna**: è `countedCash −
 * expectedCash`, entrambi congelati. Persisterla creerebbe un terzo valore
 * capace di contraddire i due da cui deriva — la stessa disciplina del
 * cumulativo dei resi, che si ricostruisce invece di contarsi.
 *
 * ⭐ **Gli attesi si CONGELANO**: dopo la chiusura la quadratura è un fatto
 * storico. Ricalcolarla domani darebbe un numero diverso appena un Tipo
 * pagamento viene riclassificato, e una sessione chiusa a marzo non deve
 * cambiare risposta a settembre.
 */
@Injectable()
export class CashClosingService {
  constructor(private readonly prisma: PrismaService) {}

  async close(
    tenantId: string,
    user: UserProfileDto,
    locationId: string,
    sessionId: string,
    input: CloseInput,
  ): Promise<CloseResult> {
    if (!Number.isInteger(input.countedCashMinor) || input.countedCashMinor < 0) {
      throw new UnprocessableEntityException('Il contante contato non può essere negativo.');
    }
    const dichiarato = input.declaredElectronicMinor ?? null;
    if (dichiarato !== null && (!Number.isInteger(dichiarato) || dichiarato < 0)) {
      // ⚠️ `null` è una chiusura legittima: significa «non riconciliato».
      throw new UnprocessableEntityException(
        'L’elettronico dichiarato non può essere negativo: lascialo vuoto se non lo riconcili.',
      );
    }
    const notes = (input.notes ?? '').replace(/\s+/g, ' ').trim() || null;

    return this.prisma.$transaction(async (tx) => {
      // ── 1. Il contesto, e la sessione APERTA ─────────────────────────────
      const ctx = await assertCashContext(tx, tenantId, user as CashContextUser, {
        locationId,
        sessionId,
      });
      const sessione = ctx.session!;

      // ── 2. Gli attesi, dalle QUOTE e dai MOVIMENTI ───────────────────────
      const attesi = await this.calcolaAttesi(tx, tenantId, sessione);

      // ── 3. La chiusura, CONDIZIONATA allo stato aperto ───────────────────
      //
      // ⛔ Due chiusure concorrenti passano entrambe dal validatore: fra la
      //    lettura e la scrittura c'è tutto il calcolo. A decidere è questo
      //    aggiornamento condizionale — la seconda tocca zero righe e lo
      //    dichiara, invece di sovrascrivere una quadratura già firmata.
      const chiusa = await tx.cashSession.updateMany({
        where: { id: sessione.id, tenantId, status: 'open' },
        data: {
          status: 'closed',
          closedAt: new Date(),
          closedById: user.id,
          closedByName: user.displayName,
          countedCashMinor: input.countedCashMinor,
          declaredElectronicMinor: dichiarato,
          expectedCashMinor: attesi.expectedCashMinor,
          expectedElectronicMinor: attesi.expectedElectronicMinor,
          // ⚠️ Le note si SOVRASCRIVONO solo se ne arrivano di nuove: chiudere
          //    senza scriverne non deve cancellare quelle dell'apertura.
          ...(notes ? { notes } : {}),
        },
      });
      if (chiusa.count === 0) {
        throw new ConflictException({
          code: 'cash_session_already_closed',
          message: 'La sessione è stata chiusa da un altro operatore.',
        });
      }

      const finale = await tx.cashSession.findUniqueOrThrow({ where: { id: sessione.id } });
      return {
        session: finale,
        ...attesi,
        countedCashMinor: input.countedCashMinor,
        declaredElectronicMinor: dichiarato,
        // ⭐ Derivate, non persistite.
        cashDifferenceMinor: input.countedCashMinor - attesi.expectedCashMinor,
        electronicDifferenceMinor:
          dichiarato === null ? null : dichiarato - attesi.expectedElectronicMinor,
      };
    });
  }

  /**
   * Gli attesi della sessione, dalle quote di incasso e dai movimenti.
   *
   * ⛔ **I documenti ANNULLATI non contribuiscono**, ed è l'errore che il ramo
   * storico faceva: la sua query non filtrava su `status`, e un `store_sale`
   * annullato entrava negli attesi.
   *
   * ⛔ **La classe la porta la QUOTA, non il Tipo corrente**: è lo snapshot di
   * `tenderKind`. Senza, riclassificare un Tipo domani cambierebbe la
   * quadratura di una sessione chiusa a marzo.
   */
  private async calcolaAttesi(
    tx: Prisma.TransactionClient,
    tenantId: string,
    sessione: CashSession,
  ): Promise<Attesi> {
    const quote = await tx.storeSalePayment.findMany({
      where: {
        tenantId,
        document: {
          cashSessionId: sessione.id,
          status: { not: 'cancelled' },
          type: { in: [DocumentType.store_sale, DocumentType.store_return] },
        },
      },
      select: {
        amountMinor: true,
        tenderKindSnapshot: true,
        optionNameSnapshot: true,
        document: { select: { type: true } },
      },
    });

    let venditeCash = 0;
    let resiCash = 0;
    let venditeElettroniche = 0;
    let resiElettronici = 0;

    for (const q of quote) {
      const vendita = q.document.type === DocumentType.store_sale;
      // ⛔ ESAUSTIVO sull'enum, senza ramo di ripiego: il `bucket()` del ramo
      //    storico mandava «ogni metodo sconosciuto» in `other`, e una classe
      //    nuova sarebbe sparita in silenzio dalla quadratura.
      switch (q.tenderKindSnapshot) {
        case 'cash':
          if (vendita) venditeCash += q.amountMinor;
          else resiCash += q.amountMinor;
          break;
        case 'electronic':
          if (vendita) venditeElettroniche += q.amountMinor;
          else resiElettronici += q.amountMinor;
          break;
        case 'voucher':
          // ⚠️ Modellati in C2B, non abilitati al checkout: se una quota così
          //    esiste, la sessione non si quadra — e lo si DICE, invece di
          //    farla sparire in un ramo di ripiego.
          throw new UnprocessableEntityException(
            `«${q.optionNameSnapshot ?? 'Buono'}»: i buoni non rientrano ancora nella quadratura di cassa.`,
          );
        case null:
          throw new UnprocessableEntityException(
            `«${q.optionNameSnapshot ?? 'Una quota'}» non è classificata: non si può quadrare la cassa.`,
          );
        default:
          // ⚠️ Irraggiungibile finché l'enum è quello di oggi. Esiste perché il
          //    giorno in cui una classe nuova arriva, questo `switch` deve
          //    FERMARSI, non stimare.
          throw new UnprocessableEntityException(
            'Questa sessione contiene una classe di incasso che la chiusura non conosce.',
          );
      }
    }

    const movimenti = await tx.cashSessionMovement.groupBy({
      by: ['type'],
      where: { tenantId, sessionId: sessione.id },
      _sum: { amountMinor: true },
    });
    const versamenti = movimenti.find((m) => m.type === 'deposit')?._sum.amountMinor ?? 0;
    const prelievi = movimenti.find((m) => m.type === 'withdrawal')?._sum.amountMinor ?? 0;

    return {
      openingFloatMinor: sessione.openingFloatMinor,
      salesCashMinor: venditeCash,
      returnsCashMinor: resiCash,
      salesElectronicMinor: venditeElettroniche,
      returnsElectronicMinor: resiElettronici,
      depositsMinor: versamenti,
      withdrawalsMinor: prelievi,
      expectedCashMinor:
        sessione.openingFloatMinor + venditeCash - resiCash + versamenti - prelievi,
      // ⭐ Né fondo né cassetto: il cassetto non c'entra con l'elettronico.
      expectedElectronicMinor: venditeElettroniche - resiElettronici,
    };
  }
}

// ── Tipi ───────────────────────────────────────────────────────────────────

export interface CloseInput {
  /** Il contante CONTATO aprendo il cassetto. */
  readonly countedCashMinor: number;
  /**
   * Il totale che l'operatore LEGGE sul terminale e dichiara.
   *
   * ⛔ Non è una risposta tecnica del POS. `null` significa «non riconciliato»,
   * ed è una chiusura legittima.
   */
  readonly declaredElectronicMinor?: number | null;
  readonly notes?: string;
}

export interface Attesi {
  readonly openingFloatMinor: number;
  readonly salesCashMinor: number;
  readonly returnsCashMinor: number;
  readonly salesElectronicMinor: number;
  readonly returnsElectronicMinor: number;
  readonly depositsMinor: number;
  readonly withdrawalsMinor: number;
  readonly expectedCashMinor: number;
  readonly expectedElectronicMinor: number;
}

export interface CloseResult extends Attesi {
  readonly session: CashSession;
  readonly countedCashMinor: number;
  readonly declaredElectronicMinor: number | null;
  /** ⭐ Derivata: `contato − atteso`. Non è una colonna. */
  readonly cashDifferenceMinor: number;
  /** ⚠️ `null` quando l'elettronico non è stato riconciliato. */
  readonly electronicDifferenceMinor: number | null;
}
