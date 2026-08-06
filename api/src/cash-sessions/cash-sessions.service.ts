import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CashSessionStatus, DocumentType, Prisma } from '@prisma/client';

import type { UserProfileDto } from '../auth/dto/user-profile.dto';
import {
  INVENTORY_VIEW_SCOPE_MODE,
  resolveOperationalLocationScope,
} from '../inventory/licensed-location-scope.util';
import { assertUserCanAccessLocation } from '../inventory/user-location-scope.util';
import { PrismaService } from '../prisma/prisma.service';

import {
  computeCashSessionTotals,
  type CashSessionTotals,
  type SessionMovementRow,
  type SessionPaymentRow,
} from './cash-session-totals.util';
import type {
  CloseCashSessionDto,
  CreateCashMovementDto,
  ListCashSessionsQueryDto,
  OpenCashSessionDto,
} from './dto/cash-session.dto';

/** Sessione per la UI: anagrafica + totali correnti (o congelati se chiusa). */
export interface CashSessionSummary {
  readonly id: string;
  readonly locationId: string;
  readonly locationName: string;
  readonly status: CashSessionStatus;
  readonly openedAt: Date;
  readonly openedByName: string;
  readonly openingFloatMinor: number;
  readonly closedAt: Date | null;
  readonly closedByName: string | null;
  readonly notes: string | null;
  readonly countedCashMinor: number | null;
  readonly countedCardMinor: number | null;
  readonly countedOtherMinor: number | null;
  /** Chiusa: gli attesi CONGELATI alla chiusura. Aperta: il calcolo corrente. */
  readonly expectedCashMinor: number;
  readonly expectedCardMinor: number;
  readonly expectedOtherMinor: number;
  readonly totals: CashSessionTotals;
  readonly salesCount: number;
  readonly returnsCount: number;
  readonly movements: readonly {
    readonly id: string;
    readonly type: 'deposit' | 'withdrawal';
    readonly amountMinor: number;
    readonly reason: string;
    readonly createdAt: Date;
    readonly createdByName: string;
  }[];
}

type SessionRecord = Prisma.CashSessionGetPayload<{
  include: {
    location: { select: { name: true } };
    movements: { orderBy: { createdAt: 'asc' } };
  };
}>;

/**
 * Sessioni di cassa (Tranche 1.2): apertura con fondo, vendite/resi agganciati
 * alla conferma (vedi StoreSalesService), chiusura con conteggio per metodo e
 * attesi congelati. Al più una sessione aperta per sede: il lucchetto vero è
 * l'indice parziale `cash_sessions_open_per_location`.
 */
@Injectable()
export class CashSessionsService {
  constructor(private readonly prisma: PrismaService) {}

