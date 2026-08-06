import { IsEnum } from 'class-validator';
import { DocumentType } from '@prisma/client';

const CONVERT_TARGET_TYPES = [DocumentType.sales_ddt, DocumentType.invoice_draft] as const;

export class ConvertDocumentDto {
  @IsEnum(CONVERT_TARGET_TYPES)
  targetType!: (typeof CONVERT_TARGET_TYPES)[number];
}
