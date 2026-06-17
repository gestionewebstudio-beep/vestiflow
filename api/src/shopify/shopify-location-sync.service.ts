import { Injectable, Logger } from '@nestjs/common';
import type { Location } from '@prisma/client';
import { ShopifySyncStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { ShopifyAdminClient, type ShopifyAdminLocation } from './shopify-admin.client';

export interface ShopifyLocationSyncResult {
  readonly matchedCount: number;
  readonly importedCount: number;
  readonly totalCount: number;
}

@Injectable()
export class ShopifyLocationSyncService {
  private readonly logger = new Logger(ShopifyLocationSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly shopifyAdmin: ShopifyAdminClient,
  ) {}

  async syncFromShopify(
    tenantId: string,
    shopDomain: string,
    accessToken: string,
  ): Promise<ShopifyLocationSyncResult> {
    const shopifyLocations = await this.shopifyAdmin.listLocations(shopDomain, accessToken);
    const tenantLocations = await this.prisma.location.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'asc' },
    });
    const defaultStore = await this.prisma.store.findFirst({
      where: { tenantId },
      orderBy: { createdAt: 'asc' },
    });

    const usedVfIds = new Set<string>();
    let matchedCount = 0;
    let importedCount = 0;
    let nextCodeIndex = this.resolveNextLocationCodeIndex(tenantLocations);

    const unlinkedLocations = tenantLocations.filter((loc) => !loc.shopifyLocationId);
    let onboardingLocation = unlinkedLocations.length === 1 ? unlinkedLocations[0] : undefined;

    for (const shopifyLocation of shopifyLocations) {
      const shopifyId = String(shopifyLocation.id);
      const match = this.findMatch(
        tenantLocations,
        shopifyLocation,
        shopifyId,
        usedVfIds,
        onboardingLocation,
      );

      if (match) {
        if (match === onboardingLocation) {
          onboardingLocation = undefined;
        }
        usedVfIds.add(match.id);
        await this.prisma.location.update({
          where: { id: match.id },
          data: this.buildLinkedLocationData(shopifyLocation, shopifyId),
        });
        matchedCount += 1;
        continue;
      }

      const code = `LOC-${String(nextCodeIndex).padStart(2, '0')}`;
      nextCodeIndex += 1;

      await this.prisma.location.create({
        data: {
          tenantId,
          storeId: defaultStore?.id ?? null,
          name: shopifyLocation.name.trim(),
          code,
          isActive: shopifyLocation.active,
          ...this.mapShopifyAddress(shopifyLocation),
          shopifyLocationId: shopifyId,
          shopifySyncStatus: ShopifySyncStatus.synced,
          shopifyLastSyncAt: new Date(),
          shopifyLastError: null,
        },
      });
      importedCount += 1;
      this.logger.log(
        `Location importata da Shopify (${tenantId}): ${shopifyLocation.name} → ${code}`,
      );
    }

    return {
      matchedCount,
      importedCount,
      totalCount: shopifyLocations.length,
    };
  }

  private findMatch(
    tenantLocations: readonly Location[],
    shopifyLocation: ShopifyAdminLocation,
    shopifyId: string,
    usedVfIds: ReadonlySet<string>,
    onboardingLocation?: Location,
  ): Location | undefined {
    const byId = tenantLocations.find(
      (loc) => !usedVfIds.has(loc.id) && loc.shopifyLocationId === shopifyId,
    );
    if (byId) {
      return byId;
    }

    const normalizedShopifyName = this.normalizeName(shopifyLocation.name);
    const byName = tenantLocations.find(
      (loc) =>
        !usedVfIds.has(loc.id) &&
        !loc.shopifyLocationId &&
        this.normalizeName(loc.name) === normalizedShopifyName,
    );
    if (byName) {
      return byName;
    }

    if (onboardingLocation && !usedVfIds.has(onboardingLocation.id)) {
      return onboardingLocation;
    }

    return undefined;
  }

  private buildLinkedLocationData(shopifyLocation: ShopifyAdminLocation, shopifyId: string) {
    return {
      ...this.mapShopifyAddress(shopifyLocation),
      isActive: shopifyLocation.active,
      shopifyLocationId: shopifyId,
      shopifySyncStatus: ShopifySyncStatus.synced,
      shopifyLastSyncAt: new Date(),
      shopifyLastError: null,
    };
  }

  private mapShopifyAddress(shopifyLocation: ShopifyAdminLocation) {
    return {
      addressLine1: shopifyLocation.address1?.trim() || null,
      addressLine2: shopifyLocation.address2?.trim() || null,
      city: shopifyLocation.city?.trim() || null,
      province: shopifyLocation.province?.trim() || null,
      postalCode: shopifyLocation.zip?.trim() || null,
      countryCode: shopifyLocation.country_code?.trim().toUpperCase() || 'IT',
    };
  }

  private normalizeName(name: string): string {
    return name.trim().toLocaleLowerCase('it-IT');
  }

  private resolveNextLocationCodeIndex(locations: readonly Location[]): number {
    const numericCodes = locations
      .map((location) => location.code?.match(/^LOC-(\d+)$/i)?.[1])
      .filter((value): value is string => Boolean(value))
      .map((value) => Number.parseInt(value, 10))
      .filter((value) => Number.isFinite(value));

    if (numericCodes.length === 0) {
      return locations.length + 1;
    }

    return Math.max(...numericCodes) + 1;
  }
}
