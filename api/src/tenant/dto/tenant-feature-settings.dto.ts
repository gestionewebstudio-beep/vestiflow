import { PurchaseCostEntryMode, SupplierPriceUpdatePolicy } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class TenantFeatureSettingsDto {
  lotsEnabled!: boolean;
  serialsEnabled!: boolean;
  variantsEnabled!: boolean;
  barcodeScannerEnabled!: boolean;
  supplierOrdersEnabled!: boolean;
  goodsReceiptEnabled!: boolean;
  warehouseValuationEnabled!: boolean;
  updateSupplierPriceOnLoad!: SupplierPriceUpdatePolicy;
  allowNegativeInventory!: boolean;
  warnNegativeInventory!: boolean;
  blockNegativeInventory!: boolean;
  defaultUnitOfMeasure!: string;
  defaultVatCodeId!: string | null;
  defaultPurchaseCostEntryMode!: PurchaseCostEntryMode;
}

export class UpdateTenantFeatureSettingsDto {
  @IsOptional()
  @IsBoolean()
  lotsEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  serialsEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  variantsEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  barcodeScannerEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  supplierOrdersEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  goodsReceiptEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  warehouseValuationEnabled?: boolean;

  @IsOptional()
  @IsEnum(SupplierPriceUpdatePolicy)
  updateSupplierPriceOnLoad?: SupplierPriceUpdatePolicy;

  @IsOptional()
  @IsBoolean()
  allowNegativeInventory?: boolean;

  @IsOptional()
  @IsBoolean()
  warnNegativeInventory?: boolean;

  @IsOptional()
  @IsBoolean()
  blockNegativeInventory?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  defaultUnitOfMeasure?: string;

  @IsOptional()
  @IsUUID()
  defaultVatCodeId?: string;

  @IsOptional()
  @IsEnum(PurchaseCostEntryMode)
  defaultPurchaseCostEntryMode?: PurchaseCostEntryMode;
}
