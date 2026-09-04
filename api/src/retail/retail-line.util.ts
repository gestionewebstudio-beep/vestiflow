import { NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { variantLabel } from '../common/variant-label.util';
import type { VatCodeWithNature } from '../vat/vat-codes.service';
import { buildVatCodeSnapshot } from '../vat/vat-snapshot.util';
import {
  vatInputFromLegacyRate,
  vatInputFromVatCode,
  type VatComputationInput,
} from '../vat/vat-line-calculation.util';

/**
 * Le primitive di riga condivise fra **Vendita al banco** e **Cassa**.
 *
 * ⛔ **Estratte, non duplicate** (`docs/25` §12-ter). Erano metodi privati di
 * `StoreSalesService` — un file da 1542 righe — usati due volte ciascuna da
 * `createSale` e `createReturn`. La Cassa ha bisogno delle stesse decisioni, e
 * riscriverle avrebbe prodotto due IVA di riga che divergono in silenzio.
 *
 * ⛔ **Non si richiama `createSale` per riusarle**: quel caso d'uso trascina la
 * modifica documentale e il pagamento legacy `cash | card | other`, che è
 * esattamente ciò che la Cassa non deve scrivere.
 *
 * ⭐ **Funzioni, non un servizio**: ricevono il client (o la transazione) come
 * primo parametro, così funzionano dentro e fuori una `$transaction` senza che
 * il chiamante debba saperlo.
 *
 * ⚠️ **Estrazione a comportamento INVARIATO**: il corpo è quello di prima,
 * riga per riga. Ogni differenza sarebbe un cambiamento della Vendita al banco
 * nascosto dentro un lavoro sulla Cassa.
 */

/**
 * Il client Prisma o una sua transazione.
 *
 * ⭐ `Prisma.TransactionClient` e non `PrismaService`: il client completo gli e'
 * assegnabile, quindi queste funzioni girano dentro e fuori una `$transaction`
 * senza che il chiamante debba saperlo — ed e' cio' che serve alla Cassa, che
 * lavora sempre dentro una transazione.
 */
export type RetailPrisma = Prisma.TransactionClient;

export interface ResolvedVariant {
  readonly id: string;
  readonly sku: string;
  readonly barcode: string | null;
  readonly productName: string;
  readonly optionSummary: string;
  readonly defaultVatCodeId: string | null;
  /** Costo effettivo corrente: congelato sul movimento di vendita. */
  readonly purchasePriceMinor: number;
}

export interface RetailVatContext {
  readonly vatCodesById: ReadonlyMap<string, VatCodeWithNature>;
  readonly tenantDefaultVatCodeId: string | null;
}

export interface ResolvedLineVat {
  readonly vatCodeId: string | null;
  readonly vatSnapshot: Prisma.InputJsonObject | null;
  readonly vatRatePercent: number | null;
  /** Dati di calcolo della riga: senza Codice IVA, nessuna imposta. */
  readonly vat: VatComputationInput;
}

/**
 * Le varianti del carrello, con nome prodotto, etichetta variante e costo.
 *
 * ⚠️ Se anche una sola manca, l'intera operazione si ferma: un carrello con un
 * articolo introvabile non è un carrello a cui togliere una riga.
 */
export async function resolveRetailVariants(
  prisma: RetailPrisma,
  tenantId: string,
  variantIds: readonly string[],
): Promise<Map<string, ResolvedVariant>> {
  const unique = [...new Set(variantIds)];
  const rows = await prisma.productVariant.findMany({
    where: { tenantId, id: { in: unique } },
    select: {
      id: true,
      sku: true,
      barcode: true,
      optionValues: true,
      purchasePriceMinor: true,
      product: {
        select: { name: true, defaultVatCodeId: true },
      },
    },
  });
  const map = new Map<string, ResolvedVariant>(
    (
      rows as {
        id: string;
        sku: string | null;
        barcode: string | null;
        optionValues: unknown;
        purchasePriceMinor: unknown;
        product: { name: string; defaultVatCodeId: string | null };
      }[]
    ).map((row) => [
      row.id,
      {
        id: row.id,
        sku: row.sku ?? '',
        barcode: row.barcode,
        productName: row.product.name,
        optionSummary: variantLabel(row.optionValues as never),
        defaultVatCodeId: row.product.defaultVatCodeId,
        // Costo che verrà congelato sul movimento di vendita: resta preciso,
        // `Number(...)` è solo il confine col tipo Prisma.
        purchasePriceMinor: Number(row.purchasePriceMinor),
      },
    ]),
  );
  const missing = unique.filter((id) => !map.has(id));
  if (missing.length > 0) {
    throw new NotFoundException('Una o più varianti non sono state trovate.');
  }
  return map;
}

/**
 * Precarica i Codici IVA necessari a risolvere le righe del carrello
 * (§Piano IVA fase 2): predefinito per articolo (variante → prodotto),
 * override esplicito di riga, predefinito aziendale come fallback finale.
 */
export async function resolveRetailVatContext(
  prisma: RetailPrisma,
  tenantId: string,
  // Serve solo l'eventuale Codice IVA di riga: vale per le righe di vendita
  // come per quelle di reso, che ne hanno una forma più corta.
  lines: readonly { readonly vatCodeId?: string | null }[],
  variants: ReadonlyMap<string, ResolvedVariant>,
): Promise<RetailVatContext> {
  const tenantSettings = (await prisma.tenantFeatureSettings.findUnique({
    where: { tenantId },
    select: { defaultVatCodeId: true },
  })) as { defaultVatCodeId: string | null } | null;
  const tenantDefaultVatCodeId = tenantSettings?.defaultVatCodeId ?? null;

  const idsToFetch = new Set<string>();
  for (const line of lines) {
    if (line.vatCodeId) idsToFetch.add(line.vatCodeId);
  }
  for (const variant of variants.values()) {
    if (variant.defaultVatCodeId) idsToFetch.add(variant.defaultVatCodeId);
  }
  if (tenantDefaultVatCodeId) idsToFetch.add(tenantDefaultVatCodeId);

  const vatCodesById = new Map<string, VatCodeWithNature>();
  if (idsToFetch.size > 0) {
    const found = (await prisma.vatCode.findMany({
      where: { tenantId, id: { in: [...idsToFetch] }, deletedAt: null },
      include: { nature: true },
    })) as VatCodeWithNature[];
    for (const vatCode of found) {
      vatCodesById.set(vatCode.id, vatCode);
    }
  }
  return { vatCodesById, tenantDefaultVatCodeId };
}

/** Precedenza: override esplicito di riga > predefinito articolo > predefinito aziendale. */
export function resolveRetailLineVatCode(
  /** Codice IVA scelto sulla riga; le righe di reso non ne hanno uno. */
  lineVatCodeId: string | null | undefined,
  variant: ResolvedVariant,
  vatContext: RetailVatContext,
): ResolvedLineVat {
  const resolvedId = lineVatCodeId ?? variant.defaultVatCodeId ?? vatContext.tenantDefaultVatCodeId;
  const vatCode = resolvedId ? (vatContext.vatCodesById.get(resolvedId) ?? null) : null;
  if (!vatCode) {
    return {
      vatCodeId: null,
      vatSnapshot: null,
      vatRatePercent: null,
      vat: vatInputFromLegacyRate(null),
    };
  }
  return {
    vatCodeId: vatCode.id,
    vatSnapshot: buildVatCodeSnapshot(vatCode),
    vatRatePercent: Math.round(Number(vatCode.ratePercent)),
    vat: vatInputFromVatCode(vatCode),
  };
}

/**
 * La descrizione di una riga nuova: **il solo nome del prodotto**.
 *
 * ⛔ Qui c'era `${productName} — ${optionSummary}`, e impastava la variante
 * dentro la descrizione perché la variante non aveva un posto suo. Adesso ce
 * l'ha — la colonna `variantLabel` — e continuare a concatenare significherebbe
 * mostrarla **due volte**: una nel nome e una nella sua colonna (`03d` §6).
 *
 * ⚠️ Le righe già salvate restano com'erano: un documento emesso non si
 * riscrive. Per un periodo convivranno righe vecchie impastate e righe nuove
 * pulite, ed è la regola della fotografia che funziona — non un difetto.
 */
export function retailLineDescription(variant: ResolvedVariant): string {
  return variant.productName;
}
