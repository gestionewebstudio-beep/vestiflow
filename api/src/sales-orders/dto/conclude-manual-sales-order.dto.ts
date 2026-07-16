import { IsString, MaxLength } from 'class-validator';

/**
 * "Concludi ordine": tipo del documento di scarico da generare. Validato a
 * runtime contro DOCUMENT_STOCK_UNLOAD_TYPES (non con IsEnum: nuovi tipi di
 * scarico futuri devono entrare nella tendina senza toccare questo DTO).
 */
export class ConcludeManualSalesOrderDto {
  @IsString()
  @MaxLength(60)
  documentType!: string;
}
