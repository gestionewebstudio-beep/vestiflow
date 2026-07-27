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
import { documentNumberingType } from './document-type.util';

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
    const views = await Promise.all(counters.map((counter) => this.toView(tenantId, counter)));
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
    await this.getById(tenantId, id);
    // Tutti i contatori sono eliminabili: eliminare non tocca i documenti già
    // numerati (il numero vive sul documento). Un tipo senza contatori numera
    // senza serie.
    await this.prisma.documentCounter.delete({ where: { id } });
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

  private async toView(
    tenantId: string,
    counter: DocumentCounter & { location?: { name: string } | null },
  ): Promise<DocumentCounterView> {
    const [nextNumber, documentCount] = await Promise.all([
      this.nextNumber(tenantId, counter.type, counter.series),
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
    };
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
  ): Promise<number> {
    return nextDocumentNumber({
      tx: this.prisma,
      tenantId,
      type,
      series,
      source: numberSourceForType(type),
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
      where: { tenantId, type: documentNumberingType(type), series },
    });
  }
}
