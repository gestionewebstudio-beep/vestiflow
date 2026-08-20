import { Injectable } from '@nestjs/common';
import type { DocumentType } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { followsSalesPriceMode } from './document-price-mode.util';

/**
 * Modalità netto/ivato da proporre a un documento **nuovo**.
 *
 * Due livelli, e non ce ne sono altri:
 *
 * ```text
 * memoria dell'operatore per quel tipo  ??  convenzione aziendale
 * ```
 *
 * La memoria è una comodità: l'ultima scelta di *questa* persona su *quel* tipo,
 * scritta solo alla creazione (modificare un documento non la tocca). La
 * convenzione aziendale è la base comune, e vive in
 * `TenantFeatureSettings.salesPricesIncludeVat`.
 *
 * ⚠️ Cambiare la convenzione **azzera** le memorie dei tipi di vendita
 * (`TenantFeatureSettingsService.update`): senza, il titolare imposterebbe
 * «netto» e ognuno continuerebbe a creare ivato per una memoria che non sa di
 * avere, e l'impostazione sembrerebbe rotta.
 *
 * ⚠️ Fino al 16/08/2026 sotto la memoria non c'era la convenzione ma una
 * COSTANTE nel codice (vendita ivato, acquisto netto), e in mezzo un terzo
 * livello — `DocumentTypeSetting.pricesIncludeVat` — che nessun pannello
 * esponeva e che il `??` non raggiungeva mai, perché la maschera manda sempre
 * un valore. Sono stati sostituiti tutti e due da questa convenzione.
 *
 * ⚠️ **I COSTI non passano di qui.** Arrivo merce e Ordine fornitore partono
 * sempre netti: niente convenzione, niente memoria. Prima la modalità costo
 * veniva ricordata proprio in questa tabella, convertita in modalità prezzo da
 * un ponte — reggeva solo perché i tipi delle due famiglie non si sovrappongono.
 */
@Injectable()
export class DocumentPriceModePreferenceService {
  constructor(private readonly prisma: PrismaService) {}

  /** Modalità da proporre al documento nuovo: memoria ?? convenzione aziendale. */
  async resolvePricesIncludeVat(
    tenantId: string,
    userId: string,
    documentType: DocumentType,
  ): Promise<boolean> {
    const row = await this.prisma.userDocumentPriceModePreference.findUnique({
      where: { tenantId_userId_documentType: { tenantId, userId, documentType } },
    });
    if (row) {
      return row.pricesIncludeVat;
    }
    return this.resolveCompanyDefault(tenantId, documentType);
  }

  /**
   * La convenzione aziendale per quel tipo.
   *
   * Chi non risponde alla convenzione — famiglia acquisto, vendita al banco, tipi
   * senza prezzi — sta fuori dall'elenco e prende `false`: i costi partono
   * netti, e la cassa la sua modalità se la decide da sé
   * (`store-sales.service.ts`, sempre ivata).
   */
  async resolveCompanyDefault(tenantId: string, documentType: DocumentType): Promise<boolean> {
    if (!followsSalesPriceMode(documentType)) {
      return false;
    }
    return this.salesPricesIncludeVat(tenantId);
  }

  /** Convenzione aziendale sui prezzi di vendita (assente = ivato, come prima). */
  async salesPricesIncludeVat(tenantId: string): Promise<boolean> {
    const settings = await this.prisma.tenantFeatureSettings.findUnique({
      where: { tenantId },
      select: { salesPricesIncludeVat: true },
    });
    return settings?.salesPricesIncludeVat ?? true;
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
