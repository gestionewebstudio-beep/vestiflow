import { Injectable, Logger } from '@nestjs/common';
import type { Location } from '@prisma/client';
import { ShopifySyncStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { ShopifyAdminClient, type ShopifyAdminLocation } from './shopify-admin.client';
import { isSameShopifyLocationId, normalizeShopifyLocationId } from './shopify-location-id.util';
import {
  indirizzoDaShopify,
  isShopifyManagedImportLocation,
} from './shopify-location-import.util';
import { ShopifyLocationLinkService } from './shopify-location-link.service';

/** Una location Shopify che NESSUNA sede VestiFlow riconosce per id. */
export interface ShopifyUnlinkedLocation {
  readonly shopifyLocationId: string;
  readonly name: string;
  readonly active: boolean;
}

export interface ShopifyLocationSyncResult {
  readonly matchedCount: number;
  /**
   * ⛔ Sempre 0 dall’11/09/2026 (B7): il sync non crea più sedi. Il campo resta
   *    per il contratto dei chiamanti, con il suo significato di sempre.
   */
  readonly importedCount: number;
  readonly totalCount: number;
  /** Le location che aspettano una scelta: collega, crea o lascia (`docs/24` §1.13.1). */
  readonly unlinked: readonly ShopifyUnlinkedLocation[];
}

@Injectable()
export class ShopifyLocationSyncService {
  private readonly logger = new Logger(ShopifyLocationSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly shopifyAdmin: ShopifyAdminClient,
    private readonly locationLink: ShopifyLocationLinkService,
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
    // ⭐ La coppia con periodo ATTIVO è la fonte (B7); la colonna-cache la
    //    segue. Dopo «Disconnetti» la cache è azzerata ma il periodo — mai
    //    chiuso: disconnettere sospende — resta: alla riconnessione allo
    //    stesso negozio la sede si riconosce dalla coppia, e `collega` rimette
    //    la cache. Un periodo CHIUSO (lascia, negozio cambiato) non conta.
    const perCoppia = new Map(
      (await this.locationLink.sediCollegate(tenantId)).map((c) => [
        c.shopifyLocationId,
        c.locationId,
      ]),
    );
    const usedVfIds = new Set<string>();
    let matchedCount = 0;
    const unlinked: ShopifyUnlinkedLocation[] = [];

    /** Id presenti nel catalogo Shopify (attive e disattivate). */
    const shopifyCatalogIds = new Set<string>();

    for (const shopifyLocation of shopifyLocations) {
      const shopifyId = String(shopifyLocation.id);
      const normalizedId = normalizeShopifyLocationId(shopifyId);
      if (normalizedId) {
        shopifyCatalogIds.add(normalizedId);
      }

      const match = this.findMatch(
        tenantLocations,
        shopifyId,
        usedVfIds,
        normalizedId ? perCoppia.get(normalizedId) : undefined,
      );

      if (match) {
        usedVfIds.add(match.id);
        await this.prisma.$transaction(async (tx) => {
          await tx.location.update({
            where: { id: match.id },
            data: this.buildLinkedLocationData(shopifyLocation, shopifyId),
          });
          // ⭐ B7: la sede riconosciuta per id ha coppia e periodo nello storico
          //    (`docs/DA-FARE` §13). Idempotente: al secondo sync non apre niente.
          //    Con la connessione senza negozio (`shopId` assente) non scrive, e
          //    il sync prosegue com’era: non si anticipa il backfill.
          await this.locationLink.collega(tx, {
            tenantId,
            locationId: match.id,
            shopifyLocationId: shopifyId,
          });
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

      /*
        ⛔ **QUI C’ERA `location.create`**: una location Shopify senza sede
           diventava una sede VestiFlow nuova, già collegata, e il collegamento
           per NOME lo faceva `findMatch`. Tolti entrambi l’11/09/2026 (B7,
           `docs/24` §1.13.1, §8.11.1; `DA-FARE` §12, §15.3): «una sede nuova
           nasce da quella scelta, non dalla sincronizzazione». La location si
           RIPORTA, e la scelta — collega, crea, lascia — la fa l’operatore in
           Impostazioni → Shopify (`ShopifySetupService`).
      */
      unlinked.push({
        shopifyLocationId: normalizedId ?? shopifyId,
        name: shopifyLocation.name.trim(),
        active: shopifyLocation.active,
      });
    }

    await this.cleanupStaleShopifyLocations(tenantId, shopifyCatalogIds);
    await this.cleanupUnlinkedImportLocations(tenantId);

    return {
      matchedCount,
      importedCount: 0,
      totalCount: shopifyLocations.length,
      unlinked,
    };
  }

  /**
   * Segnala i residui di import Shopify non collegati (es. dopo un disconnect
   * incompleto). Non ne rimuove nessuno: `docs/24` §1.13.4.
   *
   * @returns quante sedi sono state segnalate.
   */
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
    /** Quante sedi sono state SEGNALATE. Nessuna viene piu' rimossa. */
    let segnalate = 0;

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
      /*
        ⛔ **Anche qui la sede veniva DISATTIVATA**, e senza che nessuno lo
           chiedesse: bastava che il catalogo remoto non la contenesse.
           `docs/24` §1.13.4 — una sincronizzazione Shopify non puo' eseguire
           automaticamente questa disattivazione.

        ⚠️ L'effetto non era una perdita di righe ma una sparizione operativa:
           la sede usciva dai selettori, dal conteggio delle sedi licenziate, e
           `setLicensedLocations` rifiutava di riattivarla.
      */
      await this.prisma.location.update({
        where: { id: location.id },
        data: {
          shopifySyncStatus: ShopifySyncStatus.error,
          shopifyLastError: 'La location collegata non risulta piu` disponibile su Shopify. Il collegamento non e` verificabile: la sede e i suoi dati restano intatti. Collegala a un`altra location o creane una nuova.',
        },
      });
      segnalate += 1;
      this.logger.warn(
        `Location import Shopify non collegata (${tenantId}): ${location.name} — sede conservata, collegamento non verificabile`,
      );
    }

    return segnalate;
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
      /*
        ⛔ **Qui la sede veniva DISATTIVATA e SCOLLEGATA.** Entrambe le cose
           sono vietate: `docs/24` §1.13.3 — una location scomparsa da Shopify
           non elimina, archivia o disattiva automaticamente la sede VestiFlow.

        ⚠️ **E lo scollegamento era il danno piu' silenzioso dei due.** Finche'
           non esiste `shopify_location_links`, `shopifyLocationId` e' l'unica
           traccia del collegamento: azzerandolo, «non e' mai stato collegato» e
           «il collegamento si e' chiuso» diventano indistinguibili — ed e'
           esattamente la differenza su cui si regge il divieto di riaggancio
           automatico. Una location che tornasse con lo stesso nome verrebbe
           riagganciata come se fosse nuova.

        ⭐ **Il comportamento provvisorio e' CONSERVATIVO**: si preserva tutto e
           si SEGNALA. Lo stato `error` e il messaggio sono l'unico modo di
           dirlo senza una tabella di storico — e sono visibili all'operatore,
           che e' il solo che puo' decidere.
      */
      await this.prisma.location.update({
        where: { id: location.id },
        data: {
          shopifySyncStatus: ShopifySyncStatus.error,
          shopifyLastError: 'La location collegata non risulta piu` disponibile su Shopify. Il collegamento non e` verificabile: la sede e i suoi dati restano intatti. Collegala a un`altra location o creane una nuova.',
        },
      });
      this.logger.warn(
        `Location Shopify non piu' disponibile (${tenantId}): ${location.name} — sede e collegamento conservati, sincronizzazione sospesa`,
      );
    }
  }

  /**
   * ⛔ **Solo per ID.** Qui c’era il ramo `byName` — una sede senza id con lo
   *    stesso nome veniva agganciata — ed è esattamente ciò che `docs/24`
   *    §8.11.1 vieta: «il nome serve alla lettura, mai all’abbinamento
   *    automatico». Scenario N1 del piano di collaudo.
   */
  private findMatch(
    tenantLocations: readonly Location[],
    shopifyId: string,
    usedVfIds: ReadonlySet<string>,
    sedeDellaCoppia: string | undefined,
  ): Location | undefined {
    return tenantLocations.find(
      (loc) =>
        !usedVfIds.has(loc.id) &&
        (loc.id === sedeDellaCoppia || isSameShopifyLocationId(loc.shopifyLocationId, shopifyId)),
    );
  }

  private buildLinkedLocationData(shopifyLocation: ShopifyAdminLocation, shopifyId: string) {
    return {
      name: shopifyLocation.name.trim(),
      ...indirizzoDaShopify(shopifyLocation),
      isActive: shopifyLocation.active,
      shopifyLocationId: shopifyId,
      shopifySyncStatus: ShopifySyncStatus.synced,
      shopifyLastSyncAt: new Date(),
      shopifyLastError: null,
    };
  }

}