  async open(
    tenantId: string,
    dto: OpenCashSessionDto,
    user: UserProfileDto,
  ): Promise<CashSessionSummary> {
    assertUserCanAccessLocation(user, dto.locationId);
    const location = await this.prisma.location.findFirst({
      where: { id: dto.locationId, tenantId, isActive: true, licensedInVf: true },
      select: { id: true },
    });
    if (!location) {
      throw new NotFoundException('Sede non trovata o non operativa.');
    }

    try {
      const session = await this.prisma.cashSession.create({
        data: {
          tenantId,
          locationId: dto.locationId,
          openingFloatMinor: dto.openingFloatMinor,
          notes: dto.notes?.trim() || null,
          openedById: user.id,
          openedByName: user.displayName?.trim() || 'Utente',
        },
        include: {
          location: { select: { name: true } },
          movements: { orderBy: { createdAt: 'asc' } },
        },
      });
      return this.toSummary(session, [], []);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('C’è già una cassa aperta per questa sede: chiudila prima.');
      }
      throw error;
    }
  }

  /** Sessione aperta della sede, con i totali correnti; null se non c'è. */
  async current(
    tenantId: string,
    locationId: string,
    user: UserProfileDto,
  ): Promise<CashSessionSummary | null> {
    assertUserCanAccessLocation(user, locationId);
    const session = await this.prisma.cashSession.findFirst({
      where: { tenantId, locationId, status: CashSessionStatus.open },
      include: {
        location: { select: { name: true } },
        movements: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!session) {
      return null;
    }
    const { payments, counts } = await this.loadSessionPayments(tenantId, [session.id]);
    return this.toSummary(session, payments.get(session.id) ?? [], counts.get(session.id) ?? []);
  }

  async addMovement(
    tenantId: string,
    sessionId: string,
    dto: CreateCashMovementDto,
    user: UserProfileDto,
  ): Promise<CashSessionSummary> {
    const session = await this.requireOpenSession(tenantId, sessionId, user);
    await this.prisma.cashSessionMovement.create({
      data: {
        tenantId,
        sessionId: session.id,
        type: dto.type,
        amountMinor: dto.amountMinor,
        reason: dto.reason.trim(),
        createdById: user.id,
        createdByName: user.displayName?.trim() || 'Utente',
      },
    });
    const summary = await this.current(tenantId, session.locationId, user);
    // La sessione esiste per costruzione: l'abbiamo appena toccata.
    return summary!;
  }

  /**
   * Chiusura: calcola gli attesi dai documenti agganciati e li CONGELA insieme
   * al conteggio dichiarato. Da qui in poi la sessione è storico.
   */
  async close(
    tenantId: string,
    sessionId: string,
    dto: CloseCashSessionDto,
    user: UserProfileDto,
  ): Promise<CashSessionSummary> {
    const session = await this.requireOpenSession(tenantId, sessionId, user);
    const { payments, counts } = await this.loadSessionPayments(tenantId, [session.id]);
    const totals = computeCashSessionTotals(
      session.openingFloatMinor,
      payments.get(session.id) ?? [],
      session.movements.map(
        (movement): SessionMovementRow => ({
          type: movement.type,
          amountMinor: movement.amountMinor,
        }),
      ),
    );

    const closed = await this.prisma.cashSession.update({
      where: { id: session.id },
      data: {
        status: CashSessionStatus.closed,
        closedAt: new Date(),
        closedById: user.id,
        closedByName: user.displayName?.trim() || 'Utente',
        countedCashMinor: dto.countedCashMinor,
        countedCardMinor: dto.countedCardMinor ?? null,
        countedOtherMinor: dto.countedOtherMinor ?? null,
        expectedCashMinor: totals.expectedCashMinor,
        expectedCardMinor: totals.expectedCardMinor,
        expectedOtherMinor: totals.expectedOtherMinor,
        // La nota di chiusura si accoda a quella di apertura, non la sovrascrive.
        notes: [session.notes, dto.notes?.trim()].filter(Boolean).join(' · ') || null,
      },
      include: {
        location: { select: { name: true } },
        movements: { orderBy: { createdAt: 'asc' } },
      },
    });
    return this.toSummary(closed, payments.get(session.id) ?? [], counts.get(session.id) ?? []);
  }

  /** Elenco chiusure (e l'eventuale aperta), nello scope sedi dell'utente. */
  async list(
    tenantId: string,
    query: ListCashSessionsQueryDto,
    user: UserProfileDto,
  ): Promise<CashSessionSummary[]> {
    const scope = await resolveOperationalLocationScope(
      this.prisma,
      tenantId,
      user,
      query.locationId,
      INVENTORY_VIEW_SCOPE_MODE,
    );
    if (!scope || scope.length === 0) {
      return [];
    }

    const sessions = await this.prisma.cashSession.findMany({
      where: {
        tenantId,
        locationId: scope.length === 1 ? scope[0] : { in: [...scope] },
        ...(query.from || query.to
          ? {
              openedAt: {
                ...(query.from ? { gte: new Date(query.from) } : {}),
                ...(query.to ? { lte: new Date(query.to) } : {}),
              },
            }
          : {}),
      },
      include: {
        location: { select: { name: true } },
        movements: { orderBy: { createdAt: 'asc' } },
      },
      orderBy: { openedAt: 'desc' },
      take: 100,
    });
    if (sessions.length === 0) {
      return [];
    }

    const { payments, counts } = await this.loadSessionPayments(
      tenantId,
      sessions.map((session) => session.id),
    );
    return sessions.map((session) =>
      this.toSummary(session, payments.get(session.id) ?? [], counts.get(session.id) ?? []),
    );
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async requireOpenSession(
    tenantId: string,
    sessionId: string,
    user: UserProfileDto,
  ): Promise<SessionRecord> {
    const session = await this.prisma.cashSession.findFirst({
      where: { id: sessionId, tenantId },
      include: {
        location: { select: { name: true } },
        movements: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!session) {
      throw new NotFoundException('Sessione di cassa non trovata.');
    }
    assertUserCanAccessLocation(user, session.locationId);
    if (session.status !== CashSessionStatus.open) {
      throw new ConflictException('La sessione è già chiusa.');
    }
    return session;
  }

  /**
   * Pagamenti e conteggi documento delle sessioni richieste, raggruppati per
   * sessione. Una query per i pagamenti, una per i documenti: niente N+1.
   */
  private async loadSessionPayments(
    tenantId: string,
    sessionIds: readonly string[],
  ): Promise<{
    payments: Map<string, SessionPaymentRow[]>;
    counts: Map<string, DocumentType[]>;
  }> {
    const [paymentRows, documents] = await Promise.all([
      this.prisma.storeSalePayment.findMany({
        where: { tenantId, document: { cashSessionId: { in: [...sessionIds] } } },
        select: {
          method: true,
          amountMinor: true,
          document: { select: { type: true, cashSessionId: true } },
        },
      }),
      this.prisma.document.findMany({
        where: { tenantId, cashSessionId: { in: [...sessionIds] } },
        select: { type: true, cashSessionId: true },
      }),
    ]);

    const payments = new Map<string, SessionPaymentRow[]>();
    for (const row of paymentRows) {
      const sessionId = row.document.cashSessionId;
      if (!sessionId) {
        continue;
      }
      const bucket = payments.get(sessionId) ?? [];
      bucket.push({
        documentType: row.document.type,
        method: row.method,
        amountMinor: row.amountMinor,
      });
      payments.set(sessionId, bucket);
    }

    const counts = new Map<string, DocumentType[]>();
    for (const doc of documents) {
      if (!doc.cashSessionId) {
        continue;
      }
      const bucket = counts.get(doc.cashSessionId) ?? [];
      bucket.push(doc.type);
      counts.set(doc.cashSessionId, bucket);
    }

    return { payments, counts };
  }

  private toSummary(
    session: SessionRecord,
    payments: readonly SessionPaymentRow[],
    documentTypes: readonly DocumentType[],
  ): CashSessionSummary {
    const totals = computeCashSessionTotals(
      session.openingFloatMinor,
      payments,
      session.movements.map(
        (movement): SessionMovementRow => ({
          type: movement.type,
          amountMinor: movement.amountMinor,
        }),
      ),
    );
    const isClosed = session.status === CashSessionStatus.closed;
    return {
      id: session.id,
      locationId: session.locationId,
      locationName: session.location.name,
      status: session.status,
      openedAt: session.openedAt,
      openedByName: session.openedByName,
      openingFloatMinor: session.openingFloatMinor,
      closedAt: session.closedAt,
      closedByName: session.closedByName,
      notes: session.notes,
      countedCashMinor: session.countedCashMinor,
      countedCardMinor: session.countedCardMinor,
      countedOtherMinor: session.countedOtherMinor,
      // Chiusa: valgono i congelati (storico). Aperta: il calcolo corrente.
      expectedCashMinor: isClosed
        ? (session.expectedCashMinor ?? totals.expectedCashMinor)
        : totals.expectedCashMinor,
      expectedCardMinor: isClosed
        ? (session.expectedCardMinor ?? totals.expectedCardMinor)
        : totals.expectedCardMinor,
      expectedOtherMinor: isClosed
        ? (session.expectedOtherMinor ?? totals.expectedOtherMinor)
        : totals.expectedOtherMinor,
      totals,
      salesCount: documentTypes.filter((type) => type === DocumentType.store_sale).length,
      returnsCount: documentTypes.filter((type) => type === DocumentType.store_return).length,
      movements: session.movements.map((movement) => ({
        id: movement.id,
        type: movement.type,
        amountMinor: movement.amountMinor,
        reason: movement.reason,
        createdAt: movement.createdAt,
        createdByName: movement.createdByName,
      })),
    };
  }
}
