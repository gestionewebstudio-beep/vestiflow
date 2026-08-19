import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import {
  ShopifyConnectionStatus,
  ShopifySyncStatus,
  TenantChannelProfile,
} from '@prisma/client';

import { assertTenantChannelProfile } from '../common/tenant-channel-profile.util';
import { PrismaService } from '../prisma/prisma.service';
import { ShopifyAdminClient } from './shopify-admin.client';
import { ShopifyConfigService } from './shopify-config.service';
import { ShopifyConnectionService } from './shopify-connection.service';
import { ShopifyCryptoService } from './shopify-crypto.service';
import { isShopifyDeliverableAddress } from './shopify-webhook-address.util';
import {
  ShopifyLocationSyncService,
  type ShopifyLocationSyncResult,
} from './shopify-location-sync.service';
import {
  buildShopifyScopeDiagnostics,
  mergeShopifyScopes,
  parseShopifyScopesString,
  shopifyCatalogImportBlockMessage,
} from './shopify-scopes.util';
import {
  SHOPIFY_PROTECTED_WEBHOOK_TOPICS,
  type ShopifyWebhookRegistrationResult,
} from './shopify-webhook-topics';

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

@Injectable()
export class ShopifyOAuthService {
  private readonly logger = new Logger(ShopifyOAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly shopifyConfig: ShopifyConfigService,
    private readonly shopifyCrypto: ShopifyCryptoService,
    private readonly shopifyAdmin: ShopifyAdminClient,
    private readonly shopifyConnection: ShopifyConnectionService,
    private readonly shopifyLocationSync: ShopifyLocationSyncService,
  ) {}

  async beginAuth(tenantId: string, shopInput: string): Promise<{ authorizeUrl: string }> {
    await assertTenantChannelProfile(this.prisma, tenantId, TenantChannelProfile.shopify);
    this.shopifyAdmin.assertConfigured();
    if (!this.shopifyCrypto.isConfigured()) {
      throw new ServiceUnavailableException('SHOPIFY_TOKEN_ENCRYPTION_KEY non configurata');
    }

    const shopDomain = this.shopifyConfig.normalizeShopDomain(shopInput);
    const existingCredential = await this.prisma.shopifyCredential.findUnique({
      where: { tenantId },
      select: { shopDomain: true },
    });
    if (existingCredential && existingCredential.shopDomain !== shopDomain) {
      throw new UnprocessableEntityException(
        'Sei già connesso a un altro negozio Shopify. Usa "Cambia negozio" in Impostazioni.',
      );
    }

    const state = randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + OAUTH_STATE_TTL_MS);

    await this.prisma.shopifyOAuthState.create({
      data: { tenantId, state, shopDomain, expiresAt },
    });

    const params = new URLSearchParams({
      client_id: this.shopifyConfig.apiKey!,
      scope: this.shopifyConfig.scopes,
      redirect_uri: this.shopifyConfig.callbackUrl!,
      state,
    });

