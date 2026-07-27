import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { DocumentCounter, DocumentType } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { isCounterConfigurableDocumentType } from './document-defaults';
import { documentNumberingType } from './document-type.util';

/** Contatore + valori calcolati per la schermata Impostazioni. */
export interface DocumentCounterView {
  readonly id: string;
  readonly type: DocumentType;
  readonly series: string;
  readonly locationId: string | null;
  readonly locationName: string | null;
  /** Prossimo numero proposto = max+1 sui documenti reali (anno corrente). */
  readonly nextNumber: number;
  /** Documenti che condividono questa numerazione (avviso spostamento/eliminazione). */
  readonly documentCount: number;
}

interface CounterIdentity {
  readonly type: DocumentType;
  readonly series: string;
  readonly locationId: string | null;
}

/**
 * Contatori di numerazione configurabili (Impostazioni → numeratori). Un
 * contatore è la tripla (tipo, serie, location) e NON memorizza il progressivo:
 * il prossimo numero è sempre max+1 sui documenti reali. Questo giro gestisce
 * solo la configurazione; l'aggancio alla testata dei documenti è un giro
 * successivo, quindi la creazione documenti non dipende dall'esistenza di un
 * contatore.
 */
@Injectable()
export class DocumentCountersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string): Promise<DocumentCounterView[]> {
    const counters = await this.prisma.documentCounter.findMany({
      where: { tenantId },
      include: { location: { select: { name: true } } },
      orderBy: [{ type: 'asc' }, { series: 'asc' }],
    });
    return Promise.all(counters.map((counter) => this.toView(tenantId, counter)));
  }

  async create(tenantId: string, input: CounterIdentity): Promise<DocumentCounterView> {
    const identity = await this.normalize(tenantId, input);
    await this.assertNoDuplicate(tenantId, identity, null);
    const created = await this.prisma.documentCounter.create({
      data: { tenantId, ...identity },
      include: { location: { select: { name: true } } },
    });
    return this.toView(tenantId, created);
  }

  async update(
    tenantId: string,
    id: string,
    input: Partial<CounterIdentity>,
  ): Promise<DocumentCounterView> {
    const current = await this.getById(tenantId, id);
    const identity = await this.normalize(tenantId, {
      type: input.type ?? current.type,
      series: input.series ?? current.series,
      // location può essere azzerata (globale) passando null esplicito.
      locationId: input.locationId !== undefined ? input.locationId : current.locationId,
    });
    await this.assertNoDuplicate(tenantId, identity, id);
    const updated = await this.prisma.documentCounter.update({
      where: { id },
      data: identity,
      include: { location: { select: { name: true } } },
    });
    return this.toView(tenantId, updated);
  }

  async delete(tenantId: string, id: string): Promise<void> {
    await this.getById(tenantId, id);
    // Eliminare il contatore NON tocca i documenti già numerati: il numero vive
    // sul documento, non qui. È solo configurazione.
    await this.prisma.documentCounter.delete({ where: { id } });
  }

  private async getById(tenantId: string, id: string): Promise<DocumentCounter> {
    const counter = await this.prisma.documentCounter.findFirst({ where: { id, tenantId } });
    if (!counter) {
      throw new NotFoundException('Contatore non trovato');
    }
    return counter;
  }

  /** Valida tipo/serie/location e normalizza (serie trim, location null se assente). */
  private async normalize(tenantId: string, input: CounterIdentity): Promise<CounterIdentity> {
    if (!isCounterConfigurableDocumentType(input.type)) {
      throw new UnprocessableEntityException(
        'Questo tipo documento non ha una numerazione configurabile.',
      );
    }
    const series = input.series.trim();
    if (!series) {
      throw new UnprocessableEntityException('La serie è obbligatoria.');
    }
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

  private async assertNoDuplicate(
    tenantId: string,
    identity: CounterIdentity,
    excludeId: string | null,
  ): Promise<void> {
    const duplicate = await this.prisma.documentCounter.findFirst({
      where: {
        tenantId,
        type: identity.type,
        series: identity.series,
        locationId: identity.locationId,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictException(
        'Esiste già un contatore con questa combinazione di tipo, serie e location.',
      );
    }
  }

  private async toView(
    tenantId: string,
    counter: DocumentCounter & { location?: { name: string } | null },
  ): Promise<DocumentCounterView> {
    const [nextNumber, documentCount] = await Promise.all([
      this.nextNumber(tenantId, counter.type, counter.series, counter.locationId),
      this.documentCount(tenantId, counter.type, counter.series, counter.locationId),
    ]);
    return {
      id: counter.id,
      type: counter.type,
      series: counter.series,
      locationId: counter.locationId,
      locationName: counter.location?.name ?? null,
      nextNumber,
      documentCount,
    };
  }

  /** max+1 sui documenti dell'anno corrente che condividono la numerazione. */
  private async nextNumber(
    tenantId: string,
    type: DocumentType,
    series: string,
    locationId: string | null,
  ): Promise<number> {
    const result = await this.prisma.document.aggregate({
      _max: { number: true },
      where: {
        tenantId,
        type: documentNumberingType(type),
        series,
        year: new Date().getFullYear(),
        ...(locationId ? { locationId } : {}),
      },
    });
    return (result._max.number ?? 0) + 1;
  }

  /** Documenti (tutti gli anni) che usano questa numerazione: avviso spostamento. */
  private async documentCount(
    tenantId: string,
    type: DocumentType,
    series: string,
    locationId: string | null,
  ): Promise<number> {
    return this.prisma.document.count({
      where: {
        tenantId,
        type: documentNumberingType(type),
        series,
        ...(locationId ? { locationId } : {}),
      },
    });
  }
}
