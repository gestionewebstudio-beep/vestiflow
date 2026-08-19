import { minorToShopifyDecimal } from './shopify-money.util';

export type ProductOptionRow = { readonly name: string; readonly values: readonly string[] };
type VariantOptionRow = { readonly name: string; readonly value: string };

/** La variante nella forma minima che serve a comporre la riga per Shopify. */
export interface VariantForPayload {
  readonly sku: string | null;
  readonly barcode: string | null;
  readonly optionValues: unknown;
  readonly shopifyPriceMinor: unknown;
  readonly shopifyVariantId: string | null;
}

/**
 * Le righe variante da mandare a Shopify.
 *
 * Estratta dal servizio di push il 17/08/2026 **per poterla provare**: era un
 * metodo privato che non usava `this` — una funzione pura travestita da metodo —
 * e nessuna prova la copriva, mentre decide due valori che finiscono sotto gli
 * occhi del cliente.
 *
 * ⚠️ **`compareAtPriceMinor` è un dato dell'ARTICOLO**, non della variante:
 * l'API di Shopify lo tiene per-variante, quindi si replica identico su ognuna.
 * `null` significa «nessun prezzo barrato» e **non deve diventare `0.00`**: su
 * Shopify uno zero è un barrato vero, e il cliente vedrebbe uno sconto
 * inventato del 100%.
 *
 * ⚠️ **Resta aperta, e non la risolve questa funzione:** VestiFlow manda i due
 * prezzi senza sapere se il negozio Shopify vuole imponibili o prezzi finali
 * (`taxes_included`). Sul negozio italiano di prova manca il 18,03% su ogni
 * pezzo — vedi `PREZZI-SHOPIFY-SPEC.md` §1. Da qui i due valori escono nella
 * stessa base canonica, che è il presupposto per convertirli insieme quando
 * quella convenzione esisterà.
 */
export function buildVariantsPayload(
  options: ProductOptionRow[],
  variants: readonly VariantForPayload[],
  compareAtPriceMinor: number | null,
): {
  shopifyOptions: { name: string; values: string[] }[];
  variantRows: Record<string, unknown>[];
} {
  const effectiveOptions =
    options.length > 0 ? options : [{ name: 'Title', values: ['Default Title'] }];

  const shopifyOptions = effectiveOptions.map((option) => ({
    name: option.name,
    values: [...option.values],
  }));

  const optionNames = effectiveOptions.map((option) => option.name);

  const variantRows = variants.map((variant) => {
    const optionValues = Array.isArray(variant.optionValues)
      ? (variant.optionValues as VariantOptionRow[])
      : [];
    const byName = new Map(optionValues.map((entry) => [entry.name, entry.value]));

    const row: Record<string, unknown> = {
      sku: variant.sku ?? undefined,
      // Prezzo del canale Shopify: valore proprio, indipendente dal prezzo
      // articolo. Nessun ripiego (§B, modello definitivo).
      price: minorToShopifyDecimal(Number(variant.shopifyPriceMinor)),
      barcode: variant.barcode ?? undefined,
      inventory_management: 'shopify',
    };

    // Assente = assente. La chiave non entra proprio nella riga: mandare "0.00"
    // significherebbe dichiarare un barrato a zero.
    if (compareAtPriceMinor != null) {
      row['compare_at_price'] = minorToShopifyDecimal(compareAtPriceMinor);
    }

    if (variant.shopifyVariantId) {
      row['id'] = Number(variant.shopifyVariantId);
    }

    if (options.length === 0) {
      row['option1'] = 'Default Title';
    } else {
      if (optionNames[0]) {
        row['option1'] = byName.get(optionNames[0]) ?? optionNames[0];
      }
      if (optionNames[1]) {
        row['option2'] = byName.get(optionNames[1]);
      }
      if (optionNames[2]) {
        row['option3'] = byName.get(optionNames[2]);
      }
    }

    return row;
  });

  return { shopifyOptions, variantRows };
}
