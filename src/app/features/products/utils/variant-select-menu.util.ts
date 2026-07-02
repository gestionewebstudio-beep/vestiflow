import type { VariantSummary } from '../models/variant-summary.model';

import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';
import { formatMoney } from '@core/utils/money.util';

function variantOptionDetail(variant: VariantSummary): string {
  const parts: string[] = [variant.sku];
  if (variant.barcode) {
    parts.push(`EAN ${variant.barcode}`);
  }
  if (variant.purchasePrice && variant.purchasePrice.amountMinor > 0) {
    parts.push(`Costo ${formatMoney(variant.purchasePrice)}`);
  }
  if (variant.supplierSku) {
    parts.push(`Cod. forn. ${variant.supplierSku}`);
  }
  if (variant.stockOnHand != null) {
    parts.push(`Giac. ${variant.stockOnHand}`);
  }
  return parts.join(' · ');
}

/** Opzioni select-menu per varianti: titolo, SKU, barcode e ultimo costo. */
export function toVariantSelectMenuOptions(
  variants: readonly VariantSummary[],
): readonly SelectMenuOption[] {
  return variants.map((variant) => ({
    value: variant.variantId,
    label: variant.title,
    detail: variantOptionDetail(variant),
  }));
}
