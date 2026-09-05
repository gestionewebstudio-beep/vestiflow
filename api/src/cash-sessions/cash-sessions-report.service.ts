import { Injectable, NotFoundException } from '@nestjs/common';
import { CashSessionStatus, DocumentStatus, DocumentType, Prisma } from '@prisma/client';

import type { UserProfileDto } from '../auth/dto/user-profile.dto';
import {
  resolveReadableListLocationScope,
  scopedLocationFilter,
} from '../inventory/licensed-location-scope.util';
import { PrismaService } from '../prisma/prisma.service';

import { calcolaAttesiSessione, type AttesiSessione } from './cash-session-totals.util';

/**
 * La consultazione delle **sessioni**: elenco, dettaglio, quadratura.
 *
 * ⛔ **Non ricalcola niente di ciò che è congelato.** `expectedCashMinor` e
 * `expectedElectronicMinor` li ha scritti la chiusura e restano quelli: qui si
 * leggono. Gli ADDENDI invece non sono persistiti — la chiusura ne congela due,
 * non sette — e si ricostruiscono con la **stessa** funzione che la chiusura ha
 * usato, dichiarando che sono una ricostruzione.
 *
 * ⭐ **E si dice quando la ricostruzione NON coincide** col congelato: succede
 * se dopo la chiusura qualcuno annulla un documento della sessione. Nasconderlo
 * darebbe due numeri diversi senza spiegazione; mostrarlo è la riconciliazione.
 */
