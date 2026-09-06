import { ConflictException, Injectable, UnprocessableEntityException } from '@nestjs/common';
import type { CashSession } from '@prisma/client';

import type { UserProfileDto } from '../auth/dto/user-profile.dto';
import { PrismaService } from '../prisma/prisma.service';

import { assertCashContext, type CashContextUser } from './cash-context.validator';
import { calcolaAttesiSessione, type AttesiSessione } from './cash-session-totals.util';

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
      const attesi = await calcolaAttesiSessione(tx, tenantId, sessione);

      // ── 3. La chiusura, CONDIZIONATA allo stato aperto ───────────────────
      //
      // ⭐ A decidere fra due chiusure concorrenti è il LOCK di sessione preso
      //    dal validatore (`docs/25` §13-sexies): la seconda aspetta, e quando
      //    tocca a lei trova la sessione già chiusa.
      //
      // ⚠️ Questo aggiornamento condizionale RESTA come rete: regge se un
      //    percorso futuro scrivesse questa riga senza passare dal validatore.
      //    Non è più il meccanismo principale, ed è il motivo per cui il
      //    rifiuto può arrivare da due punti diversi.
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

/**
 * ⭐ Gli addendi vengono dalla funzione CONDIVISA: la chiusura li congela, il
 * dettaglio di sessione li ricostruisce, e la formula sta in un posto solo.
 */
export type Attesi = AttesiSessione;
export interface CloseResult extends Attesi {
  readonly session: CashSession;
  readonly countedCashMinor: number;
  readonly declaredElectronicMinor: number | null;
  /** ⭐ Derivata: `contato − atteso`. Non è una colonna. */
  readonly cashDifferenceMinor: number;
  /** ⚠️ `null` quando l'elettronico non è stato riconciliato. */
  readonly electronicDifferenceMinor: number | null;
}
