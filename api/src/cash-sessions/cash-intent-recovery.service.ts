import { Injectable } from '@nestjs/common';
import { DocumentType } from '@prisma/client';

import type { UserProfileDto } from '../auth/dto/user-profile.dto';
import { CreationIntentService } from '../common/idempotency/creation-intent.util';
import { PrismaService } from '../prisma/prisma.service';

import { assertCashReplayContext } from './cash-context.validator';

export type CashIntentResult =
  | { readonly status: 'unconfirmed' }
  | {
      readonly status: 'recorded';
      readonly intentId: string;
      readonly documentId: string;
      readonly reference: string;
      readonly documentDate: Date;
      readonly locationName: string;
      readonly totalMinor: number;
      readonly locationId: string;
      readonly sessionId: string;
    };

/** Sola lettura: un comando illeggibile non si ricostruisce e non si reinvia. */
@Injectable()
export class CashIntentRecoveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly intents: CreationIntentService,
  ) {}

  async lookup(
    tenantId: string,
    user: UserProfileDto,
    intentId: string,
    type: 'store_sale' | 'store_return',
  ): Promise<CashIntentResult> {
    return this.prisma.$transaction(async (tx) => {
      const intent = await this.intents.readResultTx(tx, tenantId, intentId);
      if (!intent?.resultRef || intent.scope !== type) return { status: 'unconfirmed' };
      const document = await tx.document.findFirst({
        where: {
          id: intent.resultRef,
          tenantId,
          type,
          status: 'confirmed',
          cashSessionId: { not: null },
        },
        select: {
          id: true,
          reference: true,
          documentDate: true,
          location: { select: { name: true } },
          totalMinor: true,
          locationId: true,
          cashSessionId: true,
        },
      });
      if (!document?.locationId || !document.cashSessionId) return { status: 'unconfirmed' };
      // La sede viene dal documento effettivo, mai dai dati locali danneggiati.
      // Riusa gli stessi controlli del replay, anche dopo chiusura/revoca sede.
      await assertCashReplayContext(
        tx,
        tenantId,
        user,
        document.locationId,
        document.id,
        DocumentType[type],
      );
      return {
        status: 'recorded',
        intentId,
        documentId: document.id,
        reference: document.reference ?? '',
        documentDate: document.documentDate,
        locationName: document.location?.name ?? '',
        totalMinor: document.totalMinor,
        locationId: document.locationId,
        sessionId: document.cashSessionId,
      };
    });
  }
}