@Injectable()
export class CashSessionsReportService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    tenantId: string,
    user: UserProfileDto,
    query: SessionsQuery,
  ): Promise<SessionsPage> {
    const scope = await resolveReadableListLocationScope(this.prisma, tenantId, user);
    if (scope !== 'unrestricted' && (!scope || scope.length === 0)) {
      return { items: [], total: 0, page: query.page, pageSize: query.pageSize };
    }

    // ⛔ **La sede chiesta RESTRINGE il perimetro**: fuori, elenco vuoto.
    const sede = scopedLocationFilter(scope, query.locationId);
    if (!sede) {
      return { items: [], total: 0, page: query.page, pageSize: query.pageSize };
    }

    const where: Prisma.CashSessionWhereInput = {
      tenantId,
      ...sede,
      ...(query.operatorId
        ? { OR: [{ openedById: query.operatorId }, { closedById: query.operatorId }] }
        : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.from || query.to
        ? {
            openedAt: {
              ...(query.from ? { gte: new Date(`${query.from}T00:00:00.000Z`) } : {}),
              ...(query.to ? { lte: new Date(`${query.to}T23:59:59.999Z`) } : {}),
            },
          }
        : {}),
    };

    const skip = (query.page - 1) * query.pageSize;
    const [sessioni, total] = await Promise.all([
      this.prisma.cashSession.findMany({
        where,
        orderBy: [{ openedAt: 'desc' }],
        skip,
        take: query.pageSize,
        select: SELECT_SESSIONE,
      }),
      this.prisma.cashSession.count({ where }),
    ]);

    // ⛔ **Un solo `groupBy` per la pagina, non uno per riga.** Con una query
    //    per sessione l'elenco costerebbe N+1 interrogazioni, ed è la forma che
    //    il mandato vieta esplicitamente.
    const ids = sessioni.map((s) => s.id);
    const [vendite, resi, movimenti] = await Promise.all([
      this.contaDocumenti(tenantId, ids, DocumentType.store_sale),
      this.contaDocumenti(tenantId, ids, DocumentType.store_return),
      this.prisma.cashSessionMovement.groupBy({
        by: ['sessionId', 'type'],
        where: { tenantId, sessionId: { in: ids } },
        _sum: { amountMinor: true },
      }),
    ]);

    return {
      items: sessioni.map((s) => {
        const v = vendite.get(s.id);
        const r = resi.get(s.id);
        const versamenti =
          movimenti.find((m) => m.sessionId === s.id && m.type === 'deposit')?._sum.amountMinor ??
          0;
        const prelievi =
          movimenti.find((m) => m.sessionId === s.id && m.type === 'withdrawal')?._sum
            .amountMinor ?? 0;
        return {
          ...this.toRiga(s),
          saleCount: v?.count ?? 0,
          salesTotalMinor: v?.total ?? 0,
          returnCount: r?.count ?? 0,
          returnsTotalMinor: r?.total ?? 0,
          depositsMinor: versamenti,
          withdrawalsMinor: prelievi,
        };
      }),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  /** Il dettaglio: quadratura, movimenti, documenti, storico dispositivo. */
  async detail(tenantId: string, user: UserProfileDto, id: string): Promise<SessionDetail> {
    const scope = await resolveReadableListLocationScope(this.prisma, tenantId, user);
    const sessione = await this.prisma.cashSession.findFirst({
      where: {
        id,
        tenantId,
        ...(scope === 'unrestricted' ? {} : { locationId: { in: [...(scope ?? [])] } }),
      },
      select: SELECT_SESSIONE,
    });
    if (!sessione) {
      // ⚠️ «di un altro tenant», «fuori ambito» e «inesistente»: stessa risposta.
      throw new NotFoundException('Sessione di cassa non trovata.');
    }

    const [movimenti, documenti, cambi, ricostruiti] = await Promise.all([
      this.prisma.cashSessionMovement.findMany({
        where: { tenantId, sessionId: id },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          type: true,
          amountMinor: true,
          reason: true,
          createdAt: true,
          createdByName: true,
        },
      }),
      this.prisma.document.findMany({
        where: {
          tenantId,
          cashSessionId: id,
          type: { in: [DocumentType.store_sale, DocumentType.store_return] },
        },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          type: true,
          status: true,
          reference: true,
          number: true,
          documentDate: true,
          createdAt: true,
          totalMinor: true,
          createdByName: true,
        },
      }),
      this.prisma.cashSessionDeviceChange.findMany({
        where: { tenantId, sessionId: id },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          previousDeviceId: true,
          newDeviceId: true,
          reason: true,
          createdAt: true,
          changedByName: true,
        },
      }),
      // ⭐ La STESSA funzione della chiusura: gli addendi non sono persistiti.
      calcolaAttesiSessione(this.prisma, tenantId, sessione).catch(() => null),
    ]);

    // ⭐ **Basta guardare le COLONNE**, senza chiedere anche lo stato: sono
    //    `NULL` finché la sessione è aperta, e la chiusura le scrive entrambe
    //    nella stessa transazione. Il controllo sullo stato c'era, ed era
    //    ridondante — misurato togliendolo: nessuna prova cambiava.
    //
    // ⚠️ Ridondante non è gratis: fa credere a chi legge che esista un caso in
    //    cui una sessione chiusa non abbia gli attesi, o una aperta li abbia.
    const congelati =
      sessione.expectedCashMinor !== null && sessione.expectedElectronicMinor !== null
        ? {
            expectedCashMinor: sessione.expectedCashMinor,
            expectedElectronicMinor: sessione.expectedElectronicMinor,
            countedCashMinor: sessione.countedCashMinor,
            declaredElectronicMinor: sessione.declaredElectronicMinor,
            cashDifferenceMinor:
              sessione.countedCashMinor === null
                ? null
                : sessione.countedCashMinor - sessione.expectedCashMinor,
            electronicDifferenceMinor:
              sessione.declaredElectronicMinor === null
                ? null
                : sessione.declaredElectronicMinor - sessione.expectedElectronicMinor,
          }
        : null;

    return {
      ...this.toRiga(sessione),
      // ⛔ `null` a sessione APERTA, e non è un dato mancante: gli attesi non
      //    esistono prima della chiusura. La cecità è strutturale.
      frozen: congelati,
      // ⚠️ Gli addendi sono una RICOSTRUZIONE di adesso, non un dato congelato.
      breakdown: ricostruiti,
      // ⭐ E si dichiara se la ricostruzione non torna col congelato: succede
      //    quando un documento della sessione viene annullato DOPO la chiusura.
      breakdownMatchesFrozen:
        congelati === null || ricostruiti === null
          ? null
          : ricostruiti.expectedCashMinor === congelati.expectedCashMinor &&
            ricostruiti.expectedElectronicMinor === congelati.expectedElectronicMinor,
      movements: movimenti,
      documents: documenti.map((d) => ({
        ...d,
        kind: d.type === DocumentType.store_sale ? ('sale' as const) : ('return' as const),
        reference: d.reference ?? (d.number != null ? String(d.number) : ''),
      })),
      deviceChanges: cambi,
    };
  }

  // ── Aiutanti ──────────────────────────────────────────────────────────────

  private async contaDocumenti(
    tenantId: string,
    sessionIds: readonly string[],
    type: DocumentType,
  ): Promise<Map<string, { count: number; total: number }>> {
    if (sessionIds.length === 0) {
      return new Map();
    }
    const gruppi = await this.prisma.document.groupBy({
      by: ['cashSessionId'],
      where: {
        tenantId,
        cashSessionId: { in: [...sessionIds] },
        type,
        // ⛔ Gli annullati non entrano nei totali, come nella quadratura.
        status: { not: DocumentStatus.cancelled },
      },
      _count: { _all: true },
      _sum: { totalMinor: true },
    });
    return new Map(
      gruppi
        .filter((g): g is typeof g & { cashSessionId: string } => g.cashSessionId !== null)
        .map((g) => [g.cashSessionId, { count: g._count._all, total: g._sum.totalMinor ?? 0 }]),
    );
  }

  private toRiga(s: SessioneGrezza): SessionRowBase {
    return {
      id: s.id,
      status: s.status,
      locationId: s.locationId,
      locationName: s.location.name,
      openedAt: s.openedAt,
      openedById: s.openedById,
      openedByName: s.openedByName,
      closedAt: s.closedAt,
      closedById: s.closedById,
      closedByName: s.closedByName,
      openingFloatMinor: s.openingFloatMinor,
      fiscalDeviceId: s.fiscalDeviceId,
      fiscalDeviceLabel: s.device ? etichettaDispositivo(s.device) : null,
      notes: s.notes,
    };
  }
}

