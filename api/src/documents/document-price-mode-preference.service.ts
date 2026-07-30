import { Injectable } from '@nestjs/common';
import type { DocumentType } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { firstUsePricesIncludeVat } from './document-price-mode.util';

/**
 * Preferenza operatore della modalità prezzo (netto/ivato) per tipo documento.
 * Alla creazione di un documento nuovo si ricorda la scelta; alla creazione
 * successiva dello stesso tipo si ripropone. Per (tenant, utente, tipo). Al
 * primo utilizzo, senza preferenza salvata, vale il default per tipo (vendita
 * ivato, acquisto netto). La modifica di un documento esistente NON aggiorna la
 * preferenza: solo la creazione lo fa.
 */
@Injectable()
export class DocumentPriceModePreferenceService {
  constructor(private readonly prisma: PrismaService) {}

  /** Modalità da proporre al documento nuovo: preferenza salvata ?? primo utilizzo. */
  async resolvePricesIncludeVat(
    tenantId: string,
    userId: string,
    documentType: DocumentType,
  ): Promise<boolean> {
    const row = await this.prisma.userDocumentPriceModePreference.findUnique({
      where: { tenantId_userId_documentType: { tenantId, userId, documentType } },
    });
    return row?.pricesIncludeVat ?? firstUsePricesIncludeVat(documentType);
  }

  /** Ricorda la modalità scelta (da chiamare solo alla creazione, non in modifica). */
  async remember(
    tenantId: string,
    userId: string,
    documentType: DocumentType,
    pricesIncludeVat: boolean,
  ): Promise<void> {
    await this.prisma.userDocumentPriceModePreference.upsert({
      where: { tenantId_userId_documentType: { tenantId, userId, documentType } },
      create: { tenantId, userId, documentType, pricesIncludeVat },
      update: { pricesIncludeVat },
    });
  }
}
