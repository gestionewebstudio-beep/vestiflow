import { legacyIdFromGid } from './shopify-money.util';

/**
 * Abbinamento delle varianti locali SENZA `shopifyVariantId` alle varianti del
 * prodotto Shopify già collegato (docs/24 §1.8, tranche preliminare).
 *
 * ⛔ **Solo dentro il prodotto collegato, solo se univoco, mai in silenzio.**
 * Con zero o più di una corrispondenza la variante resta scollegata e
 * l'abbinamento FALLISCE: è un errore di sincronizzazione visibile, non un
 * salto. E non si crea niente: una variante che manca su Shopify è una
 * decisione dell'operatore, non un effetto collaterale del push.
 *
 * I criteri si provano in ordine — SKU, poi barcode, poi opzioni — e un
 * criterio vale solo se produce ESATTAMENTE una candidata: se ne produce due,
 * l'abbinamento è ambiguo e non si passa al criterio successivo, perché
 * «univoco e verificabile» significa che un solo dato deve bastare.
 *
 * ⭐ **La variante BASE è il quarto criterio, e non confronta niente**: un
 * prodotto semplice in VestiFlow ha UNA variante senza opzioni, e su Shopify lo
 * stesso prodotto ha la variante «Default Title». Sono la stessa cosa, e
 * l'abbinamento è deterministico perché non c'è nient'altro da scegliere: una
 * locale libera, una remota libera, entrambe senza dati che le distinguano.
 *
 * ⛔ Basta un dato che le distingua e il criterio NON si applica: uno SKU o un
 * barcode da una delle due parti, un'opzione commerciale vera, o più di una
 * candidata per lato. In quei casi si torna al comportamento di prima —
 * l'abbinamento fallisce e il push si ferma con un errore visibile.
 */
export interface LocalVariantForMatch {
  readonly id: string;
  readonly sku: string | null;
  readonly barcode: string | null;
  readonly optionValues: unknown;
  readonly shopifyVariantId: string | null;
}

export interface RemoteVariantForMatch {
  /** GID Shopify della variante. */
  readonly id: string;
  readonly sku: string | null;
  readonly barcode: string | null;
  readonly inventoryItemId: string | null;
  readonly selectedOptions: readonly { readonly name: string; readonly value: string }[];
}

export interface VariantMatched {
  readonly localId: string;
  readonly remote: RemoteVariantForMatch;
  readonly criterio: 'sku' | 'barcode' | 'opzioni' | 'base';
}

export interface VariantUnmatched {
  readonly localId: string;
  readonly sku: string | null;
  readonly esito: 'nessuna' | 'ambigua';
  readonly candidate: number;
}

export interface VariantMatchResult {
  readonly abbinate: readonly VariantMatched[];
  readonly nonAbbinate: readonly VariantUnmatched[];
}

function norm(value: string | null | undefined): string | null {
  const trimmed = value?.trim().toLowerCase() ?? '';
  return trimmed === '' ? null : trimmed;
}

function optionKey(entries: readonly { readonly name: string; readonly value: string }[]): string {
  return entries
    .map((entry) => `${norm(entry.name) ?? ''}=${norm(entry.value) ?? ''}`)
    .sort()
    .join('|');
}

function localOptionKey(optionValues: unknown): string | null {
  if (!Array.isArray(optionValues) || optionValues.length === 0) {
    return null;
  }
  const entries = optionValues.filter(
    (row): row is { name: string; value: string } =>
      typeof row === 'object' &&
      row !== null &&
      typeof (row as { name?: unknown }).name === 'string' &&
      typeof (row as { value?: unknown }).value === 'string',
  );
  return entries.length === 0 ? null : optionKey(entries);
}

/** Una locale senza niente che la distingua: né identificativi né opzioni. */
function isVarianteBaseLocale(variant: LocalVariantForMatch): boolean {
  return (
    norm(variant.sku) === null &&
    norm(variant.barcode) === null &&
    localOptionKey(variant.optionValues) === null
  );
}

