import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

/**
 * Primo utilizzo della sezione Listini in anagrafica: modalità IVATO (scelta
 * cliente). Da qui in poi vale l'ultima modalità scelta dall'operatore.
 */
export const PRODUCT_LISTINO_FIRST_USE_INCLUDES_VAT = true;

/**
 * Preferenza operatore della modalità prezzo (netto/ivato) della sezione Listini
 * in anagrafica articolo. Stessa logica di DocumentPriceModePreferenceService:
 * alla creazione di un articolo nuovo si ricorda la scelta; alla creazione
 * successiva si ripropone. Per (tenant, utente). Al primo utilizzo, senza
 * preferenza salvata, vale IVATO. La modifica di un articolo esistente NON
 * aggiorna la preferenza: solo la creazione lo fa.
 */
@Injectable()
export class ProductPriceModePreferenceService {
  constructor(private readonly prisma: PrismaService) {}

  /** Modalità da proporre all'articolo nuovo: preferenza salvata ?? primo utilizzo. */
  async resolvePricesIncludeVat(tenantId: string, userId: string): Promise<boolean> {
    const row = await this.prisma.userProductPriceModePreference.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
    });
    return row?.pricesIncludeVat ?? PRODUCT_LISTINO_FIRST_USE_INCLUDES_VAT;
  }

  /** Ricorda la modalità scelta (da chiamare solo alla creazione, non in modifica). */
  async remember(tenantId: string, userId: string, pricesIncludeVat: boolean): Promise<void> {
    await this.prisma.userProductPriceModePreference.upsert({
      where: { tenantId_userId: { tenantId, userId } },
      create: { tenantId, userId, pricesIncludeVat },
      update: { pricesIncludeVat },
    });
  }
}
