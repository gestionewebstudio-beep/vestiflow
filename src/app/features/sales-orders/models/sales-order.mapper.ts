// Mapper di sola lettura DTO -> dominio per le vendite. Nessuna logica
// applicativa: trasformazione 1:1 della forma, opzionali preservati. Nessun
// mapper dominio -> DTO: le vendite sono read-only in questa fase.

import type { SalesOrder, SalesOrderLine } from '@core/models/sales-order.model';

import type { SalesOrderDto, SalesOrderLineDto } from './sales-order.dto';

function lineFromDto(dto: SalesOrderLineDto): SalesOrderLine {
  return {
    id: dto.id,
    variantId: dto.variantId,
    sku: dto.sku,
    title: dto.title,
    quantity: dto.quantity,
    unitPrice: dto.unitPrice,
    lineTotal: dto.lineTotal,
  };
}

export function salesOrderFromDto(dto: SalesOrderDto): SalesOrder {
  return {
    id: dto.id,
    tenantId: dto.tenantId,
    orderNumber: dto.orderNumber,
    financialStatus: dto.financialStatus,
    fulfillmentStatus: dto.fulfillmentStatus,
    source: dto.source,
    currency: dto.currency,
    customerId: dto.customerId,
    customerName: dto.customerName,
    customerEmail: dto.customerEmail,
    storeId: dto.storeId,
    lines: dto.lines.map(lineFromDto),
    subtotal: dto.subtotal,
    total: dto.total,
    placedAt: dto.placedAt,
    shopify: dto.shopify,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  };
}