/**
 * Una remota altrettanto nuda. ⚠️ «Default Title» NON è un'opzione commerciale:
 * è il segnaposto che Shopify mette quando il prodotto non ha varianti vere.
 *
 * ⚠️ Il confronto è **insensibile alle maiuscole**, e qui è una scelta: questo
 * predicato decide se COLLEGARE due varianti, quindi un `title` minuscolo che
 * arriva da un'API o da un import non deve impedire l'abbinamento. Il
 * `isShopifyDefaultOption` di `common/variant-label.util` confronta invece
 * esatto, perché lì decide che cosa MOSTRARE a chi guarda — e un'etichetta
 * scritta diversamente è un'etichetta diversa. ⛔ I due predicati restano
 * separati finché la differenza è questa; se un giorno decidessero la stessa
 * cosa, va tenuto uno solo.
 */
function isVarianteBaseRemota(candidate: RemoteVariantForMatch): boolean {
  if (norm(candidate.sku) !== null || norm(candidate.barcode) !== null) {
    return false;
  }
  if (candidate.selectedOptions.length === 0) {
    return true;
  }
  return (
    candidate.selectedOptions.length === 1 &&
    norm(candidate.selectedOptions[0]?.name) === 'title' &&
    norm(candidate.selectedOptions[0]?.value) === 'default title'
  );
}

export function matchOrphanVariants(
  local: readonly LocalVariantForMatch[],
  remote: readonly RemoteVariantForMatch[],
): VariantMatchResult {
  // Le remote già collegate a una locale non sono candidate per nessun'altra.
  const giaCollegate = new Set(
    local
      .map((variant) => variant.shopifyVariantId)
      .filter((id): id is string => !!id)
      .map(legacyIdFromGid),
  );
  const libere = remote.filter((candidate) => !giaCollegate.has(legacyIdFromGid(candidate.id)));

  const orfane = local.filter((variant) => !variant.shopifyVariantId);

  // ⭐ Variante BASE — si valuta PRIMA del ciclo perché guarda il conto globale
  //    (una sola per lato), non la singola riga.
  if (
    orfane.length === 1 &&
    libere.length === 1 &&
    isVarianteBaseLocale(orfane[0]!) &&
    isVarianteBaseRemota(libere[0]!)
  ) {
    return {
      abbinate: [{ localId: orfane[0]!.id, remote: libere[0]!, criterio: 'base' }],
      nonAbbinate: [],
    };
  }

  const abbinate: VariantMatched[] = [];
  const nonAbbinate: VariantUnmatched[] = [];
  const usate = new Set<string>();

  for (const variant of orfane) {
    const disponibili = libere.filter((candidate) => !usate.has(candidate.id));

    const criteri: readonly {
      readonly nome: VariantMatched['criterio'];
      readonly chiave: string | null;
      readonly di: (candidate: RemoteVariantForMatch) => string | null;
    }[] = [
      { nome: 'sku', chiave: norm(variant.sku), di: (c) => norm(c.sku) },
      { nome: 'barcode', chiave: norm(variant.barcode), di: (c) => norm(c.barcode) },
      {
        nome: 'opzioni',
        chiave: localOptionKey(variant.optionValues),
        di: (c) => (c.selectedOptions.length ? optionKey(c.selectedOptions) : null),
      },
    ];

    let esito: VariantMatched | VariantUnmatched | null = null;
    for (const criterio of criteri) {
      if (criterio.chiave === null) {
        continue;
      }
      const candidate = disponibili.filter((c) => criterio.di(c) === criterio.chiave);
      if (candidate.length === 1) {
        esito = { localId: variant.id, remote: candidate[0]!, criterio: criterio.nome };
        break;
      }
      if (candidate.length > 1) {
        esito = {
          localId: variant.id,
          sku: variant.sku,
          esito: 'ambigua',
          candidate: candidate.length,
        };
        break;
      }
    }

    if (esito === null) {
      nonAbbinate.push({ localId: variant.id, sku: variant.sku, esito: 'nessuna', candidate: 0 });
    } else if ('remote' in esito) {
      usate.add(esito.remote.id);
      abbinate.push(esito);
    } else {
      nonAbbinate.push(esito);
    }
  }

  return { abbinate, nonAbbinate };
}

/** Il messaggio d'errore di sincronizzazione per le varianti non abbinate. */
export function describeUnmatchedVariants(nonAbbinate: readonly VariantUnmatched[]): string {
  return nonAbbinate
    .map((entry) => {
      const nome = entry.sku ?? entry.localId;
      return entry.esito === 'ambigua'
        ? `${nome}: ${entry.candidate} varianti Shopify corrispondono`
        : `${nome}: nessuna variante Shopify corrisponde`;
    })
    .join('; ');
}
