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
/** I valori commerciali della variante nella forma canonica del canale. */
export interface VariantChannelFields {
  readonly sku?: string;
  readonly barcode?: string;
  readonly price: string;
  readonly compareAtPrice?: string;
}

/**
 * Ciò che di una variante finisce su Shopify — e UNA sola volta: la riga REST
 * e l'input GraphQL si compongono da qui, non da due elenchi separati.
 *
 * Prezzo del canale Shopify: valore proprio, indipendente dal prezzo articolo,
 * nessun ripiego (§B, modello definitivo). ⚠️ Il barrato assente resta assente:
 * la chiave non entra proprio — mandare `0.00` significherebbe dichiarare uno
 * sconto del 100%.
 */
export function variantChannelFields(
  variant: Pick<VariantForPayload, 'sku' | 'barcode' | 'shopifyPriceMinor'>,
  compareAtPriceMinor: number | null,
): VariantChannelFields {
  return {
    sku: variant.sku ?? undefined,
    barcode: variant.barcode ?? undefined,
    price: minorToShopifyDecimal(Number(variant.shopifyPriceMinor)),
    ...(compareAtPriceMinor != null
      ? { compareAtPrice: minorToShopifyDecimal(compareAtPriceMinor) }
      : {}),
  };
}
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

    // I valori commerciali vengono dalla funzione comune: la riga REST li
    // rinomina soltanto nella grafia snake_case del vecchio percorso.
    const fields = variantChannelFields(variant, compareAtPriceMinor);
    const row: Record<string, unknown> = {
      sku: fields.sku,
      price: fields.price,
      barcode: fields.barcode,
      inventory_management: 'shopify',
    };
    // Nessun barrato: la chiave NON entra nella riga (`null` non è zero, regole-gestionale).
    if (fields.compareAtPrice !== undefined) {
      row['compare_at_price'] = fields.compareAtPrice;
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

/** Riga di `productVariantsBulkUpdate`: stessa forma canonica, chiavi GraphQL. */
export interface VariantBulkInput {
  readonly id: string;
  readonly price: string;
  readonly compareAtPrice?: string;
  readonly barcode?: string;
  readonly inventoryItem?: { readonly sku?: string };
}

/**
 * Da campi canonici a input GraphQL. Un campo assente NON entra nell'input, e
 * Shopify non tocca il valore remoto — come il REST con la chiave omessa, e per
 * la stessa ragione: `null` non è zero. Deciso qui, non dai chiamanti.
 */
export function variantBulkInput(
  remoteGid: string,
  fields: VariantChannelFields,
): VariantBulkInput {
  return {
    id: remoteGid,
    price: fields.price,
    ...(fields.compareAtPrice !== undefined ? { compareAtPrice: fields.compareAtPrice } : {}),
    ...(fields.barcode !== undefined ? { barcode: fields.barcode } : {}),
    ...(fields.sku !== undefined ? { inventoryItem: { sku: fields.sku } } : {}),
  };
}
