import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { DocumentCounter, DocumentType, Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import {
  COUNTER_CONFIGURABLE_DOCUMENT_TYPES,
  isCounterConfigurableDocumentType,
} from './document-defaults';
import { nextDocumentNumber, numberSourceForType } from './document-numbering.util';
import { documentNumberingTypes } from './document-type.util';

/**
 * Quanti numeri liberi si elencano per esteso. Oltre questa soglia si dice solo
 * quanti sono: una serie con mille buchi non deve gonfiare la risposta.
 */
export const MISSING_NUMBERS_PREVIEW = 10;

/** Contatore + valori calcolati per la schermata Impostazioni. */
export interface DocumentCounterView {
  readonly id: string;
  readonly type: DocumentType;
  /** null = senza serie (riferimento senza il token serie). */
  readonly series: string | null;
  /** Attributo di disponibilità in testata; null = tutte le sedi. */
  readonly locationId: string | null;
  readonly locationName: string | null;
  readonly isDefault: boolean;
  /** Prossimo numero proposto = max+1 sui documenti reali (tipo + serie). */
  readonly nextNumber: number;
  /** Documenti che condividono questa numerazione (avviso eliminazione). */
  readonly documentCount: number;
  /**
   * Quanti numeri restano liberi fra 1 e l'ultimo assegnato. Sono i buchi
   * lasciati dalle cancellazioni in mezzo alla serie: nessuno li riempie
   * d'ufficio, ma l'operatore deve poterli vedere.
   *
   * Assente su `GET /document-counters/available`: quella rotta la chiama ogni
   * maschera documento a ogni apertura, e i buchi lì non servono a nessuno —
   * meglio niente che uno zero che sembra «serie integra».
   */
  readonly missingCount?: number;
  /** I primi numeri liberi (al più `MISSING_NUMBERS_PREVIEW`), in ordine. */
  readonly missingNumbers?: readonly number[];
}

/** Buchi di una serie: quanti sono in tutto e i primi da mostrare. */
export interface DocumentCounterGaps {
  readonly missingCount: number;
  readonly missingNumbers: readonly number[];
}

/**
 * Numeri liberi fra 1 e il massimo assegnato, dati i numeri già in uso.
 *
 * Funzione pura: la lettura dal database porta la colonna numero e basta, il
 * confronto avviene qui — una query per serie, mai una per numero. I duplicati
 * e i valori non positivi vengono ignorati (il vincolo unico li esclude già,
 * ma la funzione non ci fa affidamento), l'ordine di arrivo non conta.
 *
 * Il conteggio è sempre completo; l'elenco si ferma a `limit` perché una serie
 * con mille buchi non deve gonfiare la risposta.
 */
export function findMissingNumbers(
  assigned: readonly (number | null)[],
  limit: number = MISSING_NUMBERS_PREVIEW,
): DocumentCounterGaps {
  const used = new Set<number>();
  for (const value of assigned) {
    if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
      used.add(value);
    }
  }
  const sorted = [...used].sort((a, b) => a - b);

  const missingNumbers: number[] = [];
  let missingCount = 0;
  // Si parte dal PRIMO numero usato, non da 1: una serie che comincia da 143 —
  // chi migra da un altro gestionale a metà anno, o riprende la numerazione in
  // corso — non ha 142 buchi, ne ha zero. Quei numeri non li ha mai avuti
  // nessuno, e invitare a riusarli su una serie di fatture sarebbe sbagliato.
  //
  // `expected` è il prossimo numero che ci si aspetta: ogni salto oltre di esso
  // è un buco, e si conta per intero senza percorrerlo.
  let expected = sorted[0] ?? 1;
  for (const number of sorted) {
    if (number > expected) {
      missingCount += number - expected;
      for (let free = expected; free < number && missingNumbers.length < limit; free += 1) {
        missingNumbers.push(free);
      }
    }
    expected = number + 1;
  }
  return { missingCount, missingNumbers };
}

/** Dati in ingresso per creare/aggiornare un contatore. */
export interface SaveCounterInput {
  readonly type: DocumentType;
  /** null / stringa vuota = senza serie. */
  readonly series?: string | null;
  readonly locationId?: string | null;
  readonly isDefault?: boolean;
}

