import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

import type { CreatePosTerminalDto, UpdatePosTerminalDto } from './dto/pos-terminal.dto';
import {
  posPortalStatus,
  posPortalWindow,
  type PosPortalStatus,
} from './pos-portal-window.util';

export interface PosTerminalResult {
  readonly id: string;
  readonly locationId: string;
  readonly locationName: string;
  readonly terminalId: string;
  readonly acquirerName: string;
  readonly description: string | null;
  readonly activatedAt: Date;
  readonly portalLinkedAt: Date | null;
  readonly notes: string | null;
  /** Finestra di comunicazione sul portale e stato rispetto a oggi. */
  readonly portalWindowFrom: Date;
  readonly portalWindowTo: Date;
  readonly portalStatus: PosPortalStatus;
}

type TerminalRecord = Prisma.PosTerminalGetPayload<{
  include: { location: { select: { name: true } } };
}>;

/**
 * Anagrafica terminali POS (Tranche 3): il collegamento logico POS ↔ RT si fa
 * SUL PORTALE dall'esercente (non è delegabile al software) — qui si tiene
 * l'elenco dei terminali, le finestre di comunicazione e chi è in ritardo.
 */
@Injectable()
export class PosTerminalsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string): Promise<PosTerminalResult[]> {
    const terminals = await this.prisma.posTerminal.findMany({
      where: { tenantId },
      include: { location: { select: { name: true } } },
      orderBy: [{ location: { name: 'asc' } }, { terminalId: 'asc' }],
    });
    return terminals.map((terminal) => this.toResult(terminal));
  }

  async create(tenantId: string, dto: CreatePosTerminalDto): Promise<PosTerminalResult> {
    await this.assertLocation(tenantId, dto.locationId);
    try {
      const terminal = await this.prisma.posTerminal.create({
        data: {
          tenantId,
          locationId: dto.locationId,
          terminalId: dto.terminalId.trim(),
          acquirerName: dto.acquirerName.trim(),
          description: dto.description?.trim() || null,
          activatedAt: new Date(dto.activatedAt),
          notes: dto.notes?.trim() || null,
        },
        include: { location: { select: { name: true } } },
      });
      return this.toResult(terminal);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Terminal ID già registrato per questo negozio.');
      }
      throw error;
    }
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdatePosTerminalDto,
  ): Promise<PosTerminalResult> {
    const existing = await this.prisma.posTerminal.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('Terminale non trovato.');
    }
    if (dto.locationId) {
      await this.assertLocation(tenantId, dto.locationId);
    }

    const terminal = await this.prisma.posTerminal.update({
      where: { id },
      data: {
        locationId: dto.locationId,
        acquirerName: dto.acquirerName?.trim(),
        description: dto.description !== undefined ? dto.description.trim() || null : undefined,
        // Variazione = nuova finestra: si azzera anche l'adempimento fatto.
        ...(dto.activatedAt
          ? { activatedAt: new Date(dto.activatedAt), portalLinkedAt: null }
          : {}),
        ...(dto.portalLinked !== undefined
          ? { portalLinkedAt: dto.portalLinked ? new Date() : null }
          : {}),
        notes: dto.notes !== undefined ? dto.notes.trim() || null : undefined,
      },
      include: { location: { select: { name: true } } },
    });
    return this.toResult(terminal);
  }

  async remove(tenantId: string, id: string): Promise<void> {
    const deleted = await this.prisma.posTerminal.deleteMany({ where: { id, tenantId } });
    if (deleted.count === 0) {
      throw new NotFoundException('Terminale non trovato.');
    }
  }

  private async assertLocation(tenantId: string, locationId: string): Promise<void> {
    const location = await this.prisma.location.findFirst({
      where: { id: locationId, tenantId, isActive: true, licensedInVf: true },
      select: { id: true },
    });
    if (!location) {
      throw new NotFoundException('Sede non trovata o non operativa.');
    }
  }

  private toResult(terminal: TerminalRecord): PosTerminalResult {
    const window = posPortalWindow(terminal.activatedAt);
    return {
      id: terminal.id,
      locationId: terminal.locationId,
      locationName: terminal.location.name,
      terminalId: terminal.terminalId,
      acquirerName: terminal.acquirerName,
      description: terminal.description,
      activatedAt: terminal.activatedAt,
      portalLinkedAt: terminal.portalLinkedAt,
      notes: terminal.notes,
      portalWindowFrom: window.from,
      portalWindowTo: window.to,
      portalStatus: posPortalStatus(terminal.activatedAt, terminal.portalLinkedAt, new Date()),
    };
  }
}
