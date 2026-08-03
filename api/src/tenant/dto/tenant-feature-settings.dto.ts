import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class TenantFeatureSettingsDto {
  lotsEnabled!: boolean;
  serialsEnabled!: boolean;
  variantsEnabled!: boolean;
  barcodeScannerEnabled!: boolean;
  supplierOrdersEnabled!: boolean;
  goodsReceiptEnabled!: boolean;
  warehouseValuationEnabled!: boolean;
  allowNegativeInventory!: boolean;
  warnNegativeInventory!: boolean;
  blockNegativeInventory!: boolean;
  defaultUnitOfMeasure!: string;
  defaultVatCodeId!: string | null;
  // ── Listini aggiuntivi (§B): tre posizioni fisse, rinominabili e attivabili.
  // Il nome null significa "usa l'etichetta di default" (Listino 1/2/3): così
  // un tenant che non li ha mai configurati vede comunque nomi sensati.
  listino1Name!: string | null;
  listino1Active!: boolean;
  listino2Name!: string | null;
  listino2Active!: boolean;
  listino3Name!: string | null;
  listino3Active!: boolean;
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
}
