import { Injectable, Logger } from '@nestjs/common';
import type { Location } from '@prisma/client';
import { ShopifySyncStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { ShopifyAdminClient, type ShopifyAdminLocation } from './shopify-admin.client';
import { isSameShopifyLocationId, normalizeShopifyLocationId } from './shopify-location-id.util';
import { isShopifyManagedImportLocation } from './shopify-location-import.util';

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

    /** Id presenti nel catalogo Shopify (attive e disattivate). */
    const shopifyCatalogIds = new Set<string>();

    for (const shopifyLocation of shopifyLocations) {
      const shopifyId = String(shopifyLocation.id);
      const normalizedId = normalizeShopifyLocationId(shopifyId);
      if (normalizedId) {
        shopifyCatalogIds.add(normalizedId);
      }

      const match = this.findMatch(tenantLocations, shopifyLocation, shopifyId, usedVfIds);

      if (match) {
        usedVfIds.add(match.id);
        await this.prisma.location.update({
          where: { id: match.id },
          data: this.buildLinkedLocationData(shopifyLocation, shopifyId),
        });
        if (shopifyLocation.active) {
          matchedCount += 1;
        } else {
          this.logger.log(
            `Location Shopify disattivata (${tenantId}): ${shopifyLocation.name}`,
          );
        }
        continue;
      }

      if (!shopifyLocation.active) {
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
          licensedInVf: false,
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

    await this.cleanupStaleShopifyLocations(tenantId, shopifyCatalogIds);
    await this.cleanupUnlinkedImportLocations(tenantId);

    return {
      matchedCount,
      importedCount,
      totalCount: shopifyLocations.length,
    };
  }

  /** Rimuove residui di import Shopify non collegati (es. dopo disconnect incompleto). */
  async cleanupUnlinkedImportLocations(tenantId: string): Promise<number> {
    const [locations, primaryStore] = await Promise.all([
      this.prisma.location.findMany({
        where: {
          tenantId,
          isActive: true,
          shopifyLocationId: null,
        },
        select: {
          id: true,
          name: true,
          code: true,
          addressLine1: true,
          shopifyLocationId: true,
          shopifyLastSyncAt: true,
        },
      }),
      this.prisma.store.findFirst({
        where: { tenantId },
        orderBy: { createdAt: 'asc' },
        select: { name: true },
      }),
    ]);

    const primaryStoreName = primaryStore?.name ?? null;
    let removed = 0;

    for (const location of locations) {
      if (location.shopifyLocationId) {
        continue;
      }

      if (!isShopifyManagedImportLocation(location, primaryStoreName)) {
        continue;
      }

      /*
        ⛔ **Qui c'era un `location.delete` quando la sede risultava vuota.**
           Nessuna sincronizzazione Shopify elimina una Location, neppure se
           vuota: l'eliminazione di una sede vuota e non collegata appartiene
           esclusivamente alla funzione VestiFlow dedicata (`docs/24` §1.13.4).

        ⚠️ «Era vuota» non e' un'autorizzazione. Una sede senza riferimenti oggi
           puo' averne domani, e chi la elimina qui non sta rispondendo a
           nessuna richiesta dell'operatore: sta rispondendo a un catalogo
           remoto che e' cambiato.
      */
      await this.prisma.location.update({
        where: { id: location.id },
        data: {
          isActive: false,
          shopifySyncStatus: ShopifySyncStatus.not_connected,
          shopifyLastSyncAt: null,
          shopifyLastError: null,
        },
      });
      removed += 1;
      this.logger.log(
        `Archiviata location import Shopify non collegata (${tenantId}): ${location.name}`,
      );
    }

    return removed;
  }

  /*
    ⛔ **`removeEmptyOnboardingLocation` e' stata RIMOSSA, non svuotata.**

       Cancellava la sede `LOC-01` creata in onboarding quando risultava vuota
       e le sedi Shopify l'avevano sostituita. Tolto il `delete` — che
       `docs/24` §1.13.4 vieta a qualunque sincronizzazione — non le restava
       niente da fare: era un metodo che esisteva soltanto per eliminare.

    ⚠️ **Una funzione svuotata e' peggio di una funzione assente**: chi la trova
       fra sei mesi non sa se non fa niente per scelta o per un difetto, e la
       chiamata rimasta in `syncFromShopify` suggerirebbe che qualcosa succeda.

    ⭐ **Che cosa succede ora alla sede di onboarding**: resta. Se l'azienda non
       la usa, e' l'operatore a eliminarla dalla funzione dedicata — che sa
       chiedere conferma, e che risponde a lui invece che a un catalogo remoto.
  */

  /*
    ⛔ **`canDeleteLocation` e' stata RIMOSSA da questo servizio.**

       Era la domanda «posso cancellare questa sede?», e in questo perimetro la
       risposta e' ora sempre **no**: nessuna sincronizzazione Shopify elimina
       una Location, neppure se vuota (`docs/24` §1.13.4). Una funzione che
       risponde sempre allo stesso modo non e' un controllo.

    ⭐ **`verificaSedeCancellabile` e `RIFERIMENTI_SEDE` restano** in
       `location-delete-safety.util.ts`: sono il contratto della funzione
       VestiFlow dedicata all'eliminazione, che dovra' interrogare tutte e
       ventuno le relazioni prima di cancellare qualcosa. Restano verificati da
       `npm run check:cascate-sede` e dalle ventuno prove generate dall'elenco.

    ⚠️ Sono quindi **senza chiamanti di produzione finche' quella funzione non
       esiste**, ed e' dichiarato in `docs/DA-FARE.md`: non e' codice
       dimenticato, e' un contratto in attesa del suo consumatore.
  */

  private async cleanupStaleShopifyLocations(
    tenantId: string,
    shopifyCatalogIds: ReadonlySet<string>,
  ): Promise<void> {
    const linkedLocations = await this.prisma.location.findMany({
      where: { tenantId, shopifyLocationId: { not: null } },
    });

    for (const location of linkedLocations) {
      const shopifyLocationId = location.shopifyLocationId;
      const normalizedId = normalizeShopifyLocationId(shopifyLocationId);
      if (!normalizedId || shopifyCatalogIds.has(normalizedId)) {
        continue;
      }

      /*
        ⛔ **Anche qui c'era un `location.delete`**, e questo era il piu'
           pericoloso dei tre: si applicava a una sede COLLEGATA, sparita dal
           catalogo remoto. Una location che non c'e' piu' su Shopify non
           autorizza a cancellare la sede che le corrispondeva
           (`docs/24` §1.13.3).
      */
      await this.prisma.location.update({
        where: { id: location.id },
        data: {
          isActive: false,
          shopifyLocationId: null,
          shopifySyncStatus: ShopifySyncStatus.not_connected,
          shopifyLastSyncAt: null,
          shopifyLastError: null,
        },
      });
      this.logger.log(
        `Scollegata e disattivata location Shopify obsoleta (${tenantId}): ${location.name}`,
      );
    }
  }

  private findMatch(
    tenantLocations: readonly Location[],
    shopifyLocation: ShopifyAdminLocation,
    shopifyId: string,
    usedVfIds: ReadonlySet<string>,
  ): Location | undefined {
    const byId = tenantLocations.find(
      (loc) =>
        !usedVfIds.has(loc.id) && isSameShopifyLocationId(loc.shopifyLocationId, shopifyId),
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

    return undefined;
  }

  private buildLinkedLocationData(shopifyLocation: ShopifyAdminLocation, shopifyId: string) {
    return {
      name: shopifyLocation.name.trim(),
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
