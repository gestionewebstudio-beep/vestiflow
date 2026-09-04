import { Prisma, TenantChannelProfile } from '@prisma/client';

import { sameUnitAmountAtContract } from '../common/money.util';

/**
 * Aggiornamento dei **prezzi di anagrafica** da un Arrivo merce (fetta 2 del
 * contratto della riga, `DA-FARE-FAMIGLIA-FATTURA` voce 11).
 *
 * ── Perché esiste, e perché è diverso dal costo ──────────────────────────
 *
 * Il **costo** ha un valore proprio del documento: è ciò che si è pagato, un
 * fatto del carico. Il **prezzo al pubblico** no — non c'è nessuna colonna sulla
 * riga documento, e non è una dimenticanza: il prezzo è un dato **dell'articolo**
 * (`03b` §16). Da qui la regola decisa il 16/08:
 *
 * > **Con la spunta accesa i prezzi si modificano e aggiornano l'anagrafica; con
 * > la spunta spenta restano visibili ma NON modificabili.**
 *
 * Un campo editabile il cui valore non ha destinazione sarebbe una bugia: quella
 * è esattamente la forma del difetto che questa fetta ha trovato — un valore che
 * si digita e non arriva da nessuna parte.
 *
 * ⚠️ **Non si aggiunge uno snapshot a `DocumentLine` per imitare il costo.**
 *
 * ── La politica Shopify è quella che c'è già ─────────────────────────────
 *
 * `shopifyPriceMinor` è **indipendente** da `sellingPriceMinor`: «la
 * pubblicazione legge sempre e solo questo». La regola dell'anagrafica prodotti
 * (`products.service.ts`) è:
 *
 * - **Shopify attivo** — il prezzo Shopify arriva dal form come valore proprio e
 *   si scrive così com'è; **assente = non toccare**;
 * - **Shopify spento** — il campo non esiste in interfaccia, e il prezzo Shopify
 *   segue quello di vendita **solo quando questo cambia valore**, valutato **al
 *   centesimo** (una coda decimale diversa non è un prezzo nuovo).
 *
 * Qui si riusa **quella**, identica. I due prezzi restano due dati distinti: non
 * si fondono e non si sincronizzano oltre a ciò che la politica già prevede.
 *
 * ── Variante, non articolo ───────────────────────────────────────────────
 *
 * La riga di un Arrivo merce punta a una **variante**, ed è dalla variante che
 * la maschera legge il prezzo da mostrare. Si scrive quindi la variante, con le
 * logiche che l'anagrafica usa già.
 *
 * ⚠️ **`Product.sellingPriceMinor` non viene toccato**: sul costo il livello
 * articolo ha una sua spunta separata, qui la spunta è una sola e non è stato
 * chiesto di propagare al catalogo. Se servirà, è una decisione a sé.
 */

/** Una riga di carico che porta un prezzo da scrivere in anagrafica. */
export interface ArticlePriceLine {
  readonly variantId: string | null;
  /** Prezzo al pubblico digitato. `undefined` = non inviato, non si tocca. */
  readonly sellingPriceMinor?: number;
  /** Prezzo Shopify digitato. `undefined` = non inviato, non si tocca. */
  readonly shopifyPriceMinor?: number;
}

export async function isShopifyActiveTenant(
  tx: Prisma.TransactionClient,
  tenantId: string,
): Promise<boolean> {
  const tenant = await tx.tenant.findUnique({
    where: { id: tenantId },
    select: { channelProfile: true },
  });
  return tenant?.channelProfile === TenantChannelProfile.shopify;
}

/**
 * Scrive i prezzi di anagrafica delle varianti toccate dal carico.
 *
 * Non fa niente quando la spunta è spenta: è il chiamante a non chiamarla, ma la
 * guardia resta qui perché è il posto in cui la regola è scritta.
 */
export async function applyArticlePriceUpdates(
  tx: Prisma.TransactionClient,
  tenantId: string,
  lines: readonly ArticlePriceLine[],
  params: { readonly updateArticlePrices: boolean },
): Promise<void> {
  if (!params.updateArticlePrices) {
    return;
  }

  const eligible = lines.filter(
    (line): line is ArticlePriceLine & { variantId: string } =>
      line.variantId != null &&
      (line.sellingPriceMinor !== undefined || line.shopifyPriceMinor !== undefined),
  );
  if (eligible.length === 0) {
    return;
  }

  // I prezzi attuali servono al criterio «cambiato al centesimo» con Shopify
  // spento: letti in un colpo solo, non uno per riga.
  // Il canale si legge SOLO se c’è davvero qualcosa da scrivere: un carico
  // senza prezzi non deve interrogare il tenant.
  const shopifyActive = await isShopifyActiveTenant(tx, tenantId);

  const current = new Map<string, number>();
  const variants = await tx.productVariant.findMany({
    where: { tenantId, id: { in: [...new Set(eligible.map((line) => line.variantId))] } },
    select: { id: true, sellingPriceMinor: true },
  });
  for (const variant of variants) {
    current.set(variant.id, Number(variant.sellingPriceMinor));
  }

  // ⭐ **Con più righe dello stesso articolo, vince l'ULTIMA** (deciso dal
  // proprietario il 22/08/2026, stessa regola dei costi).
  //
  // ⚠️ Prima il ciclo scorreva tutte le righe emettendo una `updateMany`
  // ciascuna: l'ultima vinceva comunque, ma **per ordine di iterazione**, non
  // per una regola dichiarata. E ogni riga costava una query.
  //
  // ⛔ C'era anche un difetto più sottile: il confronto «è cambiato?» legge i
  // prezzi correnti UNA VOLTA all'inizio, quindi la seconda riga della stessa
  // variante si confrontava col valore di partenza invece che con quello appena
  // scritto. Con una riga per variante il caso non esiste più.
  const ultimaRigaPerVariante = new Map<string, (typeof eligible)[number]>();
  for (const line of eligible) {
    ultimaRigaPerVariante.set(line.variantId, line);
  }

  for (const line of ultimaRigaPerVariante.values()) {
    const data: Prisma.ProductVariantUpdateManyMutationInput = {};

    if (line.sellingPriceMinor !== undefined) {
      data.sellingPriceMinor = line.sellingPriceMinor;
    }

    if (shopifyActive) {
      // Valore proprio, scritto com'è. Assente = non toccare.
      if (line.shopifyPriceMinor !== undefined) {
        data.shopifyPriceMinor = line.shopifyPriceMinor;
      }
    } else if (
      line.sellingPriceMinor !== undefined &&
      // ⭐ **Copia fra due valori unitari INTERNI**, quindi il confronto è alla
      // precisione del contratto, non al centesimo: se il prezzo di vendita
      // vale 2049,1803, il prezzo del canale deve valere 2049,1803 — non 2049
      // solo perché entrambi verrebbero pubblicati come «20.49».
      //
      // ⛔ L'arrotondamento del canale avviene DOPO, al suo confine
      // (`minorToShopifyDecimal(…, 2)`), e resta invariato. Qui due colonne
      // `Decimal(16,6)` che devono avere lo stesso valore lo avrebbero diverso.
      !sameUnitAmountAtContract(line.sellingPriceMinor, current.get(line.variantId) ?? 0)
    ) {
      // Shopify spento: il prezzo del canale segue quello di vendita, ma solo
      // se questo è davvero cambiato — al centesimo.
      data.shopifyPriceMinor = line.sellingPriceMinor;
    }

    if (Object.keys(data).length === 0) {
      continue;
    }
    await tx.productVariant.updateMany({ where: { id: line.variantId, tenantId }, data });
  }
}
