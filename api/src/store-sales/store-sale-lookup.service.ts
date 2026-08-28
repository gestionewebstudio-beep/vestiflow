import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import type { UserProfileDto } from '../auth/dto/user-profile.dto';
import { assertLocationReadableInUserScope } from '../inventory/user-location-scope.util';
import { PrismaService } from '../prisma/prisma.service';

import type { LookupStoreSaleItemQueryDto } from './dto/lookup-store-sale-item.query.dto';

/** Articolo trovato per il carrello cassa: prezzo + quantità alla location. */
export interface StoreSaleItemLookupResult {
  readonly variantId: string;
  readonly sku: string;
  readonly barcode: string | null;
  readonly productName: string;
  readonly optionSummary: string;
  readonly sellingPriceMinor: number;
  readonly currency: string;
  /** Aliquota % del Codice IVA risolto (solo display, derivata da vatCodeId). */
  readonly vatRatePercent: number | null;
  /** Codice IVA risolto (predefinito articolo, altrimenti predefinito aziendale). */
  readonly vatCodeId: string | null;
  readonly vatCodeLabel: string | null;
  readonly onHand: number;
  readonly committed: number;
  readonly available: number;
}

@Injectable()
export class StoreSaleLookupService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Match esatto barcode/SKU (scansione) o ricerca libera su SKU/nome prodotto.
   * Restituisce sempre Giacenza/Impegnata/Disponibile alla location (§8).
   *
   * Senza utente in contesto (chiamate interne, lavori di sistema) non si
   * decide nulla qui: l'autorizzazione l'ha già data chi ha avviato
   * l'operazione — è `assertLocationReadableInUserScope` a lasciar passare.
   */
  async lookupItems(
    tenantId: string,
    query: LookupStoreSaleItemQueryDto,
    // ⛔ **`UserProfileDto`, non `UserProfileDto | undefined`.** Misurato il
    // 28/08/2026: la rotta sta sotto `JwtAuthGuard` senza `@Public()`, il
    // decoratore `@CurrentUser()` e tipizzato non-nullable e la guardia popola
    // `request.appUser` su entrambi i rami che restituiscono `true` per una
    // rotta protetta. L’identita non puo essere assente qui.
    //
    // ⚠️ `undefined` era convenzione ereditata dalle utility, non necessita
    // tecnica: ed e esattamente la forma che ha prodotto lo stesso difetto in
    // tre domini diversi. Se un giorno servisse una chiamata di sistema, avra
    // una strada esplicita (`…ForSystem`), non questa scorciatoia.
    user: UserProfileDto,
  ): Promise<StoreSaleItemLookupResult[]> {
    // Il gate della rotta chiede «usa la cassa», ma la sede arriva dalla query
    // ed è validata solo come UUID: senza questo controllo la cassa di un
    // negozio leggeva Giacenza/Impegnata/Disponibile di qualunque altra sede
    // del tenant. Il controllo sta prima della ricerca, non solo prima delle
    // giacenze: una sede fuori dal proprio ambito non deve costare nemmeno una
    // query. Chi ha `inventory.view_all_locations`, il titolare e chi ha
    // accesso a tutte le sedi continuano a vedere tutto.
    assertLocationReadableInUserScope(
      user,
      query.locationId,
      'Non sei autorizzato a consultare la disponibilità di questo magazzino.',
    );

    const code = query.code.trim();

    const exact = await this.prisma.productVariant.findMany({
      where: {
        tenantId,
        OR: [
          { sku: { equals: code, mode: 'insensitive' } },
          { barcode: { equals: code, mode: 'insensitive' } },
        ],
      },
      ...this.variantSelect(),
      take: 5,
    });

    const rows =
      exact.length > 0
        ? exact
        : await this.prisma.productVariant.findMany({
            where: {
              tenantId,
              OR: [
                { sku: { contains: code, mode: 'insensitive' } },
                { barcode: { contains: code, mode: 'insensitive' } },
                { product: { name: { contains: code, mode: 'insensitive' } } },
              ],
            },
            ...this.variantSelect(),
            orderBy: { sku: 'asc' },
            take: 15,
          });

    if (rows.length === 0) {
      return [];
    }

    const levels = await this.prisma.inventoryLevel.findMany({
      where: {
        tenantId,
        locationId: query.locationId,
        variantId: { in: rows.map((row) => row.id) },
      },
      select: { variantId: true, onHand: true, committed: true, available: true },
    });
    const levelByVariant = new Map(levels.map((level) => [level.variantId, level]));

    // Codice IVA: predefinito articolo, altrimenti predefinito aziendale (§Piano IVA fase 2).
    const tenantSettings = await this.prisma.tenantFeatureSettings.findUnique({
      where: { tenantId },
      select: { defaultVatCodeId: true },
    });
    const tenantDefaultVatCodeId = tenantSettings?.defaultVatCodeId ?? null;
    const idsToFetch = new Set<string>();
    for (const row of rows) {
      if (row.product.defaultVatCodeId) idsToFetch.add(row.product.defaultVatCodeId);
    }
    if (tenantDefaultVatCodeId) idsToFetch.add(tenantDefaultVatCodeId);
    const vatCodesById = new Map<string, { id: string; code: string; ratePercent: Prisma.Decimal }>();
    if (idsToFetch.size > 0) {
      const found = await this.prisma.vatCode.findMany({
        where: { tenantId, id: { in: [...idsToFetch] }, deletedAt: null },
        select: { id: true, code: true, ratePercent: true },
      });
      for (const vatCode of found) {
        vatCodesById.set(vatCode.id, vatCode);
      }
    }

    return rows.map((row) => {
      const level = levelByVariant.get(row.id);
      const resolvedVatCodeId = row.product.defaultVatCodeId ?? tenantDefaultVatCodeId;
      const vatCode = resolvedVatCodeId ? (vatCodesById.get(resolvedVatCodeId) ?? null) : null;
      return {
        variantId: row.id,
        sku: row.sku ?? '',
        barcode: row.barcode,
        productName: row.product.name,
        optionSummary: this.optionSummary(row.optionValues),
        // Prezzo netto a sei decimali: la cassa ci calcola sopra l'IVA e
        // arrotonda solo quando lo mostra.
        sellingPriceMinor: Number(row.sellingPriceMinor),
        currency: row.currency,
        vatRatePercent: vatCode ? Math.round(Number(vatCode.ratePercent)) : null,
        vatCodeId: vatCode?.id ?? null,
        vatCodeLabel: vatCode ? vatCode.code : null,
        onHand: level?.onHand ?? 0,
        committed: level?.committed ?? 0,
        available: level?.available ?? 0,
      };
    });
  }

  private variantSelect() {
    return {
      select: {
        id: true,
        sku: true,
        barcode: true,
        optionValues: true,
        sellingPriceMinor: true,
        currency: true,
        product: {
          select: { name: true, defaultVatCodeId: true },
        },
      },
    } as const;
  }

  private optionSummary(optionValues: Prisma.JsonValue): string {
    if (!Array.isArray(optionValues)) {
      return '';
    }
    const parts = optionValues
      .map((entry) =>
        entry && typeof entry === 'object' && 'value' in entry
          ? String((entry as { value: unknown }).value)
          : null,
      )
      .filter((value): value is string => !!value);
    return parts.join(' / ');
  }
}
