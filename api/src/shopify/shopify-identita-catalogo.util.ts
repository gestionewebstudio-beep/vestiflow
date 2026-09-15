import type {
  ShopifyProductSetCreateInput,
  ShopifyProductSetVariantInput,
  ShopifyRemoteVariantConIdentita,
  ShopifyVariantCreateInput,
} from './shopify-graphql.client';
import { productChannelFields, type ProductForChannel } from './shopify-product-payload.util';
import { VESTIFLOW_METAFIELD_NAMESPACE } from './shopify-product-metadata.types';
import {
  variantChannelFields,
  type ProductOptionRow,
  type VariantForPayload,
} from './shopify-variant-payload.util';

/**
 * L'identità VestiFlow sul catalogo remoto (`docs/30` §7.2-bis).
 *
 * ⭐ Il prodotto e la variante Shopify portano un metafield di tipo `id` col loro uuid
 *    VestiFlow: `vestiflow.product_id` e `vestiflow.variant_id`. È l'unica identità con cui
 *    si riconosce un'operazione remota dopo una risposta persa, un riavvio, una richiesta
 *    concorrente o un webhook anticipato — ⛔ mai SKU, titolo o handle, che cambiano e non
 *    sono nostri. Verificato sul negozio il 15/09/2026 (contratto G1–G7): i metafield di tipo
 *    `id` hanno valori unici e una seconda creazione con lo stesso valore viene rifiutata
 *    senza lasciare un secondo prodotto; `productByIdentifier` e le varianti per metafield
 *    ritrovano tutti gli id.
 */
export const IDENTITA_PRODOTTO = {
  namespace: VESTIFLOW_METAFIELD_NAMESPACE,
  key: 'product_id',
  ownerType: 'PRODUCT',
  name: 'VestiFlow product_id',
} as const;

export const IDENTITA_VARIANTE = {
  namespace: VESTIFLOW_METAFIELD_NAMESPACE,
  key: 'variant_id',
  ownerType: 'PRODUCTVARIANT',
  name: 'VestiFlow variant_id',
} as const;

/** Il tipo di metafield delle identità: `id` = valori unici per definizione. */
export const TIPO_METAFIELD_IDENTITA = 'id';

/** Il metafield che dice «questo prodotto remoto è QUEL prodotto VestiFlow». */
export function metafieldIdentitaProdotto(productId: string) {
  return {
    namespace: IDENTITA_PRODOTTO.namespace,
    key: IDENTITA_PRODOTTO.key,
    type: TIPO_METAFIELD_IDENTITA,
    value: productId,
  };
}

export function metafieldIdentitaVariante(variantId: string) {
  return {
    namespace: IDENTITA_VARIANTE.namespace,
    key: IDENTITA_VARIANTE.key,
    type: TIPO_METAFIELD_IDENTITA,
    value: variantId,
  };
}

/** L'opzione con cui Shopify rappresenta un prodotto a variante UNICA (contratto G11). */
export const OPZIONE_VARIANTE_UNICA = { name: 'Title', values: ['Default Title'] } as const;

/**
 * Il payload di `productSet` in SOLA creazione: i campi comuni del canale
 * (`productChannelFields`), le opzioni con i valori nell'ordine locale, l'identità del
 * prodotto e TUTTE le varianti locali con la loro identità, nell'ordine locale — Shopify le
 * crea in quell'ordine (G11), senza variante iniziale. Un prodotto senza opzioni è la
 * variante unica `Title` / «Default Title».
 *
 * ⛔ Niente `id`, niente `identifier`: la creazione è creazione. ⚠️ Nessun limite né
 *    troncamento sulle varianti: si mandano tutte; un rifiuto del negozio resta un rifiuto
 *    (prodotto in errore, nessun fallback). Il contratto ha verificato fino a 3 varianti.
 */
