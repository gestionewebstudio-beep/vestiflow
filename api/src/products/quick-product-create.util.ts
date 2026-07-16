import { ConflictException } from '@nestjs/common';
import {
  CatalogOrigin,
  Prisma,
  ProductStatus,
  ShopifyCatalogLinkKind,
} from '@prisma/client';

import { nextArticleCodeInTx } from './article-code.util';

/**
 * Creazione rapida di un'anagrafica prodotto (Product + variante unica),
 * tx-aware: usata dal flusso Arrivo merce (creazione atomica riga+articolo,
 * punto A) e riusata da ProductsService per normalizzazioni/unicità.
 *
 * Regole condivise con la creazione standard:
 * - SKU facoltativo (specifica cliente §SKU): vuoto → NULL, mai "".
 * - Barcode facoltativo: vuoto → NULL.
 * - Unicità per tenant (case-insensitive) su SKU e barcode; il vincolo unico
 *   (tenant_id, sku/barcode) resta l'ultima difesa: P2002 → 409 chiaro.
 * - Omonimi ammessi: il nome NON è univoco (ID diverso).
 */

/** SKU facoltativo (specifica cliente §SKU): stringa vuota/assente -> NULL, mai "". */
export function normalizeOptionalSku(sku: string | null | undefined): string | null {
  const trimmed = sku?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeBarcodeInput(barcode: string | null | undefined): string | null {
  const trimmed = barcode?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Unicità SKU per tenant (case-insensitive), tx-aware. SKU vuoto/assente:
 * nessun controllo (il vincolo unique ammette più NULL), mai bloccante.
 */
export async function assertVariantSkuAvailableInTx(
  tx: Prisma.TransactionClient,
  tenantId: string,
  sku: string | null | undefined,
  excludeVariantId?: string,
): Promise<void> {
  const normalized = normalizeOptionalSku(sku);
  if (!normalized) {
    return;
  }
  const existing = await tx.productVariant.findFirst({
    where: {
      tenantId,
      sku: { equals: normalized, mode: 'insensitive' },
      ...(excludeVariantId ? { id: { not: excludeVariantId } } : {}),
    },
    select: { sku: true },
  });
  if (existing) {
    throw new ConflictException(`SKU già presente a catalogo: ${normalized}`);
  }
}

/** Unicità barcode per tenant (case-insensitive), tx-aware. Vuoto: nessun controllo. */
export async function assertVariantBarcodeAvailableInTx(
  tx: Prisma.TransactionClient,
  tenantId: string,
  barcode: string | null | undefined,
  excludeVariantId?: string,
): Promise<void> {
  const normalized = normalizeBarcodeInput(barcode);
  if (!normalized) {
    return;
  }
  const existing = await tx.productVariant.findFirst({
    where: {
      tenantId,
      barcode: { equals: normalized, mode: 'insensitive' },
      ...(excludeVariantId ? { id: { not: excludeVariantId } } : {}),
    },
    select: { barcode: true },
  });
  if (existing?.barcode) {
    throw new ConflictException(`Barcode già presente a catalogo: ${existing.barcode}`);
  }
}

/** Dati minimi della creazione rapida (riga Arrivo merce, punto A). */
export interface QuickProductCreateInput {
  readonly name: string;
  readonly sku?: string | null;
  readonly barcode?: string | null;
  readonly sellingPriceMinor?: number | null;
  readonly compareAtPriceMinor?: number | null;
  readonly purchasePriceMinor?: number | null;
  readonly vatCodeId?: string | null;
  readonly managesStock?: boolean | null;
  readonly currency?: string | null;
  /** Unità di misura (es. pz, kg); assente = default pz dello schema. */
  readonly unitOfMeasure?: string | null;
}

export interface QuickProductCreateResult {
  readonly productId: string;
  readonly variantId: string;
  readonly sku: string | null;
  readonly barcode: string | null;
  readonly managesStock: boolean;
}

/**
 * Crea Product + variante tecnica unica DENTRO la transazione ricevuta.
 * Il pre-check di unicità non copre le richieste concorrenti: il vincolo
 * unico (tenant_id, sku/barcode) può comunque scattare e deve restare un
 * 409 coerente con un messaggio chiaro, mai un 500.
 */
export async function createQuickProductWithVariant(
  tx: Prisma.TransactionClient,
  tenantId: string,
  input: QuickProductCreateInput,
): Promise<QuickProductCreateResult> {
  const sku = normalizeOptionalSku(input.sku);
  const barcode = normalizeBarcodeInput(input.barcode);
  await assertVariantSkuAvailableInTx(tx, tenantId, sku);
  await assertVariantBarcodeAvailableInTx(tx, tenantId, barcode);

  const managesStock = input.managesStock ?? true;
  try {
    // Codice articolo generato come progressivo (regola generale §Codice
    // articolo: sempre generato se assente, in ogni flusso di creazione).
    const articleCode = await nextArticleCodeInTx(tx, tenantId);
    const created = await tx.product.create({
      data: {
        tenantId,
        articleCode,
        catalogOrigin: CatalogOrigin.vestiflow,
        shopifyCatalogLinkKind: ShopifyCatalogLinkKind.pushed,
        name: input.name.trim(),
        status: ProductStatus.active,
        defaultVatCodeId: input.vatCodeId ?? null,
        managesStock,
        ...(input.unitOfMeasure?.trim() ? { unitOfMeasure: input.unitOfMeasure.trim() } : {}),
        options: [] as unknown as Prisma.InputJsonValue,
        variants: {
          create: [
            {
              tenant: { connect: { id: tenantId } },
              sku,
              barcode,
              optionValues: [] as unknown as Prisma.InputJsonValue,
              currency: input.currency?.trim() || 'EUR',
              sellingPriceMinor: input.sellingPriceMinor ?? 0,
              purchasePriceMinor: input.purchasePriceMinor ?? undefined,
              compareAtPriceMinor: input.compareAtPriceMinor ?? undefined,
            },
          ],
        },
      },
      include: { variants: true },
    });
    const variant = created.variants[0];
    if (!variant) {
      // Non dovrebbe mai accadere: la variante è creata nella stessa create.
      throw new Error('Articolo creato ma variante non trovata.');
    }
    return {
      productId: created.id,
      variantId: variant.id,
      sku: variant.sku,
      barcode: variant.barcode,
      managesStock,
    };
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException(
        sku
          ? `SKU già presente a catalogo: ${sku}`
          : 'Uno o più codici (SKU/barcode) risultano già presenti a catalogo.',
      );
    }
    throw error;
  }
}
