import { IsEnum, IsISO8601, IsOptional } from 'class-validator';
import { DocumentType } from '@prisma/client';

const GOODS_RECEIPT_FROM_PO_TYPES = [
  DocumentType.goods_receipt,
  DocumentType.supplier_ddt,
  DocumentType.supplier_invoice_accompanying,
] as const;

type GoodsReceiptFromPoType = (typeof GOODS_RECEIPT_FROM_PO_TYPES)[number];

/** Body opzionale per creare bozza arrivo merce da ordine fornitore (§10.1). */
export class CreateGoodsReceiptFromSupplierOrderDto {
  @IsOptional()
  @IsEnum(GOODS_RECEIPT_FROM_PO_TYPES)
  type?: GoodsReceiptFromPoType;

  @IsOptional()
  @IsISO8601()
  documentDate?: string;
}
