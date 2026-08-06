import { Injectable, NotFoundException } from '@nestjs/common';
import { DocumentType, FiscalReceiptStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

import type { ReportFiscalOutcomeDto } from './dto/report-fiscal-outcome.dto';
import {
  buildFiscalPrintPayload,
  type FiscalPrintPayload,
} from './fiscal-print-payload.util';

/** Voce della coda «da fiscalizzare»: ricevuta + payload pronto da stampare. */
export interface PendingFiscalReceipt {
  readonly receiptId: string;
  readonly status: FiscalReceiptStatus;
  readonly errorMessage: string | null;
  readonly createdAt: Date;
  readonly totalMinor: number;
  readonly payload: FiscalPrintPayload;
}

export interface FiscalReceiptOutcomeResult {
  readonly receiptId: string;
  readonly status: FiscalReceiptStatus;
  readonly fiscalNumber: string | null;
  readonly issuedAt: Date | null;
}

/**
 * Ciclo di vita della ricevuta fiscale (Tranche 2): la ricevuta nasce
 * `pending` con la vendita (StoreSalesService), il browser emette sulla
 * stampante e riporta qui l'esito. `failed` resta in coda come `pending`:
 * si riemette finché non esce — mai vendite fiscali perse in silenzio.
 */
@Injectable()
export class FiscalReceiptsService {
  constructor(private readonly prisma: PrismaService) {}

  async reportOutcome(
    tenantId: string,
    documentId: string,
    dto: ReportFiscalOutcomeDto,
  ): Promise<FiscalReceiptOutcomeResult> {
    const receipt = await this.prisma.fiscalReceipt.findFirst({
      where: { documentId, tenantId },
      select: { id: true, deviceId: true },
    });
    if (!receipt) {
      throw new NotFoundException('Ricevuta fiscale non trovata per questo documento.');
    }

    const now = new Date();
    const emitted = dto.outcome === 'emitted';

    const updated = await this.prisma.fiscalReceipt.update({
      where: { id: receipt.id },
      data: emitted
        ? {
            status: FiscalReceiptStatus.emitted,
            fiscalNumber: dto.fiscalNumber?.trim() || null,
            serialNumber: dto.serialNumber?.trim() || undefined,
            issuedAt: now,
            errorMessage: null,
          }
        : {
            status: FiscalReceiptStatus.failed,
            errorMessage: dto.errorMessage?.trim() || 'Emissione non riuscita.',
          },
      select: { id: true, status: true, fiscalNumber: true, issuedAt: true },
    });

    // Diagnostica del dispositivo: ultimo contatto riuscito / ultimo errore.
    if (receipt.deviceId) {
      await this.prisma.fiscalDevice.update({
        where: { id: receipt.deviceId },
        data: emitted
          ? { lastSeenAt: now, lastError: null }
          : { lastError: dto.errorMessage?.trim() || 'Emissione non riuscita.' },
      });
    }

    return {
      receiptId: updated.id,
      status: updated.status,
      fiscalNumber: updated.fiscalNumber,
      issuedAt: updated.issuedAt,
    };
  }

  /** Coda «da fiscalizzare» della sede: pending e failed, pronte da ristampare. */
  async listPending(tenantId: string, locationId: string): Promise<PendingFiscalReceipt[]> {
    const receipts = await this.prisma.fiscalReceipt.findMany({
      where: {
        tenantId,
        status: { in: [FiscalReceiptStatus.pending, FiscalReceiptStatus.failed] },
        document: { locationId },
      },
      include: {
        device: true,
        original: { select: { fiscalNumber: true, issuedAt: true, serialNumber: true } },
        document: {
          include: {
            lines: { orderBy: { lineNumber: 'asc' } },
            storeSalePayments: { orderBy: { position: 'asc' } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
      take: 50,
    });

    return receipts
      .filter((receipt) => receipt.device?.enabled)
      .map((receipt) => ({
        receiptId: receipt.id,
        status: receipt.status,
        errorMessage: receipt.errorMessage,
        createdAt: receipt.createdAt,
        totalMinor: receipt.document.totalMinor,
        payload: buildFiscalPrintPayload({
          documentId: receipt.documentId,
          documentType:
            receipt.document.type === DocumentType.store_return ? 'return' : 'sale',
          reference: receipt.document.reference ?? '',
          device: receipt.device!,
          docLines: receipt.document.lines.map((line) => ({
            description: line.description,
            quantity: line.quantity,
            lineGrossTotalMinor: line.lineGrossTotalMinor,
            vatSnapshot: line.vatSnapshot,
          })),
          paymentRows: receipt.document.storeSalePayments.map((row) => ({
            method: row.method,
            methodNote: row.methodNote,
            amountMinor: row.amountMinor,
          })),
          original: receipt.original,
        }),
      }));
  }
}
