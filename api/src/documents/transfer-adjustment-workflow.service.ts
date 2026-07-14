import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  DocumentStatus,
  DocumentType,
  Prisma,
  type Document,
  type DocumentLine,
} from '@prisma/client';

import type { UserProfileDto } from '../auth/dto/user-profile.dto';
import { ChannelSyncFacade } from '../channels/channel-sync.facade';
import {
  assertSerialNumbersForTransferLines,
  assertSerialNumbersForUnloadLines,
  applyInventorySerialsFromDocumentLines,
  consumeInventorySerialsFromDocumentLines,
  restoreConsumedSerialsForDocument,
  reverseInventorySerialsForDocument,
  reverseTransferInventorySerialsForDocument,
  transferInventorySerialsFromDocumentLines,
} from '../inventory/inventory-serial.util';
import { PrismaService } from '../prisma/prisma.service';
import { assertLocationInUserScope } from '../inventory/user-location-scope.util';
import {
  buildAdjustmentMovementReason,
  syncAdjustmentLineMovements,
} from './document-stock-adjustment-sync.util';
import {
  buildTransferMovementReason,
  syncTransferLineMovements,
} from './document-stock-transfer-sync.util';
import { DocumentSettingsService } from './document-settings.service';
import type { SaveAdjustmentDto, SaveAdjustmentLineDto } from './dto/save-adjustment.dto';
import type { SaveTransferDto, SaveTransferLineDto } from './dto/save-transfer.dto';

export type DocumentWithLines = Document & { lines: DocumentLine[] };

/** Stati in cui un documento confermato resta modificabile (mirror documents.service.ts). */
const CONFIRMED_EDITABLE_STATUSES: readonly DocumentStatus[] = [
  DocumentStatus.confirmed,
  DocumentStatus.printed,
  DocumentStatus.sent,
] as const;

interface ComputedSimpleLine {
  readonly lineNumber: number;
  readonly variantId: string | null;
  readonly sku: string | null;
  readonly description: string;
  readonly quantity: number;
  readonly loadsStock: boolean;
  readonly serialNumbers: string[];
}

function normalizeSerialNumbers(input?: readonly string[]): string[] {
  if (!input?.length) {
    return [];
  }
  return input.map((entry) => entry.trim()).filter((entry) => entry.length > 0);
}

function computeSimpleLines(
  input: readonly (SaveTransferLineDto | SaveAdjustmentLineDto)[],
): ComputedSimpleLine[] {
  return input.map((line, index) => ({
    lineNumber: index + 1,
    variantId: line.variantId ?? null,
    sku: line.sku ?? null,
    description: line.description.trim(),
    quantity: line.quantity,
    loadsStock: line.loadsStock ?? true,
    serialNumbers: normalizeSerialNumbers(line.serialNumbers),
  }));
}

/**
 * Flusso "Salva documento" dedicato per Trasferimento e Rettifica, mirror di
 * GoodsReceiptWorkflowService per la parte che conta davvero: preservare gli
 * id riga stabili quando si modifica un documento che ha GIÀ movimenti per
 * riga collegati (sourceLineId), così il sync aggiorna il movimento esistente
 * invece di ricrearlo da zero (vedi document-stock-transfer-sync.util.ts /
 * document-stock-adjustment-sync.util.ts).
 *
 * A differenza dell'Arrivo merce, la creazione e la PRIMA conferma di un
 * Trasferimento/Rettifica restano sul flusso generico esistente
 * (POST /documents in bozza + POST /documents/:id/confirm, aggiornato per
 * generare movimenti per riga — vedi DocumentsService.confirm()): in bozza
 * non esistono ancora movimenti, quindi la (in)stabilità degli id riga non ha
 * conseguenze. Questo servizio entra in gioco SOLO per modificare un
 * documento GIÀ confermato, il caso in cui il PATCH generico (che ricrea le
 * righe con delete+create) romperebbe il collegamento sourceLineId.
 */
@Injectable()
export class TransferAdjustmentWorkflowService {
  private readonly logger = new Logger(TransferAdjustmentWorkflowService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: DocumentSettingsService,
    private readonly channelSync: ChannelSyncFacade,
  ) {}

  // ── Trasferimento ──────────────────────────────────────────────────────────