interface NormalizedCounter {
  readonly type: DocumentType;
  readonly series: string | null;
  readonly locationId: string | null;
}

/**
 * Contatori di numerazione configurabili (Impostazioni → numeratori). Identità
 * (tenant, tipo, serie): la serie è unica per tipo, la sede è solo un attributo
 * di disponibilità in testata. Il contatore NON memorizza il progressivo: il
 * prossimo numero è sempre max+1 sui documenti reali. Ogni tipo con
 * numerazione configurabile ha un contatore «senza serie» seminato di default.
 *
 * Da «max+1» discende che cancellare l'ULTIMO documento libera il suo numero,
 * mentre cancellarne uno IN MEZZO lascia un buco che nessuno riempie d'ufficio
 * (riempirlo sposterebbe numeri già comunicati). La vista li espone —
 * `missingCount` / `missingNumbers` — perché un buco invisibile è l'unica cosa
 * peggiore di un buco.
 */
@Injectable()
export class DocumentCountersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string): Promise<DocumentCounterView[]> {
    await this.seedDefaults(tenantId);
    const counters = await this.prisma.documentCounter.findMany({
      where: { tenantId },
      include: { location: { select: { name: true } } },
      orderBy: [{ type: 'asc' }, { series: { sort: 'asc', nulls: 'first' } }],
    });
    return Promise.all(counters.map((counter) => this.toView(tenantId, counter)));
  }

  /**
   * Contatori disponibili in testata per (tipo, sede): quelli senza sede
   * (validi ovunque) più quelli della sede indicata. `proposedCounterId` = il
   * predefinito se c'è; se non c'è ed è disponibile un solo contatore, quello;
   * altrimenti null (l'operatore sceglie).
   */
  async available(
    tenantId: string,
    type: DocumentType,
    locationId: string | null,
    /**
     * Data del documento in testata: **il numero proposto dipende da lei** (§2).
     * Assente = oggi, che è il caso della schermata Numeratori.
     */
    documentDate?: Date,
  ): Promise<{ counters: DocumentCounterView[]; proposedCounterId: string | null }> {
    await this.seedDefaults(tenantId);
    const counters = await this.prisma.documentCounter.findMany({
      where: {
        tenantId,
        type,
        OR: [{ locationId: null }, ...(locationId ? [{ locationId }] : [])],
      },
      include: { location: { select: { name: true } } },
      orderBy: [{ isDefault: 'desc' }, { series: { sort: 'asc', nulls: 'first' } }],
    });
    // Senza buchi: qui si propone un numero, non si fa il punto sulla serie.
    const views = await Promise.all(
      counters.map((c) => this.toView(tenantId, c, false, documentDate)),
    );
    const proposed = views.find((view) => view.isDefault) ?? (views.length === 1 ? views[0] : null);
    return { counters: views, proposedCounterId: proposed?.id ?? null };
  }

  async create(tenantId: string, input: SaveCounterInput): Promise<DocumentCounterView> {
    const identity = await this.normalize(tenantId, input);
    await this.assertNoDuplicate(tenantId, identity, null);
    const created = await this.prisma.$transaction(async (tx) => {
      if (input.isDefault) {
        await this.clearDefault(tx, tenantId, identity.type);
      }
      return tx.documentCounter.create({
        data: { tenantId, ...identity, isDefault: input.isDefault ?? false },
        include: { location: { select: { name: true } } },
      });
    });
    return this.toView(tenantId, created);
  }

  async update(
    tenantId: string,
    id: string,
    input: Partial<SaveCounterInput>,
  ): Promise<DocumentCounterView> {
    const current = await this.getById(tenantId, id);
    const identity = await this.normalize(tenantId, {
      type: input.type ?? current.type,
      series: input.series !== undefined ? input.series : current.series,
      locationId: input.locationId !== undefined ? input.locationId : current.locationId,
    });
    await this.assertNoDuplicate(tenantId, identity, id);
    const updated = await this.prisma.$transaction(async (tx) => {
      if (input.isDefault === true) {
        await this.clearDefault(tx, tenantId, identity.type, id);
      }
      return tx.documentCounter.update({
        where: { id },
        data: {
          ...identity,
          ...(input.isDefault !== undefined ? { isDefault: input.isDefault } : {}),
        },
        include: { location: { select: { name: true } } },
      });
    });
    return this.toView(tenantId, updated);
  }

  async delete(tenantId: string, id: string): Promise<void> {
    const counter = await this.getById(tenantId, id);
    // «Senza serie» (serie null) è la numerazione base del tipo: c'è sempre e
    // non si elimina. Si eliminano solo le serie aggiunte dall'operatore.
    if (counter.series === null) {
      throw new ConflictException('La voce «Senza serie» non è eliminabile.');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.documentCounter.delete({ where: { id } });
      // Se era la predefinita, il default torna alla «Senza serie» del tipo.
      if (counter.isDefault) {
        await tx.documentCounter.updateMany({
          where: { tenantId, type: counter.type, series: null },
          data: { isDefault: true },
        });
      }
    });
  }

  private async getById(tenantId: string, id: string): Promise<DocumentCounter> {
    const counter = await this.prisma.documentCounter.findFirst({ where: { id, tenantId } });
    if (!counter) {
      throw new NotFoundException('Contatore non trovato');
    }
    return counter;
  }

  /** Valida tipo/serie/sede e normalizza (serie vuota → null, senza serie). */
  private async normalize(
    tenantId: string,
    input: {
      readonly type: DocumentType;
      readonly series?: string | null;
      readonly locationId?: string | null;
    },
  ): Promise<NormalizedCounter> {
    if (!isCounterConfigurableDocumentType(input.type)) {
      throw new UnprocessableEntityException(
        'Questo tipo documento non ha una numerazione configurabile.',
      );
    }
    const trimmed = (input.series ?? '').trim();
    const series = trimmed.length > 0 ? trimmed : null;
    const locationId = input.locationId ?? null;
    if (locationId) {
      const location = await this.prisma.location.findFirst({
        where: { id: locationId, tenantId },
        select: { id: true },
      });
      if (!location) {
        throw new UnprocessableEntityException('Location non trovata.');
      }
    }
    return { type: input.type, series, locationId };
  }

  /** La serie è unica per (tenant, tipo); «senza serie» (null) è al più uno. */
  private async assertNoDuplicate(
    tenantId: string,
    identity: NormalizedCounter,
    excludeId: string | null,
  ): Promise<void> {
    const duplicate = await this.prisma.documentCounter.findFirst({
      where: {
        tenantId,
        type: identity.type,
        series: identity.series,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictException(
        identity.series
          ? `Esiste già un contatore serie "${identity.series}" per questo tipo.`
          : 'Esiste già un contatore senza serie per questo tipo.',
      );
    }
  }

  private async clearDefault(
    tx: Prisma.TransactionClient,
    tenantId: string,
    type: DocumentType,
    exceptId?: string,
  ): Promise<void> {
    await tx.documentCounter.updateMany({
      where: { tenantId, type, isDefault: true, ...(exceptId ? { id: { not: exceptId } } : {}) },
      data: { isDefault: false },
    });
  }

  /**
   * Semina un contatore predefinito «senza serie, senza sede» per ogni tipo con
   * numerazione configurabile che non ha ancora alcun contatore. Non duplica
   * quelli già presenti.
   */
  private async seedDefaults(tenantId: string): Promise<void> {
    const existing = await this.prisma.documentCounter.findMany({
      where: { tenantId },
      select: { type: true },
      distinct: ['type'],
    });
    const covered = new Set(existing.map((row) => row.type));
    const missing = COUNTER_CONFIGURABLE_DOCUMENT_TYPES.filter((type) => !covered.has(type));
    if (missing.length === 0) {
      return;
    }
    await this.prisma.documentCounter.createMany({
      data: missing.map((type) => ({
        tenantId,
        type,
        series: null,
        locationId: null,
        isDefault: true,
      })),
      skipDuplicates: true,
    });
  }

  /**
   * `withGaps` false = niente lettura dei numeri: la usa `available`, chiamata
   * a ogni apertura di maschera, dove i buchi non servono.
   */
  private async toView(
    tenantId: string,
    counter: DocumentCounter & { location?: { name: string } | null },
    withGaps = true,
    documentDate?: Date,
  ): Promise<DocumentCounterView> {
    const [nextNumber, documentCount] = await Promise.all([
      this.nextNumber(tenantId, counter.type, counter.series, documentDate),
      this.documentCount(tenantId, counter.type, counter.series),
    ]);
    return {
      id: counter.id,
      type: counter.type,
      series: counter.series,
      locationId: counter.locationId,
      locationName: counter.location?.name ?? null,
      isDefault: counter.isDefault,
      nextNumber,
      documentCount,
      ...(withGaps ? await this.gaps(tenantId, counter, nextNumber) : {}),
    };
  }

  /**
   * Buchi della serie: i numeri liberi fra 1 e l'ultimo assegnato.
   *
   * Con l'ultimo numero a 0 o 1 un buco non può esistere — la serie è vuota o
   * ha il solo numero 1 — e la lettura si evita del tutto: è il caso della gran
   * parte delle serie di un tenant.
   */
  private async gaps(
    tenantId: string,
    counter: DocumentCounter,
    nextNumber: number,
  ): Promise<DocumentCounterGaps> {
    const lastAssigned = nextNumber - 1;
    if (lastAssigned < 2) {
      return { missingCount: 0, missingNumbers: [] };
    }
    return findMissingNumbers(await this.assignedNumbers(tenantId, counter.type, counter.series));
  }

  /**
   * Numeri già assegnati nella partizione del contatore — (tenant, tipo che
   * possiede il numeratore, serie), la stessa di `lastAssignedNumber`. Una sola
   * lettura per serie, e della sola colonna numero: i buchi si calcolano poi in
   * memoria con `findMissingNumbers`.
   *
   * Le righe senza numero (bozze, ordini che arrivano dai canali col numero del
   * canale) sono escluse: non occupano un progressivo, quindi non chiudono un
   * buco né ne aprono uno.
   */
  private async assignedNumbers(
    tenantId: string,
    type: DocumentType,
    series: string | null,
  ): Promise<(number | null)[]> {
    const source = numberSourceForType(type);
    if (source === 'sales_order') {
      const rows = await this.prisma.salesOrder.findMany({
        where: { tenantId, source: 'manual', series, number: { not: null } },
        select: { number: true },
      });
      return rows.map((row) => row.number);
    }
    if (source === 'supplier_order') {
      const rows = await this.prisma.supplierOrder.findMany({
        where: { tenantId, series, number: { not: null } },
        select: { number: true },
      });
      return rows.map((row) => row.number);
    }
    const rows = await this.prisma.document.findMany({
      // `in`: i tipi che condividono il numeratore occupano gli stessi numeri, e
      // leggerne uno solo li farebbe comparire come «liberi» pur essendo presi.
      where: {
        tenantId,
        type: { in: [...documentNumberingTypes(type)] },
        series,
        number: { not: null },
      },
      select: { number: true },
    });
    return rows.map((row) => row.number);
  }

  /**
   * max+1 sul contatore (tipo + serie). Il progressivo è letto dalla tabella
   * che possiede il numero (documenti, ordini cliente, ordini fornitore); sede
   * e anno non contano.
   */
  private async nextNumber(
    tenantId: string,
    type: DocumentType,
    series: string | null,
    // La data della testata, quando c'è: il primo libero si calcola su di lei
    // (§2). Assente = oggi, che è il caso della schermata Numeratori.
    documentDate?: Date,
  ): Promise<number> {
    return nextDocumentNumber({
      tx: this.prisma,
      tenantId,
      type,
      series,
      source: numberSourceForType(type),
      documentDate,
    });
  }

  /** Documenti/ordini che condividono la numerazione (avviso eliminazione). */
  private async documentCount(
    tenantId: string,
    type: DocumentType,
    series: string | null,
  ): Promise<number> {
    const source = numberSourceForType(type);
    if (source === 'sales_order') {
      return this.prisma.salesOrder.count({ where: { tenantId, source: 'manual', series } });
    }
    if (source === 'supplier_order') {
      return this.prisma.supplierOrder.count({ where: { tenantId, series } });
    }
    return this.prisma.document.count({
      where: { tenantId, type: { in: [...documentNumberingTypes(type)] }, series },
    });
  }
}