/** Il dispositivo, come lo legge un operatore: marca e matricola, non un id. */
function etichettaDispositivo(d: {
  brand: string;
  serialNumber: string | null;
  adapterKey: string | null;
}): string {
  const matricola = d.serialNumber ? ` · ${d.serialNumber}` : '';
  return `${d.brand}${matricola}`;
}

const SELECT_SESSIONE = Prisma.validator<Prisma.CashSessionSelect>()({
  id: true,
  status: true,
  locationId: true,
  openedAt: true,
  openedById: true,
  openedByName: true,
  closedAt: true,
  closedById: true,
  closedByName: true,
  openingFloatMinor: true,
  countedCashMinor: true,
  declaredElectronicMinor: true,
  expectedCashMinor: true,
  expectedElectronicMinor: true,
  fiscalDeviceId: true,
  notes: true,
  location: { select: { id: true, name: true } },
  device: { select: { brand: true, serialNumber: true, adapterKey: true } },
});

type SessioneGrezza = Prisma.CashSessionGetPayload<{ select: typeof SELECT_SESSIONE }>;

// ── Tipi ───────────────────────────────────────────────────────────────────

export interface SessionsQuery {
  readonly page: number;
  readonly pageSize: number;
  readonly from?: string;
  readonly to?: string;
  readonly locationId?: string;
  readonly operatorId?: string;
  readonly status?: CashSessionStatus;
}

export interface SessionRowBase {
  readonly id: string;
  readonly status: CashSessionStatus;
  readonly locationId: string;
  readonly locationName: string;
  readonly openedAt: Date;
  readonly openedById: string | null;
  readonly openedByName: string;
  readonly closedAt: Date | null;
  readonly closedById: string | null;
  readonly closedByName: string | null;
  readonly openingFloatMinor: number;
  readonly fiscalDeviceId: string | null;
  readonly fiscalDeviceLabel: string | null;
  readonly notes: string | null;
}

export interface SessionRow extends SessionRowBase {
  readonly saleCount: number;
  readonly salesTotalMinor: number;
  readonly returnCount: number;
  readonly returnsTotalMinor: number;
  readonly depositsMinor: number;
  readonly withdrawalsMinor: number;
}

export interface SessionsPage {
  readonly items: readonly SessionRow[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

export interface SessionFrozen {
  readonly expectedCashMinor: number;
  readonly expectedElectronicMinor: number;
  readonly countedCashMinor: number | null;
  readonly declaredElectronicMinor: number | null;
  readonly cashDifferenceMinor: number | null;
  readonly electronicDifferenceMinor: number | null;
}

export interface SessionDetail extends SessionRowBase {
  /** ⛔ `null` a sessione aperta: gli attesi non esistono prima della chiusura. */
  readonly frozen: SessionFrozen | null;
  /** ⚠️ Ricostruiti ADESSO, non congelati. `null` se la sessione non quadra. */
  readonly breakdown: AttesiSessione | null;
  /** ⭐ `false` se la ricostruzione non torna col congelato. */
  readonly breakdownMatchesFrozen: boolean | null;
  readonly movements: readonly unknown[];
  readonly documents: readonly unknown[];
  readonly deviceChanges: readonly unknown[];
}
