import { Injectable, Logger, UnprocessableEntityException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { ShopifyAdminClient } from './shopify-admin.client';
import { ShopifyConfigService } from './shopify-config.service';
import { ShopifyConnectionService } from './shopify-connection.service';
import { ShopifyOAuthService } from './shopify-oauth.service';
import {
  buildShopifyScopeDiagnostics,
  mergeShopifyScopes,
  shopifyOrdersReadScopeError,
} from './shopify-scopes.util';
import { ShopifySyncService } from './shopify-sync.service';
import { extractShopifyOrderGid } from './shopify-order-id.util';
import { ShopifyMissingOrdersService } from './shopify-missing-orders.service';

export interface ShopifyOrdersPullResult {
  readonly imported: number;
  readonly updated: number;
  readonly skipped: number;
  readonly remoteOrderCount: number;
  readonly failed: readonly { readonly shopifyOrderId: string; readonly message: string }[];
  /** Ordini che su Shopify non risultano più: segnalati, mai rimossi da soli. */
  readonly missingOnChannel: number;
  /** Fra quelli, gli ordini non evasi di cui sono stati liberati gli impegni. */
  readonly reservationsReleased: number;
  /** Perché il controllo sugli ordini spariti non ha concluso, se è successo. */
  readonly missingCheckInconclusive?: string;
}

@Injectable()
export class ShopifyOrdersPullService {
  private readonly logger = new Logger(ShopifyOrdersPullService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly shopifyConfig: ShopifyConfigService,
    private readonly shopifyConnection: ShopifyConnectionService,
    private readonly shopifyOAuth: ShopifyOAuthService,
    private readonly shopifyAdmin: ShopifyAdminClient,
    private readonly shopifySync: ShopifySyncService,
    private readonly missingOrders: ShopifyMissingOrdersService,
  ) {}

  async pullOrders(tenantId: string): Promise<ShopifyOrdersPullResult> {
    const connection = await this.shopifyConnection.getForTenant(tenantId);
    const credential = await this.prisma.shopifyCredential.findUnique({
      where: { tenantId },
      select: { scopes: true },
    });
    const effectiveScopes = mergeShopifyScopes(connection.scopes, credential?.scopes);
    const scopeError = shopifyOrdersReadScopeError(effectiveScopes);
    if (scopeError) {
      buildShopifyScopeDiagnostics(this.shopifyConfig.requestedScopes, effectiveScopes);
      throw new UnprocessableEntityException(scopeError);
    }

    const { shopDomain, accessToken } = await this.shopifyOAuth.getAccessToken(tenantId);
    let remoteOrders;
    try {
      remoteOrders = await this.shopifyAdmin.listAllOrders(shopDomain, accessToken);
    } catch (error: unknown) {
      await this.shopifyConnection.recordApiFailure(tenantId, error);
      throw error;
    }

    let imported = 0;
    let updated = 0;
    let skipped = 0;
    const failed: { shopifyOrderId: string; message: string }[] = [];

    // Elenco completo dei remoti, per la riconciliazione in coda. Si raccoglie
    // dal risultato di `listAllOrders`, che o è completo o ha già sollevato
    // un'eccezione: un elenco parziale scambierebbe ordini vivi per cancellati.
    const remoteOrderGids = new Set<string>();

    for (const remoteOrder of remoteOrders) {
      const gid = extractShopifyOrderGid(remoteOrder);
      if (gid) {
        remoteOrderGids.add(gid);
      }

      const shopifyOrderId = String(remoteOrder['id'] ?? 'unknown');
      try {
        const outcome = await this.shopifySync.applyOrderFromShopify(tenantId, remoteOrder);
        switch (outcome) {
          case 'created':
            imported += 1;
            break;
          case 'updated':
            updated += 1;
            break;
          case 'skipped':
            skipped += 1;
            break;
        }
      } catch (error) {
        failed.push({
          shopifyOrderId,
          message: error instanceof Error ? error.message : 'Errore sconosciuto',
        });
      }
    }

    // Riconciliazione in coda: l'elenco remoto è già in mano, e finora lo si
    // percorreva in un verso solo — si aggiornavano i remoti trovati, senza mai
    // guardare i locali che non compaiono più. È lì che stavano gli ordini
    // cancellati su Shopify, di cui non ci accorgevamo in nessun modo.
    //
    // Non blocca l'importazione: se il confronto fallisce, gli ordini importati
    // restano importati e l'operatore vede comunque l'esito dello scarico.
    let missingOnChannel = 0;
    let reservationsReleased = 0;
    let missingCheckInconclusive: string | undefined;
    try {
      const reconciled = await this.missingOrders.reconcile(tenantId, { remoteOrderGids });
      missingOnChannel = reconciled.missing;
      reservationsReleased = reconciled.released;
      missingCheckInconclusive = reconciled.inconclusive;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Errore sconosciuto';
      this.logger.warn(`Riconciliazione ordini spariti non riuscita (${tenantId}): ${message}`);
      missingCheckInconclusive =
        'Il controllo sugli ordini spariti non è stato eseguito per un errore interno.';
    }

    await this.shopifyConnection.touchSync(tenantId);

    this.logger.log(
      `Import ordini Shopify (${tenantId}): +${imported} ~${updated} skip=${skipped} remote=${remoteOrders.length} failed=${failed.length} spariti=${missingOnChannel}`,
    );

    return {
      imported,
      updated,
      skipped,
      remoteOrderCount: remoteOrders.length,
      failed,
      missingOnChannel,
      reservationsReleased,
      missingCheckInconclusive,
    };
  }
}