  async saveTransfer(
    tenantId: string,
    dto: SaveTransferDto,
    user?: UserProfileDto,
  ): Promise<DocumentWithLines> {
    if (dto.locationId === dto.targetLocationId) {
      throw new UnprocessableEntityException(
        'Origine e destinazione devono essere location diverse.',
      );
    }
    await this.assertLocation(tenantId, dto.locationId);
    await this.assertLocation(tenantId, dto.targetLocationId);
    // Origine: sede operativa vera e propria (deve essere assegnata
    // all'utente). Destinazione: come nel modulo inventory, una sede
    // licenziata qualunque è ammessa come target di un trasferimento.
    if (user) {
      assertLocationInUserScope(user, dto.locationId, 'write');
      assertLocationInUserScope(user, dto.targetLocationId, 'transferDestination');
    }

    const setting = await this.settings.getResolved(tenantId, DocumentType.transfer);
    const documentDate = new Date(dto.documentDate);
    const actor = {
      createdById: user?.id ?? null,
      createdByName: user?.displayName ?? 'API',
    };

    const computedLines = computeSimpleLines(dto.lines ?? []);
    const stockLines = computedLines.filter((line) => line.loadsStock && line.quantity > 0);
    if (stockLines.length === 0) {
      throw new UnprocessableEntityException(
        'Aggiungi almeno una riga con variante e quantità maggiore di zero.',
      );
    }
    for (const line of stockLines) {
      if (!line.variantId) {
        throw new UnprocessableEntityException(
          `La riga ${line.lineNumber} trasferisce stock ma non ha una variante associata.`,
        );
      }
    }

    let syncTargets: readonly { variantId: string; locationId: string }[] = [];

    const saved = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.document.findFirst({
        where: { id: dto.id, tenantId, type: DocumentType.transfer },
        include: { lines: { orderBy: { lineNumber: 'asc' } } },
      });
      if (!existing) {
        throw new NotFoundException('Trasferimento non trovato');
      }
      if (existing.status === DocumentStatus.cancelled) {
        throw new ConflictException('Il documento è annullato e non può essere modificato.');
      }
      if (!(CONFIRMED_EDITABLE_STATUSES as readonly DocumentStatus[]).includes(existing.status)) {
        throw new ConflictException(
          'Questo salvataggio si usa solo per modificare un trasferimento già confermato.',
        );
      }
      if (setting.blockAfterConfirm) {
        throw new ConflictException(
          'Modifica bloccata dalle impostazioni per questo tipo di documento.',
        );
      }
      if (!existing.locationId || !existing.targetLocationId) {
        // Non deve succedere per un trasferimento confermato, ma per sicurezza
        // evitiamo di stornare seriali su location nulle.
        throw new ConflictException('Trasferimento privo di location di origine/destinazione.');
      }

      await this.assertVariantsExist(tx, tenantId, stockLines);

      const oldLocationId = existing.locationId;
      const oldTargetLocationId = existing.targetLocationId;

      // Modifica di un trasferimento esistente: l'utente deve poter operare
      // anche sulle sedi attuali del documento, non solo su quelle nuove.
      if (user) {
        assertLocationInUserScope(user, oldLocationId, 'write');
        assertLocationInUserScope(user, oldTargetLocationId, 'transferDestination');
      }

      // ── Upsert righe per id: preservare l'id riga è ciò che consente di
      // aggiornare il movimento collegato invece di duplicarlo.
      const lineIds = (dto.lines ?? []).map((line) => line.id ?? null);
      const existingLineIds = new Set(existing.lines.map((line) => line.id));
      const incomingIds = new Set(
        lineIds.filter((id): id is string => id != null && existingLineIds.has(id)),
      );

      // Storno seriali "vecchi": va fatto sulle righe/location PRIMA della
      // modifica, con gli id ancora validi.
      await reverseTransferInventorySerialsForDocument(
        tx,
        tenantId,
        oldLocationId,
        oldTargetLocationId,
        existing.lines.map((line) => line.id),
      );

      await tx.documentLine.deleteMany({
        where: { documentId: existing.id, id: { notIn: [...incomingIds] } },
      });

      for (let index = 0; index < computedLines.length; index += 1) {
        const line = computedLines[index] as ComputedSimpleLine;
        const lineId = lineIds[index];
        const data = {
          lineNumber: line.lineNumber,
          variantId: line.variantId,
          sku: line.sku,
          description: line.description,
          quantity: line.quantity,
          unitPriceMinor: 0,
          discountPercent: 0,
          lineTotalMinor: 0,
          loadsStock: line.loadsStock,
          serialNumbers: line.serialNumbers,
        };
        if (lineId && incomingIds.has(lineId)) {
          await tx.documentLine.update({ where: { id: lineId }, data });
        } else {
          await tx.documentLine.create({
            data: { ...data, tenantId, documentId: existing.id },
          });
        }
      }

      const savedLines = await tx.documentLine.findMany({
        where: { documentId: existing.id },
        orderBy: { lineNumber: 'asc' },
      });

      const reason = buildTransferMovementReason({ reference: existing.reference });
      const sync = await syncTransferLineMovements(tx, {
        tenantId,
        documentId: existing.id,
        documentType: DocumentType.transfer,
        originLocationId: dto.locationId,
        targetLocationId: dto.targetLocationId,
        reason,
        movementDate: documentDate,
        lines: savedLines,
        actor,
      });
      syncTargets = sync.syncTargets;

      await assertSerialNumbersForTransferLines(tx, tenantId, dto.locationId, savedLines);
      await transferInventorySerialsFromDocumentLines(
        tx,
        tenantId,
        dto.locationId,
        dto.targetLocationId,
        savedLines,
      );

      await tx.document.update({
        where: { id: existing.id },
        data: {
          documentDate,
          locationId: dto.locationId,
          targetLocationId: dto.targetLocationId,
          notes: dto.notes !== undefined ? dto.notes : existing.notes,
          internalComment:
            dto.internalComment !== undefined
              ? dto.internalComment?.trim() || null
              : existing.internalComment,
        },
      });

      if (sync.deltas.length > 0) {
        await this.recordRevision(tx, tenantId, existing.id, sync.deltas, actor);
      }

      return tx.document.findFirstOrThrow({
        where: { id: existing.id, tenantId },
        include: { lines: { orderBy: { lineNumber: 'asc' } } },
      });
    });

    await this.pushInventory(tenantId, syncTargets);
    return saved;
  }

  // ── Rettifica ───────────────────────────────────────────────────────────────

  async saveAdjustment(
    tenantId: string,
    dto: SaveAdjustmentDto,
    user?: UserProfileDto,
  ): Promise<DocumentWithLines> {
    await this.assertLocation(tenantId, dto.locationId);
    if (user) {
      assertLocationInUserScope(user, dto.locationId, 'write');
    }

    const setting = await this.settings.getResolved(tenantId, DocumentType.adjustment);
    const documentDate = new Date(dto.documentDate);
    const actor = {
      createdById: user?.id ?? null,
      createdByName: user?.displayName ?? 'API',
    };

    const computedLines = computeSimpleLines(dto.lines ?? []);
    const stockLines = computedLines.filter((line) => line.loadsStock && line.quantity > 0);
    if (stockLines.length === 0) {
      throw new UnprocessableEntityException(
        'Aggiungi almeno una riga con variante e quantità maggiore di zero.',
      );
    }
    for (const line of stockLines) {
      if (!line.variantId) {
        throw new UnprocessableEntityException(
          `La riga ${line.lineNumber} rettifica stock ma non ha una variante associata.`,
        );
      }
    }
    if (!dto.internalComment?.trim()) {
      throw new UnprocessableEntityException(
        'Il motivo della rettifica (commento interno) è obbligatorio.',
      );
    }

    let syncTargets: readonly { variantId: string; locationId: string }[] = [];

    const saved = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.document.findFirst({
        where: { id: dto.id, tenantId, type: DocumentType.adjustment },
        include: { lines: { orderBy: { lineNumber: 'asc' } } },
      });
      if (!existing) {
        throw new NotFoundException('Rettifica non trovata');
      }
      if (existing.status === DocumentStatus.cancelled) {
        throw new ConflictException('Il documento è annullato e non può essere modificato.');
      }
      if (!(CONFIRMED_EDITABLE_STATUSES as readonly DocumentStatus[]).includes(existing.status)) {
        throw new ConflictException(
          'Questo salvataggio si usa solo per modificare una rettifica già confermata.',
        );
      }
      if (setting.blockAfterConfirm) {
        throw new ConflictException(
          'Modifica bloccata dalle impostazioni per questo tipo di documento.',
        );
      }
      if (!existing.locationId || !existing.adjustmentDirection) {
        throw new ConflictException('Rettifica priva di location o direzione.');
      }
      if (user) {
        assertLocationInUserScope(user, existing.locationId, 'write');
      }

      await this.assertVariantsExist(tx, tenantId, stockLines);

      const oldDirection = existing.adjustmentDirection;
      const oldLineIds = existing.lines.map((line) => line.id);

      // Storno seriali "vecchi" PRIMA della modifica righe, con gli id ancora
      // validi (mirror update()): aumento → rimuove i seriali caricati,
      // diminuzione → ripristina i seriali consumati.
      if (oldDirection === 'decrease') {
        await restoreConsumedSerialsForDocument(tx, tenantId, oldLineIds);
      } else {
        await reverseInventorySerialsForDocument(tx, tenantId, oldLineIds);
      }

      const lineIds = (dto.lines ?? []).map((line) => line.id ?? null);
      const existingLineIds = new Set(existing.lines.map((line) => line.id));
      const incomingIds = new Set(
        lineIds.filter((id): id is string => id != null && existingLineIds.has(id)),
      );

      await tx.documentLine.deleteMany({
        where: { documentId: existing.id, id: { notIn: [...incomingIds] } },
      });

      for (let index = 0; index < computedLines.length; index += 1) {
        const line = computedLines[index] as ComputedSimpleLine;
        const lineId = lineIds[index];
        const data = {
          lineNumber: line.lineNumber,
          variantId: line.variantId,
          sku: line.sku,
          description: line.description,
          quantity: line.quantity,
          unitPriceMinor: 0,
          discountPercent: 0,
          lineTotalMinor: 0,
          loadsStock: line.loadsStock,
          serialNumbers: line.serialNumbers,
        };
        if (lineId && incomingIds.has(lineId)) {
          await tx.documentLine.update({ where: { id: lineId }, data });
        } else {
          await tx.documentLine.create({
            data: { ...data, tenantId, documentId: existing.id },
          });
        }
      }

      const savedLines = await tx.documentLine.findMany({
        where: { documentId: existing.id },
        orderBy: { lineNumber: 'asc' },
      });

      const reason = buildAdjustmentMovementReason({
        reference: existing.reference,
        reason: dto.internalComment.trim(),
      });
      const sync = await syncAdjustmentLineMovements(tx, {
        tenantId,
        documentId: existing.id,
        documentType: DocumentType.adjustment,
        locationId: dto.locationId,
        direction: dto.adjustmentDirection,
        reason,
        movementDate: documentDate,
        lines: savedLines,
        actor,
      });
      syncTargets = sync.syncTargets;

      if (dto.adjustmentDirection === 'decrease') {
        await assertSerialNumbersForUnloadLines(tx, tenantId, dto.locationId, savedLines);
        await consumeInventorySerialsFromDocumentLines(tx, tenantId, dto.locationId, savedLines);
      } else {
        await applyInventorySerialsFromDocumentLines(tx, tenantId, dto.locationId, savedLines);
      }

      await tx.document.update({
        where: { id: existing.id },
        data: {
          documentDate,
          locationId: dto.locationId,
          adjustmentDirection: dto.adjustmentDirection,
          notes: dto.notes !== undefined ? dto.notes : existing.notes,
          internalComment: dto.internalComment.trim(),
        },
      });

      if (sync.deltas.length > 0) {
        await this.recordRevision(tx, tenantId, existing.id, sync.deltas, actor);
      }

      return tx.document.findFirstOrThrow({
        where: { id: existing.id, tenantId },
        include: { lines: { orderBy: { lineNumber: 'asc' } } },
      });
    });

    await this.pushInventory(tenantId, syncTargets);
    return saved;
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  /** Le righe che movimentano stock devono referenziare varianti esistenti. */
  private async assertVariantsExist(
    tx: Prisma.TransactionClient,
    tenantId: string,
    stockLines: readonly ComputedSimpleLine[],
  ): Promise<void> {
    const variantIds = [
      ...new Set(stockLines.map((line) => line.variantId).filter((id): id is string => id != null)),
    ];
    if (variantIds.length === 0) {
      return;
    }
    const found = await tx.productVariant.findMany({
      where: { tenantId, id: { in: variantIds } },
      select: { id: true },
    });
    if (found.length !== variantIds.length) {
      throw new UnprocessableEntityException(
        'Una o più varianti collegate alle righe non esistono più.',
      );
    }
  }

  private async assertLocation(tenantId: string, locationId: string): Promise<void> {
    const found = await this.prisma.location.findFirst({
      where: { id: locationId, tenantId },
      select: { id: true },
    });
    if (!found) {
      throw new NotFoundException('Sede non trovata');
    }
  }

  private async pushInventory(
    tenantId: string,
    targets: readonly { variantId: string; locationId: string }[],
  ): Promise<void> {
    const unique = new Map(targets.map((t) => [`${t.variantId}::${t.locationId}`, t]));
    for (const target of unique.values()) {
      try {
        await this.channelSync.pushInventoryLevels(tenantId, target.variantId, [
          target.locationId,
        ]);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Push inventario canale fallito';
        this.logger.warn(`Push inventario non riuscito (${tenantId}): ${message}`);
      }
    }
  }

  private async recordRevision(
    tx: Prisma.TransactionClient,
    tenantId: string,
    documentId: string,
    deltas: readonly { readonly sku: string; readonly delta: number }[],
    actor: { createdById: string | null; createdByName: string },
  ): Promise<void> {
    const parts = deltas.map((d) => `${d.sku} ${d.delta > 0 ? '+' : ''}${d.delta}`);
    const last = await tx.documentRevision.findFirst({
      where: { documentId },
      orderBy: { revisionNumber: 'desc' },
      select: { revisionNumber: true },
    });
    await tx.documentRevision.create({
      data: {
        tenantId,
        documentId,
        revisionNumber: (last?.revisionNumber ?? 0) + 1,
        summary: `Salvataggio documento (giacenza: ${parts.join(', ')})`,
        changedById: actor.createdById,
        changedByName: actor.createdByName,
      },
    });
  }
}
