import { IsIn, IsInt, IsISO8601, IsOptional, IsString, MaxLength, Min } from 'class-validator';

/**
 * Snapshot indirizzo di testata DDT vendita (prompt DDT §INDIRIZZI):
 * intestatario e destinazione condividono lo stesso schema. Persistito come
 * JSON sul documento — è una fotografia al salvataggio, mai un riferimento
 * vivo all'anagrafica.
 */
export class DocumentAddressDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  zip?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  province?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  country?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  fiscalCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  vatNumber?: string;
}

/** Porto del trasporto: franco (spese al mittente) o assegnato (al destinatario). */
export const TRANSPORT_PORT_VALUES = ['franco', 'assegnato'] as const;
export type TransportPortValue = (typeof TRANSPORT_PORT_VALUES)[number];

/** Campi trasporto condivisi tra Create/Update (prompt DDT §TRASPORTO). */
export class DocumentTransportFieldsDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  transportCausal?: string | null;

  /** Data e ora inizio trasporto (ISO 8601, anche con orario). */
  @IsOptional()
  @IsISO8601()
  transportStartAt?: string | null;

  @IsOptional()
  @IsIn(TRANSPORT_PORT_VALUES)
  transportPort?: TransportPortValue | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  transportCarrier?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  transportPackagesCount?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  transportWeight?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  transportGoodsAspect?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  transportShippingCode?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  transportTrackingCode?: string | null;
}
