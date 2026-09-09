import {
  BadRequestException,
  ConflictException,
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
import { ShopifyGraphqlClient } from './shopify-graphql.client';
import {
  conflittoDiConcorrenza,
  ShopifyShopIdentityService,
  type EsitoIdentitaNegozio,
} from './shopify-shop-identity.service';
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
    private readonly shopifyGraphql: ShopifyGraphqlClient,
    private readonly shopIdentity: ShopifyShopIdentityService,
  ) {}

  /**
   * L'indirizzo di rifiuto che corrisponde all'esito dell'identita'.
   *
   * ⭐ **Si legge DOPO il rollback**: l'esito viene deciso dentro la
   *    transazione, ma la risposta si compone fuori — quando si e' certi che
   *    non sia rimasto niente scritto.
   */
  private rifiutoDaEsito(esito: EsitoIdentitaNegozio | null, shopDomain: string): string | null {
    const base = `${this.shopifyConfig.frontendUrl}/app/settings?shopify=`;
    const negozio = encodeURIComponent(shopDomain);
    switch (esito?.tipo) {
      case 'rivendicato_altrove':
        // ⛔ §8.5.1: lo stesso negozio non puo' appartenere a due aziende.
        return `${base}shop_owned_elsewhere&shop=${negozio}`;
      case 'negozio_diverso':
        // ⛔ Il cambio negozio ha una transazione sua (§8.5.1): non e' qui.
        return `${base}shop_change_blocked&from=${negozio}&to=${negozio}`;
      case 'non_acquisita':
        return `${base}shop_identity_unavailable&shop=${negozio}`;
      default:
        return null;
    }
  }

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

    // ── Il PROFILO CANALE, prima di qualunque chiamata a Shopify ────────────
    //
    // ⛔ **Il controllo c'era solo in `beginAuth`**, e fra i due passaggi resta
    //    una finestra: il cambio profilo e' consentito finche' non c'e' una
    //    connessione attiva, quindi uno stato OAuth pendente sopravviveva al
    //    passaggio a `gestionale` e il collegamento si completava lo stesso.
    //    Misurato l'08/09/2026 (`DA-FARE` §23), corretto lo stesso giorno.
    //
    // ⭐ **La regola e' la stessa di `beginAuth`**, non una seconda copia: e' la
    //    ragione per cui il messaggio e i casi coperti restano allineati.
    //
    // ⚠️ **Qui si RISPONDE, non si lancia**: il callback torna dal browser di
    //    Shopify, e un 400 crudo lascerebbe l'utente su una pagina d'errore
    //    invece che nelle Impostazioni con un motivo leggibile.
    // ⛔ **Si cattura la DECISIONE, non il guasto** — corretto dopo che il
    //    proprietario l'ha rilevato leggendo il codice. Qui c'era un `catch`
    //    nudo: una lettura fallita per una ragione TECNICA — connessione persa,
    //    timeout, driver — diventava «canale non abilitato», cioe' una risposta
    //    di dominio falsa che nascondeva un guasto vero. E chi la leggeva
    //    andava a cercare il profilo del cliente invece del database.
    //
    // ⭐ La discriminante e' il TIPO: `assertTenantChannelProfile` esprime le
    //    proprie decisioni con `BadRequestException`; qualunque altra cosa non
    //    e' una decisione, e deve risalire con la sua causa intatta.
    try {
      await assertTenantChannelProfile(
        this.prisma,
        oauthState.tenantId,
        TenantChannelProfile.shopify,
      );
    } catch (errore: unknown) {
      if (!(errore instanceof BadRequestException)) {
        this.logger.error(
          `OAuth Shopify (${oauthState.tenantId}): lettura del profilo canale fallita per un ` +
            'motivo tecnico. Il collegamento non prosegue, e l errore non viene mascherato.',
        );
        throw errore;
      }
      this.logger.warn(
        `OAuth Shopify (${oauthState.tenantId}): profilo canale non abilitato a Shopify. ` +
          'Collegamento rifiutato prima di qualunque chiamata al canale.',
      );
      return `${this.shopifyConfig.frontendUrl}/app/settings?shopify=channel_not_enabled&shop=${encodeURIComponent(shopDomain)}`;
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

    // ── L'IDENTITA' del negozio, PRIMA di scrivere qualunque cosa ────────────
    //
    // ⭐ **Prima, e non dopo** (fase 2 di §8.5.8): se il negozio risulta gia'
    //    collegato a un'altra azienda, la connessione va rifiutata SENZA aver
    //    lasciato una credenziale e senza aver consumato lo stato OAuth. Letta
    //    dopo, il rifiuto arriverebbe a cose fatte.
    //
    // ⛔ **UNA CONNESSIONE NUOVA NON DIVENTA OPERATIVA SENZA IDENTITA'
    //    VERIFICATA** — corretto l'08/09/2026, ed era un buco vero.
    //
    //    Qui c'era scritto «una lettura fallita NON blocca la connessione: si
    //    collega e si avvisa». Ma con l'identita' non leggibile `registra` non
    //    veniva chiamata affatto, e con lei spariva **il controllo di
    //    appartenenza**: un'azienda poteva collegare un negozio gia' di
    //    un'altra semplicemente perche' la lettura falliva. E l'avviso
    //    prometteva una sospensione che nessun percorso di sincronizzazione
    //    applicava — import ed export guardano connessione e permessi, non
    //    quell'avviso.
    //
    // ⚠️ **Tollerare i dati PREESISTENTI non e' autorizzare connessioni nuove**,
    //    ed e' la distinzione che tiene in piedi la gradualita': una
    //    connessione legacy senza `shop_id` continua a funzionare — nessuno la
    //    tocca — ma un tentativo NUOVO senza identita' verificata si rifiuta.
    //    Il rifiuto non altera in alcun modo la connessione precedente.
    let identita: { readonly shopGid: string; readonly myshopifyDomain: string | null };
    try {
      identita = await this.shopifyGraphql.getShopIdentity(shopDomain, tokenJson.access_token);
    } catch (error: unknown) {
      const motivo = error instanceof Error ? error.message : 'lettura identita fallita';
      this.logger.warn(
        `OAuth Shopify (${tenantId}): identita negozio non leggibile — ${motivo}. Connessione rifiutata.`,
      );
      return `${this.shopifyConfig.frontendUrl}/app/settings?shopify=shop_identity_unavailable&shop=${encodeURIComponent(shopDomain)}`;
    }

    // ⚠️ **Le chiamate remote sono FINITE**: da qui in poi si scrive soltanto.
    //    L'ultima sta prima della transazione perche' una chiamata dentro una
    //    transazione la terrebbe aperta sul tempo della rete.
    const shopInfo = await this.shopifyAdmin.getShop(shopDomain, tokenJson.access_token);
    const now = new Date();

    // ── UNA transazione sola: IDENTITA', credenziale, connessione e stato ────
    //
    // ⛔ **Erano scritture separate, e l'identita' stava fuori.** Un fallimento
    //    lasciava la riga di `shopify_shops` in piedi, e un tentativo incompleto
    //    del tenant A **respingeva il tenant B** che quel negozio lo possiede
    //    davvero (§22). Ora o si scrive tutto, o non si scrive niente.
    //
    // ⭐ `Serializable`, e la scelta e' MISURATA (195 coppie concorrenti sul
    //    database di prova, 08/09/2026): con `ReadCommitted` due collegamenti
    //    dello stesso tenant a negozi diversi riuscivano ENTRAMBI, e uno dei
    //    due «connesso» era falso.
    let esito: EsitoIdentitaNegozio | null = null;
    // ⚠️ Il conflitto sul DOMINIO della credenziale non porta un codice: e' una
    //    `ConflictException` nostra, e va distinta dalle altre — riconoscerla
    //    dalla classe le comprenderebbe tutte, comprese quelle future.
    let conflittoDominio = false;
    /** Il profilo canale e' cambiato mentre il collegamento era in corso. */
    let profiloNonAbilitato = false;
    try {
      await this.prisma.$transaction(
        async (tx) => {
          // ⛔ **Il profilo si rilegge QUI DENTRO**, e non e' una ripetizione
          //    inutile: fra il controllo di prima e questa transazione ci sono
          //    due chiamate remote, cioe' tutto il tempo che serve al titolare
          //    per passare a `gestionale`.
          //
          // ⛔ **E si BLOCCA la riga, perche' `Serializable` qui NON basta.**
          //    Avevo scritto che la lettura serializzabile vale da
          //    prenotazione: e' falso, e la prova `K7e` l'ha dimostrato al
          //    primo giro — la protezione SSI di PostgreSQL vale solo fra
          //    transazioni **entrambe** serializzabili, e un `UPDATE` singolo
          //    non lo e'. Il collegamento si completava lo stesso.
          //
          // ⭐ `FOR UPDATE` invece blocca chiunque, a qualunque isolamento: se
          //    il cambio profilo arriva prima, qui si legge `gestionale` e si
          //    rifiuta; se arriva dopo, aspetta questo commit e trova una
          //    connessione attiva — che e' esattamente il caso che
          //    `assertTenantChannelProfileChangeAllowed` rifiuta.
          await tx.$queryRawUnsafe(
            `SELECT channel_profile FROM tenants WHERE id = $1::uuid FOR UPDATE`,
            tenantId,
          );
          try {
            await assertTenantChannelProfile(
              tx as unknown as PrismaService,
              tenantId,
              TenantChannelProfile.shopify,
            );
          } catch (errore: unknown) {
            // ⛔ Stessa disciplina del controllo iniziale: il flag si alza solo
            //    per una DECISIONE della regola. Un guasto tecnico qui dentro
            //    deve uscire come guasto — non come «canale non abilitato».
            profiloNonAbilitato = errore instanceof BadRequestException;
            throw errore;
          }

          esito = await this.shopIdentity.registra(tx, tenantId, identita);
          if (esito.tipo !== 'registrata') {
            // ⛔ Si esce ANNULLANDO: un rifiuto non deve lasciare la riga del
            //    negozio scritta un istante prima.
            throw new ConflictException(`identita non registrata: ${esito.tipo}`);
          }
          const shopId = esito.shopId;

          const credenziale = await tx.shopifyCredential.findUnique({
            where: { tenantId },
            select: { shopDomain: true },
          });
          if (credenziale && credenziale.shopDomain !== shopDomain) {
            // ⭐ Il cambio negozio e' gia' stato rifiutato PRIMA della
            //    transazione (`shop_change_blocked`): se una credenziale su un
            //    altro dominio compare QUI, e' comparsa nel frattempo — cioe'
            //    un secondo collegamento dello stesso tenant, simultaneo.
            conflittoDominio = true;
            throw new ConflictException('Connessione a un altro negozio gia` in corso');
          }

          await tx.shopifyCredential.upsert({
            where: { tenantId },
            update: { shopDomain, accessTokenEnc: encrypted, scopes },
            create: { tenantId, shopDomain, accessTokenEnc: encrypted, scopes },
          });
          await tx.shopifyConnection.upsert({
            where: { tenantId },
            update: {
              status: ShopifyConnectionStatus.connected,
              shopDomain,
              shopId,
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
              shopId,
              displayName: shopInfo.name,
              apiVersion: this.shopifyConfig.apiVersion,
              scopes,
              lastConnectedAt: now,
            },
          });
          await tx.shopifyOAuthState.delete({ where: { id: oauthState.id } });
        },
        { isolationLevel: 'Serializable' },
      );
    } catch (errore: unknown) {
      // ── Il rollback e' gia' avvenuto: qui si decide COSA DIRE ─────────────
      if (profiloNonAbilitato) {
        // ⛔ Il profilo e' passato a solo gestionale mentre il collegamento era
        //    in corso: la transazione e` rotolata indietro per intero, quindi
        //    non esiste nessuna connessione nuova su un tenant `gestionale`.
        this.logger.warn(
          `OAuth Shopify (${tenantId}): profilo canale non abilitato a Shopify al momento ` +
            'del salvataggio. Collegamento annullato per intero.',
        );
        return `${this.shopifyConfig.frontendUrl}/app/settings?shopify=channel_not_enabled&shop=${encodeURIComponent(shopDomain)}`;
      }
      const rifiuto = this.rifiutoDaEsito(esito, shopDomain);
      if (rifiuto) {
        return rifiuto;
      }
      if (conflittoDominio || conflittoDiConcorrenza(errore)) {
        // ⭐ Conflitto fra collegamenti simultanei: nulla e' stato scritto, e un
        //    secondo tentativo puo' riuscire. I codici sono TRE (P2034, 40001,
        //    23505), misurati — non uno solo, come avevo assunto.
        this.logger.warn(
          `OAuth Shopify (${tenantId}): collegamento in conflitto con un altro tentativo simultaneo. Nulla e' stato scritto.`,
        );
        return `${this.shopifyConfig.frontendUrl}/app/settings?shopify=connection_conflict&shop=${encodeURIComponent(shopDomain)}`;
      }
      throw errore;
    }

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
