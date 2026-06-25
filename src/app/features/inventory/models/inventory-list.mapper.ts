import type { InventoryLevelApiRow } from '@core/api/domain-api.mapper';
import { mapInventoryLevelApiRow } from '@core/api/domain-api.mapper';
import type { InventoryLevel } from '@core/models/inventory-level.model';

import { variantTitle } from '@features/products/models/product-variant.util';

export interface InventoryLevelListItem extends InventoryLevel {
  readonly displaySku: string;
  readonly displayTitle: string;
  readonly locationName?: string;
}

/** Mappa una riga giacenza API con ref variante/location per display in tabella. */
export function mapInventoryLevelListItem(row: InventoryLevelApiRow): InventoryLevelListItem {
  const level = mapInventoryLevelApiRow(row);
  const productName = row.variant?.product.name ?? '';
  const suffix = row.variant?.optionValues ? variantTitle(row.variant.optionValues) : '';
  const title = productName
    ? suffix
      ? `${productName} — ${suffix}`
      : productName
    : level.variantId;

  return {
    ...level,
    displaySku: row.variant?.sku ?? level.variantId,
    displayTitle: title,
    locationName: row.location?.name,
  };
}
