import type { VariantSummary } from '../models/variant-summary.model';

import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';
import { formatMoney } from '@core/utils/money.util';

/** Opzioni di rendering delle voci variante. */
export interface VariantSelectMenuOptions {
  /**
   * Permesso "Visualizza costi d'acquisto" (dato sensibile §permessi).
   * Default `false`: senza una scelta esplicita del chiamante il costo NON
   * viene mostrato, così un nuovo punto d'uso non lo espone per dimenticanza.
   */
  readonly canSeeCosts?: boolean;
}

function variantOptionDetail(variant: VariantSummary, canSeeCosts: boolean): string {
  const parts: string[] = [variant.sku];
  if (variant.barcode) {
    parts.push(`EAN ${variant.barcode}`);
  }
  if (canSeeCosts && variant.purchasePrice && variant.purchasePrice.amountMinor > 0) {
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

/**
 * Opzioni select-menu per varianti: titolo, SKU, barcode e — solo con il
 * permesso "Visualizza costi d'acquisto" — l'ultimo costo.
 */
export function toVariantSelectMenuOptions(
  variants: readonly VariantSummary[],
  options: VariantSelectMenuOptions = {},
): readonly SelectMenuOption[] {
  const canSeeCosts = options.canSeeCosts ?? false;
  return variants.map((variant) => ({
    value: variant.variantId,
    label: variant.title,
    detail: variantOptionDetail(variant, canSeeCosts),
  }));
}
