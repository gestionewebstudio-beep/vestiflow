import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CashSession, CashSessionDeviceChange, CashSessionMovement } from '@prisma/client';

import type { UserProfileDto } from '../auth/dto/user-profile.dto';
import { PrismaService } from '../prisma/prisma.service';

import { assertCashContext, type CashContextUser } from './cash-context.validator';

/**
 * Sessione di cassa: apertura, lettura, cassetto, dispositivo (tranche C3).
 *
 * ⛔ **Non c'è la chiusura**, e non è una dimenticanza: gli importi attesi si
 * calcolano dalle quote, che sono di C4 — una chiusura che non li sa calcolare
 * scriverebbe `NULL` dove servono numeri (`docs/25` §9, decisione del
 * proprietario del 04/09/2026).
 *
 * ⛔ **Nessun checkout, nessun documento, nessuna fiscalizzazione.**
 *
 * ⭐ **Ogni metodo passa dal validatore**, dentro la propria transazione: i
 * controlli non si ripetono qui, e non si saltano.
 */
@Injectable()
export class CashSessionsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Apre la sessione della sede.
   *
   * ⭐ **La garanzia finale è l'indice parziale** `UNIQUE(location_id) WHERE
   * status='open'`: il controllo applicativo qui sotto serve al MESSAGGIO, non
   * alla correttezza. Due richieste davvero simultanee lo superano entrambe, e
   * a fermarne una è il database.
   */
  async open(
    tenantId: string,
    user: UserProfileDto,
    input: {
      locationId: string;
      openingFloatMinor: number;
      fiscalDeviceId?: string | null;
      notes?: string | null;
    },
  ): Promise<CashSession> {
    if (!Number.isInteger(input.openingFloatMinor) || input.openingFloatMinor < 0) {
      throw new UnprocessableEntityException('Il fondo iniziale non può essere negativo.');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        await assertCashContext(tx, tenantId, user as CashContextUser, {
          locationId: input.locationId,
          deviceId: input.fiscalDeviceId ?? null,
          // ⭐ Il dispositivo scelto all'apertura È quello operativo: pretende
          //    un adapter registrato.
          comeOperativo: true,
        });

        const aperta = await tx.cashSession.findFirst({
          where: { tenantId, locationId: input.locationId, status: 'open' },
          select: { id: true, openedByName: true },
        });
        if (aperta) {
          throw new ConflictException(
            `C'è già una cassa aperta su questa sede, aperta da ${aperta.openedByName}: chiudila prima.`,
          );
        }

        const sessione = await tx.cashSession.create({
          data: {
            tenantId,
            locationId: input.locationId,
            fiscalDeviceId: input.fiscalDeviceId ?? null,
            openingFloatMinor: input.openingFloatMinor,
            notes: normalizzaCausale(input.notes ?? null, 500),
            // ⛔ Operatore dal contesto autenticato, mai dal payload.
            openedById: user.id,
            openedByName: user.displayName,
          },
        });

        // ⭐ Il primo assegnamento è un cambio come gli altri: `previous` NULL.
        //    Senza questa riga lo storico comincerebbe dal secondo dispositivo.
        if (input.fiscalDeviceId) {
          await tx.cashSessionDeviceChange.create({
            data: {
              tenantId,
              locationId: input.locationId,
              sessionId: sessione.id,
              previousDeviceId: null,
              newDeviceId: input.fiscalDeviceId,
              reason: 'Dispositivo scelto all’apertura della sessione.',
              changedById: user.id,
              changedByName: user.displayName,
            },
          });
        }

        return sessione;
      });
    } catch (error) {
      // ⭐ L'indice parziale ha fermato la seconda richiesta simultanea. Il
      //    messaggio è lo stesso del controllo applicativo: per chi preme il
      //    pulsante le due situazioni sono la stessa cosa.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(
          'C’è già una cassa aperta su questa sede: chiudila prima di aprirne un’altra.',
        );
      }
      throw error;
    }
  }

  /**
   * La sessione aperta della sede, con i totali del cassetto.
   *
   * ⚠️ **Nessun valore di chiusura**: non esistono ancora, e inventarli sarebbe
   * peggio che non mostrarli.
   */
  async current(
    tenantId: string,
    user: UserProfileDto,
    locationId: string,
  ): Promise<{
    session: CashSession | null;
    depositsMinor: number;
    withdrawalsMinor: number;
  }> {
    return this.prisma.$transaction(async (tx) => {
      await assertCashContext(tx, tenantId, user as CashContextUser, { locationId });

      const session = await tx.cashSession.findFirst({
        where: { tenantId, locationId, status: 'open' },
        include: { device: true },
      });
      if (!session) {
        return { session: null, depositsMinor: 0, withdrawalsMinor: 0 };
      }

      const totali = await tx.cashSessionMovement.groupBy({
        by: ['type'],
        where: { tenantId, sessionId: session.id },
        _sum: { amountMinor: true },
      });
      const sommaDi = (tipo: 'deposit' | 'withdrawal'): number =>
        totali.find((t) => t.type === tipo)?._sum.amountMinor ?? 0;

      return {
        session,
        depositsMinor: sommaDi('deposit'),
        withdrawalsMinor: sommaDi('withdrawal'),
      };
    });
  }

  /** I movimenti di cassetto della sessione, dal più recente. */
  async listMovements(
    tenantId: string,
    user: UserProfileDto,
    locationId: string,
    sessionId: string,
  ): Promise<CashSessionMovement[]> {
    return this.prisma.$transaction(async (tx) => {
      // ⚠️ Qui la sessione NON deve essere per forza aperta: si consultano
      //    anche i movimenti di una sessione chiusa. Il validatore pretende
      //    l'apertura, quindi si verifica l'appartenenza a mano — ed è l'unico
      //    punto in cui accade, dichiarato invece che nascosto.
      await assertCashContext(tx, tenantId, user as CashContextUser, { locationId });
      const sessione = await tx.cashSession.findFirst({
        where: { id: sessionId, tenantId, locationId },
        select: { id: true },
      });
      if (!sessione) {
        throw new NotFoundException('Sessione di cassa non trovata.');
      }

      return tx.cashSessionMovement.findMany({
        where: { tenantId, sessionId },
        orderBy: { createdAt: 'desc' },
      });
    });
  }

  /**
   * Versamento o prelievo dal cassetto.
   *
   * ⛔ **Append-only**: non esiste modifica né cancellazione. Una correzione è
   * un movimento OPPOSTO che cita il precedente nella causale.
   *
   * ⭐ **Un prelievo NON è bloccato dal saldo teorico**, ed è una decisione
   * dichiarata: il contante nel cassetto può divergere dal calcolo — è proprio
   * ciò che la quadratura serve a far emergere — e rifiutare un prelievo reale
   * perché i conti non tornano impedirebbe di registrare quello che è successo.
   */
  async addMovement(
    tenantId: string,
    user: UserProfileDto,
    locationId: string,
    sessionId: string,
    input: { type: 'deposit' | 'withdrawal'; amountMinor: number; reason: string },
  ): Promise<CashSessionMovement> {
    if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) {
      throw new UnprocessableEntityException(
        'L’importo del movimento deve essere maggiore di zero.',
      );
    }
    const reason = normalizzaCausale(input.reason, 200);
    if (!reason) {
      throw new UnprocessableEntityException('La causale del movimento è obbligatoria.');
    }

    return this.prisma.$transaction(async (tx) => {
      const ctx = await assertCashContext(tx, tenantId, user as CashContextUser, {
        locationId,
        sessionId,
      });

      return tx.cashSessionMovement.create({
        data: {
          tenantId,
          sessionId: ctx.session!.id,
          type: input.type,
          amountMinor: input.amountMinor,
          reason,
          createdById: user.id,
          createdByName: user.displayName,
        },
      });
    });
  }

  /**
   * Cambia il dispositivo operativo della sessione, o lo toglie.
   *
   * ⛔ **Il PRECEDENTE lo determina il server**, leggendolo dentro la
   * transazione: un precedente inviato dal client sarebbe una versione del
   * mondo vecchia di un round-trip, e due cambi simultanei scriverebbero due
   * righe fondate sullo stesso stato.
   *
   * ⭐ **La concorrenza è chiusa da un aggiornamento CONDIZIONALE**: la
   * `updateMany` filtra anche sul dispositivo corrente, quindi il secondo
   * arrivato aggiorna zero righe e riceve conflitto. Nessun lock esplicito,
   * nessuna assunzione sul livello di isolamento.
   */
  async changeDevice(
    tenantId: string,
    user: UserProfileDto,
    locationId: string,
    sessionId: string,
    input: { fiscalDeviceId: string | null; reason: string },
  ): Promise<{ session: CashSession; change: CashSessionDeviceChange }> {
    const reason = normalizzaCausale(input.reason, 200);
    if (!reason) {
      throw new UnprocessableEntityException('La causale del cambio dispositivo è obbligatoria.');
    }

    return this.prisma.$transaction(async (tx) => {
      const ctx = await assertCashContext(tx, tenantId, user as CashContextUser, {
        locationId,
        sessionId,
        deviceId: input.fiscalDeviceId,
        comeOperativo: true,
      });
      const sessione = ctx.session!;
      const precedente = sessione.fiscalDeviceId;

      if (precedente === input.fiscalDeviceId) {
        // ⚠️ Il database lo rifiuterebbe comunque (`IS DISTINCT FROM`): qui si
        //    dà un messaggio invece di un errore di vincolo.
        throw new UnprocessableEntityException(
          'Il dispositivo indicato è già quello operativo della sessione.',
        );
      }

      const aggiornate = await tx.cashSession.updateMany({
        where: {
          id: sessione.id,
          tenantId,
          status: 'open',
          // ⚠️ **Non è più questa riga a chiudere la corsa**: da quando il
          //    validatore blocca la sessione (`docs/25` §13-sexies) due cambi
          //    simultanei si serializzano, e il secondo legge un «precedente»
          //    già aggiornato — quindi passa, e si applica sopra il primo.
          //
          // ⭐ Resta come RETE: regge se un percorso futuro scrivesse questa
          //    riga senza passare dal validatore.
          fiscalDeviceId: precedente,
        },
        data: { fiscalDeviceId: input.fiscalDeviceId },
      });
      if (aggiornate.count === 0) {
        throw new ConflictException(
          'Il dispositivo della sessione è cambiato nel frattempo: ricarica e riprova.',
        );
      }

      const change = await tx.cashSessionDeviceChange.create({
        data: {
          tenantId,
          locationId,
          sessionId: sessione.id,
          previousDeviceId: precedente,
          newDeviceId: input.fiscalDeviceId,
          reason,
          changedById: user.id,
          changedByName: user.displayName,
        },
      });

      const aggiornata = await tx.cashSession.findUniqueOrThrow({ where: { id: sessione.id } });
      return { session: aggiornata, change };
    });
  }

  /** Lo storico dei cambi dispositivo, in ordine cronologico. */
  async listDeviceChanges(
    tenantId: string,
    user: UserProfileDto,
    locationId: string,
    sessionId: string,
  ): Promise<CashSessionDeviceChange[]> {
    return this.prisma.$transaction(async (tx) => {
      await assertCashContext(tx, tenantId, user as CashContextUser, { locationId });
      const sessione = await tx.cashSession.findFirst({
        where: { id: sessionId, tenantId, locationId },
        select: { id: true },
      });
      if (!sessione) {
        throw new NotFoundException('Sessione di cassa non trovata.');
      }

      return tx.cashSessionDeviceChange.findMany({
        where: { tenantId, sessionId },
        orderBy: { createdAt: 'asc' },
      });
    });
  }
}

/**
 * Causale normalizzata: spazi collassati, estremi tolti, lunghezza limitata.
 *
 * ⚠️ Il limite è ESPLICITO e non ereditato dalla colonna: `TEXT` non ne ha uno,
 * e senza questo una causale di un megabyte entrerebbe.
 */
function normalizzaCausale(valore: string | null, max: number): string | null {
  if (valore === null || valore === undefined) {
    return null;
  }
  const pulita = valore.replace(/\s+/g, ' ').trim();
  return pulita ? pulita.slice(0, max) : null;
}
