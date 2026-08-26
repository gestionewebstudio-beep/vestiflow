import { ForbiddenException, Injectable } from '@nestjs/common';

import type { UserProfileDto } from '../auth/dto/user-profile.dto';
import { hasFullTenantAccess } from '../auth/user-permissions.util';
import type { TenantFeatureSettings } from '@prisma/client';

import { SALES_PRICE_MODE_TYPES } from '../documents/document-price-mode.util';
import { PrismaService } from '../prisma/prisma.service';
import type { TenantFeatureSettingsDto } from './dto/tenant-feature-settings.dto';
import type { UpdateTenantFeatureSettingsDto } from './dto/tenant-feature-settings.dto';

const DEFAULTS: Omit<TenantFeatureSettings, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'> = {
  lotsEnabled: false,
  serialsEnabled: false,
  variantsEnabled: true,
  barcodeScannerEnabled: true,
  supplierOrdersEnabled: true,
  goodsReceiptEnabled: true,
  warehouseValuationEnabled: true,
  allowNegativeInventory: false,
  warnNegativeInventory: true,
  blockNegativeInventory: false,
  // ⛔ SPENTA di default, al contrario di tutte le altre. Non riproduce il
  // comportamento precedente: e' una scelta del proprietario (26/08/2026). La
  // Vendita manuale riduce la giacenza senza StockMovement, quindi e' un
  // interruttore di sicurezza — e uno che nasce acceso protegge solo chi si
  // ricorda di spegnerlo.
  manualUnloadEnabled: false,
  defaultUnitOfMeasure: 'pz',
  defaultVatCodeId: null,
  // Ivato: è come partiva il sistema prima che l'impostazione esistesse.
  salesPricesIncludeVat: true,
  // Listini aggiuntivi: il primo attivo di default, gli altri due attivabili.
  // Nome null → la UI mostra l'etichetta di default (B3).
  listino1Name: null,
  listino1Active: true,
  listino2Name: null,
  listino2Active: false,
  listino3Name: null,
  listino3Active: false,
};

@Injectable()
export class TenantFeatureSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getOrCreate(tenantId: string): Promise<TenantFeatureSettingsDto> {
    const row = await this.prisma.tenantFeatureSettings.upsert({
      where: { tenantId },
      create: { tenantId, ...DEFAULTS },
      update: {},
    });
    return this.toDto(row);
  }

  async update(
    tenantId: string,
    dto: UpdateTenantFeatureSettingsDto,
    user?: UserProfileDto,
  ): Promise<TenantFeatureSettingsDto> {
    // ⛔ **La Vendita manuale la accende e la spegne SOLO il titolare.**
    //
    //   Non e’ una preferenza fra le altre: quel documento riduce la giacenza
    //   senza generare movimenti, e l’interruttore serve a proteggersene. Chi
    //   amministra le impostazioni non deve poterselo riaccendere.
    //
    // ⚠️ Il rifiuto e’ MIRATO al solo campo sensibile, non a tutto il PATCH: le
    //   altre impostazioni restano com’erano, e il pannello continua ad avere un
    //   solo «Salva impostazioni» invece di due chiamate.
    //
    // ⚠️ E vale anche se il valore non cambia: e’ la richiesta a non essere sua.
    //
    // ⚠️ `hasFullTenantAccess` e’ il predicato canonico, e include anche la
    //   SESSIONE ASSISTENZA: un amministratore di piattaforma che opera per
    //   conto del cliente puo’ girare l’interruttore. E’ una conseguenza
    //   dichiarata, non una svista — le sessioni di assistenza hanno gia’ pieno
    //   accesso a tutto il resto, e inventare qui un secondo predicato
    //   «proprio proprio il titolare» sarebbe il controllo parallelo che il
    //   proprietario ha chiesto di non creare.
    if (dto.manualUnloadEnabled !== undefined && !hasFullTenantAccess(user)) {
      throw new ForbiddenException(
        'Solo il titolare dell’account può attivare o disattivare la Vendita manuale.',
      );
    }
    const before = await this.getOrCreate(tenantId);
    const row = await this.prisma.tenantFeatureSettings.update({
      where: { tenantId },
      data: dto,
    });

    // Cambiare la convenzione aziendale AZZERA le memorie netto/ivato degli
    // operatori sui tipi di vendita.
    //
    // Senza questo, l'impostazione sembrerebbe rotta: il titolare mette
    // «netto», e chi ha già creato una fattura continua a vedersela nascere
    // ivata per una memoria che nessuno sa di avere. Azzerando, tutti
    // ripartono dalla convenzione nuova — e chi lavora diversamente rifà la
    // sua scelta, che da lì in poi torna a essere ricordata.
    //
    // Solo i tipi di VENDITA: i costi non hanno né convenzione aziendale né
    // memoria, partono sempre netti.
    if (
      dto.salesPricesIncludeVat !== undefined &&
      dto.salesPricesIncludeVat !== before.salesPricesIncludeVat
    ) {
      await this.prisma.userDocumentPriceModePreference.deleteMany({
        where: { tenantId, documentType: { in: [...SALES_PRICE_MODE_TYPES] } },
      });
    }

    return this.toDto(row);
  }

  private toDto(row: TenantFeatureSettings): TenantFeatureSettingsDto {
    return {
      lotsEnabled: row.lotsEnabled,
      serialsEnabled: row.serialsEnabled,
      variantsEnabled: row.variantsEnabled,
      barcodeScannerEnabled: row.barcodeScannerEnabled,
      supplierOrdersEnabled: row.supplierOrdersEnabled,
      goodsReceiptEnabled: row.goodsReceiptEnabled,
      warehouseValuationEnabled: row.warehouseValuationEnabled,
      allowNegativeInventory: row.allowNegativeInventory,
      warnNegativeInventory: row.warnNegativeInventory,
      blockNegativeInventory: row.blockNegativeInventory,
      manualUnloadEnabled: row.manualUnloadEnabled,
      defaultUnitOfMeasure: row.defaultUnitOfMeasure,
      defaultVatCodeId: row.defaultVatCodeId,
      salesPricesIncludeVat: row.salesPricesIncludeVat,
      listino1Name: row.listino1Name,
      listino1Active: row.listino1Active,
      listino2Name: row.listino2Name,
      listino2Active: row.listino2Active,
      listino3Name: row.listino3Name,
      listino3Active: row.listino3Active,
    };
  }
}
