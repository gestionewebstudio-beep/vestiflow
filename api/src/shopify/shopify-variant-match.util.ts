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
  readonly criterio: 'sku' | 'barcode' | 'opzioni';
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

  const abbinate: VariantMatched[] = [];
  const nonAbbinate: VariantUnmatched[] = [];
  const usate = new Set<string>();

  for (const variant of local) {
    if (variant.shopifyVariantId) {
      continue;
    }
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
