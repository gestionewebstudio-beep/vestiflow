import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsIn, IsISO8601, IsOptional, IsString, IsUUID } from 'class-validator';
import { DocumentStatus, DocumentType } from '@prisma/client';

import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class ListDocumentsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(DocumentType)
  type?: DocumentType;

  /** Filtro multi-tipo (es. registro Arrivi merce). Valori separati da virgola. */
  @IsOptional()
  @Transform(({ value }) => {
    if (value == null || value === '') {
      return undefined;
    }
    const raw = Array.isArray(value) ? value : String(value).split(',');
    return raw.map((entry) => String(entry).trim()).filter(Boolean);
  })
  @IsEnum(DocumentType, { each: true })
  types?: DocumentType[];

  @IsOptional()
  @IsEnum(DocumentStatus)
  status?: DocumentStatus;

  @IsOptional()
  @IsISO8601()
  dateFrom?: string;

  @IsOptional()
  @IsISO8601()
  dateTo?: string;

  @IsOptional()
  @IsUUID()
  supplierOrderId?: string;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @IsOptional()
  @IsUUID()
  locationId?: string;

  /** Stato collegamento fattura per Arrivi merce (prompt §3-4). */
  @IsOptional()
  @IsIn(['suspended', 'linked', 'cancelled'])
  linkStatus?: 'suspended' | 'linked' | 'cancelled';

  /** Filtro causale di carico (match parziale su causalText). */
  @IsOptional()
  @IsString()
  causal?: string;

  /** Filtro tipo documento fornitore strutturato (DDT/Fattura/Reso/…, Arrivi merce). */
  @IsOptional()
  @IsUUID()
  externalDocumentTypeId?: string;

  @IsOptional()
  @Transform(({ value }) => value === '1' || value === 'true' || value === true)
  @IsBoolean()
  accountant?: boolean;

  /** DDT vendita confermati senza bozza fattura derivata. */
  @IsOptional()
  @Transform(({ value }) => value === '1' || value === 'true' || value === true)
  @IsBoolean()
  pendingInvoice?: boolean;
}
