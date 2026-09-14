/**
 * ⭐ **SKU e barcode in arrivo da Shopify: si importano e si SEGNALANO, mai si
 *    rifiutano, mai si inventano, mai si fondono.**
 *
 * `regole-gestionale`, clausola di realtà: Shopify non garantisce SKU univoci
 * né presenti — «vanno importati e segnalati come anomalie da risolvere, non
 * rifiutati». E il barcode duplicato nel tenant è un blocco di integrità
 * (`@@unique([tenantId, barcode])`): non si può assegnare due volte.
 *
 * ⛔ **Difetto 26.1 / prova D5** (`DA-FARE`): un barcode già presente su un'altra
 *    variante faceva cadere l'INSERT con 23505 e l'intero prodotto finiva fra i
 *    `failed` — «Conflitto su SKU o codici prodotto». Un catalogo imperfetto,
 *    che è il catalogo normale di un cliente, non entrava.
 *
 * Le regole applicate, e nient'altro:
 * - **SKU** assente o già preso → si importa con un suffisso deterministico
 *   (`<sku>-<variantId>` o `SHOPIFY-<variantId>`), come prima; ⭐ ora si
 *   **segnala**: chi legge sa che quello SKU non è quello di Shopify.
 * - **Barcode** già presente su un'altra variante del tenant, o ripetuto nello
 *   stesso prodotto → la variante entra **senza barcode** e si segnala CHI lo
 *   ha già. ⛔ Nessun barcode inventato (sarebbe un EAN falso), nessuna
 *   fusione con la variante che lo possiede, nessuno scarto silenzioso: il
 *   messaggio va in `shopifyLastError` del prodotto, con stato `out_of_sync`,
 *   e resta finché l'anomalia resta — ogni import lo ricalcola.
 * - Il push NON cancella il barcode remoto: `variant-payload` omette la chiave
 *   quando il barcode locale è nullo.
 */

export interface VarianteInArrivo {
  readonly id: number;
  readonly sku: string | null;
  readonly barcode: string | null;
  readonly title?: string | null;
}

export interface CodiciDecisi {
  readonly sku: string;
  readonly barcode: string | null;
}

export interface DecisioneCodici {
  /** Per id variante Shopify: lo SKU e il barcode da scrivere. */
  readonly perVariante: ReadonlyMap<number, CodiciDecisi>;
  /** Le anomalie, una frase ciascuna, nell'ordine delle varianti. Vuoto = nessuna. */
  readonly anomalie: readonly string[];
}

/**
 * Decide SKU e barcode di ogni variante in arrivo.
 *
 * @param skuPresi     gli SKU già nel tenant (minuscoli), ESCLUSE le varianti di
 *                     questo stesso prodotto — che con lo SKU corrente vanno d'accordo
 * @param barcodePresi barcode → «chi lo ha» (es. `SKU-1 «Maglia»`), stesse esclusioni
 */
export function decidiCodiciImport(
  varianti: readonly VarianteInArrivo[],
  skuPresi: ReadonlySet<string>,
  barcodePresi: ReadonlyMap<string, string>,
): DecisioneCodici {
  const skuRiservati = new Set(skuPresi);
  const barcodeRiservati = new Map(barcodePresi);
  const perVariante = new Map<number, CodiciDecisi>();
  const anomalie: string[] = [];

  for (const variante of varianti) {
    const etichetta = variante.title?.trim()
      ? `variante «${variante.title.trim()}»`
      : `variante ${variante.id}`;

    const skuOriginale = variante.sku?.trim() ?? '';
    const sku = risolviSku(skuRiservati, skuOriginale, variante.id);
    skuRiservati.add(sku.toLowerCase());
    if (sku !== skuOriginale) {
      anomalie.push(
        skuOriginale
          ? `SKU «${skuOriginale}» già presente: ${etichetta} importata come «${sku}»`
          : `SKU assente su Shopify: ${etichetta} importata come «${sku}»`,
      );
    }

    const barcodeOriginale = variante.barcode?.trim() || null;
    let barcode: string | null = barcodeOriginale;
    if (barcodeOriginale) {
      const proprietario = barcodeRiservati.get(barcodeOriginale);
      if (proprietario) {
        barcode = null;
        anomalie.push(
          `Barcode «${barcodeOriginale}» non assegnato a ${etichetta}: già su ${proprietario}. ` +
            'Da risolvere in anagrafica; nessun barcode inventato.',
        );
      } else {
        barcodeRiservati.set(barcodeOriginale, `«${sku}» di questo stesso articolo`);
      }
    }

    perVariante.set(variante.id, { sku, barcode });
  }

  return { perVariante, anomalie };
}

/** Lo SKU da scrivere: quello di Shopify se libero, altrimenti un suffisso deterministico. */
function risolviSku(riservati: ReadonlySet<string>, sku: string, shopifyVariantId: number): string {
  if (sku && !riservati.has(sku.toLowerCase())) {
    return sku;
  }
  const ripiego = sku ? `${sku}-${shopifyVariantId}` : `SHOPIFY-${shopifyVariantId}`;
  if (!riservati.has(ripiego.toLowerCase())) {
    return ripiego;
  }
  return `SHOPIFY-${shopifyVariantId}-${Date.now()}`;
}

/** Il testo per `shopifyLastError`: le anomalie dopo l'eventuale errore di categoria. */
export function testoAnomalieImport(
  erroreCategoria: string | null | undefined,
  anomalie: readonly string[],
): string | null {
  const voci = [erroreCategoria?.trim() || null, ...anomalie].filter((v): v is string =>
    Boolean(v),
  );
  return voci.length > 0 ? voci.join(' · ') : null;
}
