import type { FiscalDeviceBrand } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export const FISCAL_DEVICE_BRANDS = ['epson', 'custom', 'rch', 'olivetti', 'other'] as const;

/** Mappa aliquota IVA → reparto configurato a bordo stampante. */
export class VatDepartmentDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  ratePercent!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(99)
  department!: number;
}

/** Configurazione della stampante fiscale di una sede (upsert per location). */
export class UpsertFiscalDeviceDto {
  @IsIn(FISCAL_DEVICE_BRANDS)
  brand!: FiscalDeviceBrand;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  model?: string;

  /**
   * Endpoint LAN della stampante (es. `https://192.168.1.50`). Lo chiama il
   * browser in negozio: qui si valida solo la forma, la raggiungibilità la
   * verifica la cassa.
   */
  @IsString()
  @MaxLength(200)
  @Matches(/^https?:\/\/\S+$/, {
    message: 'Endpoint non valido: atteso l’indirizzo http(s) della stampante.',
  })
  endpoint!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  serialNumber?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  /** Mappa aliquota → reparto (assente = azzera la mappa). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => VatDepartmentDto)
  vatDepartments?: VatDepartmentDto[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