export function buildProductSetCreateInput(
  product: ProductForChannel & { readonly id: string },
  options: readonly ProductOptionRow[],
  variants: readonly (VariantForPayload & { readonly id: string })[],
  compareAtPriceMinor: number | null,
): ShopifyProductSetCreateInput {
  const fields = productChannelFields(product);
  const opzioni: readonly ProductOptionRow[] =
    options.length > 0
      ? options
      : [{ name: OPZIONE_VARIANTE_UNICA.name, values: [...OPZIONE_VARIANTE_UNICA.values] }];
  return {
    title: fields.title,
    descriptionHtml: fields.descriptionHtml,
    vendor: fields.vendor,
    productType: fields.productType,
    tags: fields.tags ? [...fields.tags] : undefined,
    status: fields.status,
    productOptions: opzioni.map((option) => ({
      name: option.name,
      values: option.values.map((name) => ({ name })),
    })),
    metafields: [metafieldIdentitaProdotto(product.id)],
    variants: variants.map((variant) => {
      const fields = variantChannelFields(variant, compareAtPriceMinor);
      return {
        optionValues:
          options.length > 0
            ? options.flatMap((option) => {
                const valore = valoriLocali(variant, [option])[0];
                return valore ? [{ optionName: option.name, name: valore }] : [];
              })
            : [{ optionName: OPZIONE_VARIANTE_UNICA.name, name: OPZIONE_VARIANTE_UNICA.values[0] }],
        price: fields.price,
        ...(fields.compareAtPrice !== undefined ? { compareAtPrice: fields.compareAtPrice } : {}),
        ...(fields.barcode !== undefined ? { barcode: fields.barcode } : {}),
        ...(fields.sku !== undefined ? { sku: fields.sku } : {}),
        inventoryItem: { tracked: true },
        metafields: [metafieldIdentitaVariante(variant.id)],
      } satisfies ShopifyProductSetVariantInput;
    }),
  };
}

/**
 * Le righe di `productVariantsBulkCreate` per le varianti locali, ognuna con la propria
 * identità. `optionValues` viene dai valori salvati sulla variante, nell'ordine delle
 * opzioni del prodotto; un valore assente per un'opzione è un dato mancante, non si inventa.
 */
export function buildVariantCreateInputs(
  variants: readonly (VariantForPayload & { readonly id: string })[],
  options: readonly ProductOptionRow[],
  compareAtPriceMinor: number | null,
): readonly ShopifyVariantCreateInput[] {
  return variants.map((variant) => {
    const valori = Array.isArray(variant.optionValues)
      ? (variant.optionValues as readonly { name: string; value: string }[])
      : [];
    const perNome = new Map(valori.map((entry) => [entry.name, entry.value]));
    const fields = variantChannelFields(variant, compareAtPriceMinor);
    return {
      optionValues: options.flatMap((option) => {
        const valore = perNome.get(option.name);
        return valore ? [{ optionName: option.name, name: valore }] : [];
      }),
      price: fields.price,
      ...(fields.compareAtPrice !== undefined ? { compareAtPrice: fields.compareAtPrice } : {}),
      ...(fields.barcode !== undefined ? { barcode: fields.barcode } : {}),
      ...(fields.sku !== undefined ? { inventoryItem: { sku: fields.sku, tracked: true } } : {}),
      metafields: [metafieldIdentitaVariante(variant.id)],
    };
  });
}

/** I valori di opzione di una variante locale, nell'ordine delle opzioni del prodotto. */
function valoriLocali(
  variant: { readonly optionValues: unknown },
  options: readonly ProductOptionRow[],
): readonly string[] {
  const valori = Array.isArray(variant.optionValues)
    ? (variant.optionValues as readonly { name: string; value: string }[])
    : [];
  const perNome = new Map(valori.map((entry) => [entry.name, entry.value]));
  return options.map((option) => perNome.get(option.name) ?? '');
}

/**
 * Le varianti locali senza remota la cui COMBINAZIONE di opzioni è già occupata sul negozio
 * da una variante che non porta la nostra identità (la iniziale, o una fatta a mano).
 *
 * ⛔ È il conflitto che ferma il completamento PRIMA di scrivere: quella variante non si
 *    collega per opzioni, non si cancella e non si sovrascrive — decide una persona.
 *    Il confronto è sui valori delle opzioni nell'ordine del prodotto: è l'unica cosa che
 *    Shopify stesso considera per rifiutare una combinazione doppia.
 */
