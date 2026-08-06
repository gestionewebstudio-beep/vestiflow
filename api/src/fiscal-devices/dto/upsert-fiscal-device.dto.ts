import type { FiscalDeviceBrand } from '@prisma/client';
import { IsBoolean, IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export const FISCAL_DEVICE_BRANDS = ['epson', 'custom', 'rch', 'olivetti', 'other'] as const;

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

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
