import { Injectable } from '@nestjs/common';
import type { TenantFeatureSettings } from '@prisma/client';

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
  defaultUnitOfMeasure: 'pz',
  defaultVatCodeId: null,
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
  ): Promise<TenantFeatureSettingsDto> {
    await this.getOrCreate(tenantId);
    const row = await this.prisma.tenantFeatureSettings.update({
      where: { tenantId },
      data: dto,
    });
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
      defaultUnitOfMeasure: row.defaultUnitOfMeasure,
      defaultVatCodeId: row.defaultVatCodeId,
      listino1Name: row.listino1Name,
      listino1Active: row.listino1Active,
      listino2Name: row.listino2Name,
      listino2Active: row.listino2Active,
      listino3Name: row.listino3Name,
      listino3Active: row.listino3Active,
    };
  }
}