    return {
      authorizeUrl: `https://${shopDomain}/admin/oauth/authorize?${params.toString()}`,
    };
  }

  async handleCallback(query: Record<string, string | undefined>): Promise<string> {
    this.shopifyAdmin.assertConfigured();

    const { code, state, shop } = query;
    if (!code || !state || !shop) {
      throw new BadRequestException('Parametri OAuth mancanti');
    }

    const shopDomain = this.shopifyConfig.normalizeShopDomain(shop);
    const oauthState = await this.prisma.shopifyOAuthState.findUnique({ where: { state } });
    if (!oauthState || oauthState.expiresAt <= new Date()) {
      throw new BadRequestException('Stato OAuth non valido o scaduto');
    }
    if (oauthState.shopDomain !== shopDomain) {
      throw new BadRequestException('Dominio shop non coerente con lo stato OAuth');
    }

    const tokenResponse = await fetch(`https://${shopDomain}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: this.shopifyConfig.apiKey,
        client_secret: this.shopifyConfig.apiSecret,
        code,
      }),
    });

    if (!tokenResponse.ok) {
      throw new BadRequestException('Scambio token OAuth fallito');
    }

    const tokenJson = (await tokenResponse.json()) as {
      access_token: string;
      scope: string;
    };

    const scopesFromToken = parseShopifyScopesString(tokenJson.scope);
    let scopes: string[] = [...scopesFromToken];
    try {
      const scopesFromApi = await this.shopifyAdmin.getAccessScopes(
        shopDomain,
        tokenJson.access_token,
      );
      if (scopesFromApi.length > 0) {
        scopes = [...scopesFromApi];
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'access_scopes non disponibile';
      this.logger.warn(`OAuth Shopify: impossibile leggere access_scopes (${message})`);
    }
    const encrypted = this.shopifyCrypto.encrypt(tokenJson.access_token);
    const tenantId = oauthState.tenantId;

    const existingCredential = await this.prisma.shopifyCredential.findUnique({
      where: { tenantId },
      select: { shopDomain: true },
    });
    if (existingCredential && existingCredential.shopDomain !== shopDomain) {
      return `${this.shopifyConfig.frontendUrl}/app/settings?shopify=shop_change_blocked&from=${encodeURIComponent(existingCredential.shopDomain)}&to=${encodeURIComponent(shopDomain)}`;
    }

    await this.prisma.$transaction([
      this.prisma.shopifyCredential.upsert({
        where: { tenantId },
        update: { shopDomain, accessTokenEnc: encrypted, scopes },
        create: { tenantId, shopDomain, accessTokenEnc: encrypted, scopes },
      }),
      this.prisma.shopifyOAuthState.delete({ where: { id: oauthState.id } }),
    ]);

    const shopInfo = await this.shopifyAdmin.getShop(shopDomain, tokenJson.access_token);
    const now = new Date();

    await this.prisma.shopifyConnection.upsert({
      where: { tenantId },
      update: {
        status: ShopifyConnectionStatus.connected,
        shopDomain,
        displayName: shopInfo.name,
        apiVersion: this.shopifyConfig.apiVersion,
        scopes,
        lastConnectedAt: now,
        lastErrorMessage: null,
        lastErrorCode: null,
        lastErrorAt: null,
      },
      create: {
        tenantId,
        status: ShopifyConnectionStatus.connected,
        shopDomain,
        displayName: shopInfo.name,
        apiVersion: this.shopifyConfig.apiVersion,
        scopes,
        lastConnectedAt: now,
      },
    });

    const scopeDiagnostics = buildShopifyScopeDiagnostics(
      this.shopifyConfig.requestedScopes,
      scopes,
    );
    const catalogScopeMessage = shopifyCatalogImportBlockMessage(scopeDiagnostics);
    if (catalogScopeMessage) {
      this.logger.warn(
        `OAuth Shopify (${tenantId}): read_products assente. Richiesti=[${scopeDiagnostics.requested.join(', ')}] concessi=[${scopeDiagnostics.granted.join(', ')}]`,
      );
      await this.shopifyConnection.recordSetupWarning(
        tenantId,
        catalogScopeMessage,
        scopeDiagnostics.catalogImportBlockedReason === 'not_requested'
          ? 'oauth_scope_not_requested'
          : 'oauth_scope_not_granted',
      );
    }

    try {
      await this.syncLocations(tenantId, shopDomain, tokenJson.access_token);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Sync location fallita';
      this.logger.warn(`Shopify OAuth post-connect (location): ${message}`);
      await this.shopifyConnection.recordSetupWarning(tenantId, message, 'location_sync_failed');
    }

    // Qui la registrazione non deve interrompere la connessione: il negozio e' collegato,
    // e' solo l'automatismo che non parte. Ma non deve nemmeno sparire in silenzio — che e'
    // il difetto 2.2-bis, «un negozio puo' risultare connesso con zero webhook e nessuna
    // traccia». Quindi si prova, e se non si puo' resta scritto perche'.
    const webhookUrl = this.shopifyConfig.webhookUrl;
    if (!webhookUrl) {
      await this.shopifyConnection.recordSetupWarning(
        tenantId,
        'Aggiornamenti automatici non attivati: indirizzo webhook non configurato sul server (SHOPIFY_APP_URL).',
        'webhook_url_missing',
      );
    } else {
      try {
        await this.registerWebhooksForTenant(
          tenantId,
          shopDomain,
          tokenJson.access_token,
          webhookUrl,
        );
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Registrazione webhook fallita';
        this.logger.warn(`Shopify OAuth post-connect (webhook): ${message}`);
        await this.shopifyConnection.recordSetupWarning(
          tenantId,
          message,
          'webhook_registration_skipped',
        );
      }
    }

    return `${this.shopifyConfig.frontendUrl}/app/settings?shopify=connected`;
  }

  /**
   * Disconnettere SOSPENDE, non cancella (registro difetti 1.3).
   *
   * Fino all'08/08/2026 qui c'era una pulizia delle sedi Shopify che cancellava
   * sessioni di conteggio, giacenze, movimenti e ordini fornitore chiusi — per
   * SEDE, quindi anche di articoli nati solo in VestiFlow — e nel caso piu'
   * probabile riusciva in silenzio, archiviando la sede DOPO che quei dati
   * erano spariti. Nessun errore, nessun sintomo.
   *
   * La dipendenza da ShopifyShopChangeService e' stata rimossa apposta: cosi'
   * questo percorso non ha piu' modo di cancellare, e la stessa correzione vale
   * per le tre chiamate del wizard che passavano di qui — compresa
   * «Disconnetti senza rimuovere», che prometteva esattamente di non farlo.
   *
   * La rimozione dei dati resta possibile, ma solo dove e' dichiarata: il
   * wizard «Disconnetti e rimuovi dati», che chiede il dominio come conferma.
   */
  async disconnect(tenantId: string): Promise<void> {
    await this.revokeShopifyAccessToken(tenantId);
    await this.shopifyConnection.clearSetupStatus(tenantId);
    await this.prisma.$transaction([
      this.prisma.shopifyCredential.deleteMany({ where: { tenantId } }),
      this.prisma.shopifyConnection.updateMany({
        where: { tenantId },
        data: {
          status: ShopifyConnectionStatus.not_connected,
          shopDomain: null,
          displayName: null,
          scopes: [],
          lastConnectedAt: null,
          lastSyncAt: null,
          autoSyncEnabled: false,
          webhooksActivatedAt: null,
          webhooksActiveCount: null,
          webhookTopics: [],
          webhookAddress: null,
          webhooksCheckedAt: null,
          // Qui si azzera anche l'ultimo evento ricevuto, mentre nel semplice spegnimento
          // degli aggiornamenti automatici resta: li' e' un fatto del passato che vale
          // ancora, qui il negozio che verra' collegato dopo potrebbe essere un altro.
          lastWebhookEventAt: null,
          lastErrorMessage: null,
          lastErrorCode: null,
          lastErrorAt: null,
        },
      }),
      this.prisma.location.updateMany({
        where: { tenantId, shopifyLocationId: { not: null } },
        data: {
          shopifyLocationId: null,
          shopifySyncStatus: ShopifySyncStatus.not_connected,
          shopifyLastSyncAt: null,
          shopifyLastError: null,
        },
      }),
    ]);
  }

  async getAccessToken(tenantId: string): Promise<{ shopDomain: string; accessToken: string }> {
    const credential = await this.prisma.shopifyCredential.findUnique({ where: { tenantId } });
    if (!credential) {
      throw new NotFoundException('Shopify non connesso per questo tenant');
    }
    return {
      shopDomain: credential.shopDomain,
      accessToken: this.shopifyCrypto.decrypt(credential.accessTokenEnc),
    };
  }

  async getAccessTokenWithScopes(
    tenantId: string,
  ): Promise<{ shopDomain: string; accessToken: string; scopes: readonly string[] }> {
    const [credential, connection] = await Promise.all([
      this.prisma.shopifyCredential.findUnique({ where: { tenantId } }),
      this.prisma.shopifyConnection.findUnique({
        where: { tenantId },
        select: { scopes: true },
      }),
    ]);
    if (!credential) {
      throw new NotFoundException('Shopify non connesso per questo tenant');
    }
    return {
      shopDomain: credential.shopDomain,
      accessToken: this.shopifyCrypto.decrypt(credential.accessTokenEnc),
      scopes: mergeShopifyScopes(connection?.scopes, credential.scopes),
    };
  }

  async resolveTenantByShopDomain(shopDomain: string): Promise<string> {
    const normalized = this.shopifyConfig.normalizeShopDomain(shopDomain);
    const connection = await this.prisma.shopifyConnection.findFirst({
      where: { shopDomain: normalized },
      select: { tenantId: true },
    });
    if (!connection) {
      throw new NotFoundException('Tenant non trovato per questo shop Shopify');
    }
    return connection.tenantId;
  }

  async resyncLocations(tenantId: string): Promise<ShopifyLocationSyncResult> {
    const { shopDomain, accessToken } = await this.getAccessToken(tenantId);
    return this.syncLocations(tenantId, shopDomain, accessToken);
  }

  async resyncWebhooks(tenantId: string): Promise<ShopifyWebhookRegistrationResult> {
    const webhookUrl = this.shopifyConfig.webhookUrl;
    if (!webhookUrl) {
      throw new ServiceUnavailableException('SHOPIFY_APP_URL non configurato: webhook URL assente');
    }
    const { shopDomain, accessToken } = await this.getAccessToken(tenantId);
    return this.registerWebhooksForTenant(tenantId, shopDomain, accessToken, webhookUrl);
  }

  async disableWebhooks(
    tenantId: string,
  ): Promise<{ deletedCount: number; failed: readonly { id: number; message: string }[] }> {
    const webhookUrl = this.shopifyConfig.webhookUrl;
    if (!webhookUrl) {
      throw new ServiceUnavailableException('SHOPIFY_APP_URL non configurato: webhook URL assente');
    }

    const { shopDomain, accessToken } = await this.getAccessToken(tenantId);
    const result = await this.shopifyAdmin.deleteWebhooksForAddress(
      shopDomain,
      accessToken,
      webhookUrl,
    );

    await this.shopifyConnection.recordAutoSyncDisabled(tenantId);

    if (result.failed.length > 0) {
      const message = `Alcuni webhook non rimossi su Shopify (${result.failed.length}). La sync automatica resta disattivata in VestiFlow.`;
      await this.shopifyConnection.recordSetupWarning(tenantId, message, 'webhook_disable_partial');
    } else {
      await this.prisma.shopifyConnection.updateMany({
        where: { tenantId },
        data: {
          lastErrorMessage: null,
          lastErrorCode: null,
          lastErrorAt: null,
        },
      });
    }

    return result;
  }

  private async registerWebhooksForTenant(
    tenantId: string,
    shopDomain: string,
    accessToken: string,
    webhookUrl: string,
  ): Promise<ShopifyWebhookRegistrationResult> {
    // ⛔ La guardia sta QUI perche' qui passano tutte e tre le strade — OAuth iniziale,
    // interruttore «Attiva aggiornamenti automatici», riparazione dei mancanti — e il
    // pericolo e' comune a tutte: si registra verso l'indirizzo dell'AMBIENTE DA CUI PARTE
    // la chiamata, non verso quello del negozio.
    //
    // Da una macchina di sviluppo quel valore e' `http://localhost:3000/...`, ereditato dal
    // modello `.env.example`. Registrarci sopra crea sottoscrizioni che non consegneranno
    // mai, sul negozio reale del cliente — e siccome la deduplica confronta gli indirizzi
    // per uguaglianza esatta, si SOMMANO a quelle buone invece di sostituirle.
    //
    // Nasconderlo dietro la visibilita' di un pulsante non basterebbe: si corregge dove il
    // comportamento accade, non dove si vede. Chi sviluppa con ngrok o cloudflared ha un
    // indirizzo pubblico in HTTPS e passa: si esclude cio' che non e' un riferimento, non
    // cio' che e' insolito. Vedi registro 1.7.
    if (!isShopifyDeliverableAddress(webhookUrl)) {
      throw new ServiceUnavailableException(
        `Impossibile registrare le notifiche: ${webhookUrl} non è un indirizzo a cui Shopify possa consegnare. Serve un indirizzo pubblico in HTTPS (in sviluppo, un tunnel tipo ngrok).`,
      );
    }

    const result = await this.shopifyAdmin.registerWebhooks(shopDomain, accessToken, webhookUrl);

    // Attivi = creati adesso PIU' quelli che c'erano gia'. Il conteggio fondeva le due cose
    // in un numero solo e i falliti non ci entravano affatto: «7» poteva descrivere sette
    // insiemi diversi. L'elenco li rende tutti visibili, per differenza dagli attesi.
    const activeTopics = [...result.registered, ...result.skipped];
    if (activeTopics.length > 0) {
      await this.shopifyConnection.recordWebhooksActivated(tenantId, {
        topics: activeTopics,
        address: webhookUrl,
      });
    }
    const warning = this.formatWebhookRegistrationWarning(result);

    if (warning) {
      this.logger.warn(`Shopify webhook registration (${tenantId}): ${warning.message}`);
      await this.shopifyConnection.recordSetupWarning(tenantId, warning.message, warning.code);
    } else {
      await this.prisma.shopifyConnection.updateMany({
        where: { tenantId },
        data: {
          lastErrorMessage: null,
          lastErrorCode: null,
          lastErrorAt: null,
        },
      });
      await this.shopifyConnection.healStaleErrorStatus(tenantId);
    }

    return result;
  }

  private formatWebhookRegistrationWarning(
    result: ShopifyWebhookRegistrationResult,
  ): { message: string; code: string } | null {
    if (result.failed.length === 0) {
      return null;
    }

    const protectedFailed = result.failed.filter((entry) =>
      SHOPIFY_PROTECTED_WEBHOOK_TOPICS.has(entry.topic),
    );
    const inventoryOk =
      result.registered.includes('inventory_levels/update') ||
      result.skipped.includes('inventory_levels/update');

    if (protectedFailed.length > 0 && inventoryOk) {
      return {
        code: 'webhook_partial_registration',
        message:
          'Webhook giacenze attivo. Ordini e clienti richiedono permesso Protected customer data su Shopify Partners (app VestiFlow): riconnetti dopo averlo abilitato.',
      };
    }

    if (protectedFailed.length > 0) {
      return {
        code: 'webhook_registration_failed',
        message:
          'Webhook ordini/clienti non registrati: Shopify richiede Protected customer data sull’app VestiFlow. Giacenze non ancora attive: verifica SHOPIFY_APP_URL su Railway.',
      };
    }

    const detail = result.failed.map((entry) => entry.topic).join(', ');
    return {
      code: 'webhook_registration_failed',
      message: `Registrazione webhook fallita per: ${detail}.`,
    };
  }

  private syncLocations(
    tenantId: string,
    shopDomain: string,
    accessToken: string,
  ): Promise<ShopifyLocationSyncResult> {
    return this.shopifyLocationSync.syncFromShopify(tenantId, shopDomain, accessToken);
  }

  /** Revoca il token OAuth su Shopify così la riconnessione richiede tutti gli scope aggiornati. */
  private async revokeShopifyAccessToken(tenantId: string): Promise<void> {
    const credential = await this.prisma.shopifyCredential.findUnique({ where: { tenantId } });
    if (!credential) {
      return;
    }

    const apiKey = this.shopifyConfig.apiKey;
    const apiSecret = this.shopifyConfig.apiSecret;
    if (!apiKey || !apiSecret) {
      return;
    }

    try {
      const accessToken = this.shopifyCrypto.decrypt(credential.accessTokenEnc);
      const response = await fetch(`https://${credential.shopDomain}/admin/oauth/revoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: apiKey,
          client_secret: apiSecret,
          token: accessToken,
        }),
      });
      if (!response.ok) {
        this.logger.warn(
          `Revoca token Shopify non riuscita (${tenantId}, HTTP ${response.status}): la riconnessione potrebbe riusare permessi obsoleti`,
        );
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'revoke fallita';
      this.logger.warn(`Revoca token Shopify ignorata (${tenantId}): ${message}`);
    }
  }
}
