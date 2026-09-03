import { ProductStatus } from '@prisma/client';

import { plainTextToShopifyBodyHtml, normalizeProductDescription } from './shopify-html.util';

export type ShopifyProductStatus = 'ACTIVE' | 'DRAFT' | 'ARCHIVED';

/** Ciò che del PRODOTTO va sul canale, nella forma canonica. */
export interface ProductChannelFields {
  readonly title: string;
  readonly descriptionHtml: string;
  readonly vendor?: string;
  readonly productType?: string;
  /** Assente se non ci sono tag: la chiave non entra proprio. */
  readonly tags?: readonly string[];
  readonly status: ShopifyProductStatus;
}

export interface ProductForChannel {
  readonly name: string;
  /** Il «Nome online». `null` = mai inizializzato: vedi `productChannelFields`. */
  readonly shopifyTitle: string | null;
  readonly description: string | null;
  readonly brand: string | null;
  readonly category: string | null;
  readonly tags: readonly string[];
  readonly status: ProductStatus;
}

/** Lo stato Shopify segue il `ProductStatus` locale: è il riallineamento (docs/24 §1.8). */
export function shopifyProductStatus(status: ProductStatus): ShopifyProductStatus {
  switch (status) {
    case ProductStatus.active:
      return 'ACTIVE';
    case ProductStatus.archived:
      return 'ARCHIVED';
    default:
      return 'DRAFT';
  }
}

/**
 * I campi prodotto che vanno a Shopify — UNA volta: la riga REST li rinomina in
 * snake_case, l'input GraphQL li usa com'è. Erano elencati due volte, e una
 * decisione elencata due volte diverge al primo campo aggiunto.
 */
/**
 * ⛔ Il titolo che va al canale è il **Nome online**, non il nome interno. Il
 *    ripiego su `name` vale SOLO per un prodotto che su Shopify non c'è ancora:
 *    su uno già collegato, chi chiama deve aver inizializzato `shopifyTitle`
 *    LEGGENDOLO da Shopify — altrimenti questo ripiego sovrascriverebbe il
 *    titolo online con quello di magazzino, che è il danno da cui nasce il campo.
 */
export function productChannelFields(product: ProductForChannel): ProductChannelFields {
  return {
    title: product.shopifyTitle ?? product.name,
    descriptionHtml: plainTextToShopifyBodyHtml(normalizeProductDescription(product.description)),
    vendor: product.brand ?? undefined,
    productType: product.category ?? undefined,
    tags: product.tags.length > 0 ? [...product.tags] : undefined,
    status: shopifyProductStatus(product.status),
  };
}