export function conflittiDiCombinazione(
  localiMancanti: readonly {
    readonly id: string;
    readonly sku: string | null;
    readonly optionValues: unknown;
  }[],
  remoteSenzaIdentita: readonly ShopifyRemoteVariantConIdentita[],
  options: readonly ProductOptionRow[],
): readonly {
  readonly varianteId: string;
  readonly sku: string | null;
  readonly combinazione: string;
  readonly remota: ShopifyRemoteVariantConIdentita;
}[] {
  const chiaveRemota = (remota: ShopifyRemoteVariantConIdentita): string => {
    const perNome = new Map(remota.selectedOptions.map((o) => [o.name, o.value]));
    return options.map((option) => perNome.get(option.name) ?? '').join(' / ');
  };
  const occupate = new Map(remoteSenzaIdentita.map((r) => [chiaveRemota(r), r]));
  return localiMancanti.flatMap((locale) => {
    const combinazione = valoriLocali(locale, options).join(' / ');
    const remota = occupate.get(combinazione);
    return remota ? [{ varianteId: locale.id, sku: locale.sku, combinazione, remota }] : [];
  });
}

/**
 * Abbina le varianti locali alle remote PER IDENTITÀ. Le remote senza identità nostra (la
 * variante iniziale di Shopify, o una creata a mano nell'admin) restano fuori: non sono
 * nostre e non si toccano. ⚠️ Una remota CON un'identità che non corrisponde a nessuna
 * locale (la locale è stata eliminata dopo la creazione remota) è una terza categoria:
 * si conserva, non si ricrea la locale, e il prodotto lo dichiara — non è «sincronizzato».
 */
export function abbinaVariantiPerIdentita(
  locali: readonly { readonly id: string }[],
  remote: readonly ShopifyRemoteVariantConIdentita[],
): {
  readonly abbinate: readonly {
    readonly varianteId: string;
    readonly remota: ShopifyRemoteVariantConIdentita;
  }[];
  readonly localiSenzaRemota: readonly string[];
  readonly remoteSenzaIdentita: readonly ShopifyRemoteVariantConIdentita[];
  /** Remote con un'identità VestiFlow che non è di nessuna locale: conservate e dichiarate. */
  readonly remoteConIdentitaSenzaLocale: readonly ShopifyRemoteVariantConIdentita[];
} {
  const perIdentita = new Map(remote.filter((r) => r.identita).map((r) => [r.identita!, r]));
  const abbinate = locali.flatMap((locale) => {
    const remota = perIdentita.get(locale.id);
    return remota ? [{ varianteId: locale.id, remota }] : [];
  });
  const abbinateIds = new Set(abbinate.map((a) => a.varianteId));
  const localiIds = new Set(locali.map((l) => l.id));
  return {
    abbinate,
    localiSenzaRemota: locali.filter((l) => !abbinateIds.has(l.id)).map((l) => l.id),
    remoteSenzaIdentita: remote.filter((r) => !r.identita),
    remoteConIdentitaSenzaLocale: remote.filter((r) => r.identita && !localiIds.has(r.identita)),
  };
}

/**
 * La frase per l'operatore sulle remote con identità senza locale: nomina gid e SKU, dice che
 * si conservano e che la locale NON si ricrea. Va in `shopifyLastError` (stato `out_of_sync`).
 */
export function descriviIdentitaSenzaLocale(
  remote: readonly ShopifyRemoteVariantConIdentita[],
): string | null {
  if (remote.length === 0) {
    return null;
  }
  const elenco = remote.map((r) => `${r.id}${r.sku ? ` (SKU ${r.sku})` : ''}`).join(', ');
  return (
    `Completamento su Shopify incompleto: ${remote.length === 1 ? 'una variante remota porta' : `${remote.length} varianti remote portano`} ` +
    `l'identità di ${remote.length === 1 ? 'una variante VestiFlow che non esiste più' : 'varianti VestiFlow che non esistono più'} — ${elenco}. ` +
    'Conservata sul negozio, non ricreata in VestiFlow: decidere sul negozio.'
  );
}

// ⛔ Qui vivevano `titoloVarianteIniziale` e `varianteInizialeIntatta`, la guardia sulla
//    variante iniziale di `productCreate`: controllava una fotografia della risposta, non lo
//    stato del negozio, e non poteva autorizzare una cancellazione. Con `productSet` la
//    variante iniziale non esiste (15/09/2026).

/**
 * Il tentativo di creazione è stato superato da uno più recente: non si scrive e NON si
 * chiama più Shopify. Non è un errore di rete: chi lo riceve non deve ritentare.
 */
export class ShopifyClaimSuperatoException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ShopifyClaimSuperatoException';
  }
}
